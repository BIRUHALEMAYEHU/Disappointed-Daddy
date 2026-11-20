/**
 * Adapter for OpenAI-compatible Chat Completions APIs (OpenAI, Gemini, OpenRouter, DeepSeek, Groq…).
 * The interview engine keeps its history in Anthropic's message format; this module translates that
 * history and the tools to Chat Completions, streams the reply, and translates it back.
 * Uses fetch directly so every compatible provider works the same way.
 */
import type Anthropic from "@anthropic-ai/sdk";

type Block = Record<string, unknown> & { type: string };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface ChatTool {
  type: "function";
  function: { name: string; description?: string; parameters: unknown };
}

export function toChatTools(tools: Anthropic.Beta.BetaTool[]): ChatTool[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b === "object" && (b as Block).type === "text" ? String((b as Block).text ?? "") : "")).join("");
  }
  return "";
};

/** Anthropic-format system blocks + history → Chat Completions messages. Thinking blocks are dropped. */
export function toChatMessages(system: Array<{ text: string }>, history: Anthropic.Beta.BetaMessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system.map((s) => s.text).join("\n\n") }];
  for (const msg of history) {
    if (typeof msg.content === "string") {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }
    const blocks = msg.content as unknown as Block[];
    if (msg.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      const calls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id), type: "function" as const, function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || (calls.length ? null : ""), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // A user turn may hold tool results (one "tool" message each) and/or plain text.
      for (const b of blocks) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: textOf(b.content) || "(empty)" });
      }
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

/** Accumulates streamed Chat Completions chunks into one Anthropic-shaped message. */
export class ChatAccumulator {
  text = "";
  private calls: Array<{ id: string; name: string; args: string }> = [];
  finishReason: string | null = null;
  model = "";
  usage = { input_tokens: 0, output_tokens: 0 };

  /** Feeds one parsed chunk; returns any new text so it can be streamed to the user. */
  add(chunk: {
    model?: string;
    choices?: Array<{
      index?: number;
      delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  }): string {
    if (chunk.model) this.model = chunk.model;
    if (chunk.usage) {
      this.usage = { input_tokens: chunk.usage.prompt_tokens ?? 0, output_tokens: chunk.usage.completion_tokens ?? 0 };
    }
    const choice = chunk.choices?.[0];
    if (!choice) return "";
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const delta = choice.delta ?? {};
    for (const [i, tc] of (delta.tool_calls ?? []).entries()) {
      const idx = tc.index ?? i;
      const slot = (this.calls[idx] ??= { id: "", name: "", args: "" });
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name += tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
    }
    const piece = delta.content ?? "";
    this.text += piece;
    return piece;
  }

  /** The reply as an Anthropic-format message the engine can store and act on. */
  toMessage(): Anthropic.Beta.BetaMessage {
    const content: Block[] = [];
    if (this.text) content.push({ type: "text", text: this.text, citations: null });
    this.calls.forEach((c, i) => {
      if (!c || !c.name) return;
      let input: unknown = {};
      try {
        input = c.args ? JSON.parse(c.args) : {};
      } catch {
        input = { __invalid_json: c.args };
      }
      content.push({ type: "tool_use", id: c.id || `call_${i}`, name: c.name, input });
    });
    const hasTools = content.some((b) => b.type === "tool_use");
    const stop = hasTools ? "tool_use" : this.finishReason === "length" ? "max_tokens" : "end_turn";
    return {
      id: "chat",
      type: "message",
      role: "assistant",
      model: this.model,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: { ...this.usage, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    } as unknown as Anthropic.Beta.BetaMessage;
  }
}

export class ProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Statuses that mean "busy or temporarily broken": worth trying the next fallback model. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Streams one Chat Completions request with the same small surface as the Anthropic SDK stream.
 * `fallbackModels` are tried in order when a model is busy (e.g. Gemini's "high demand" 503), but only
 * before any text has streamed, so a reply never mixes two models.
 */
export function streamChat(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  messages: ChatMessage[];
  tools: ChatTool[];
}) {
  const listeners: Array<(delta: string) => void> = [];
  const acc = new ChatAccumulator();

  const open = async (model: string) => {
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model, messages: opts.messages, tools: opts.tools, tool_choice: "auto", stream: true }),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | Array<{ error?: { message?: string } }> | null;
      const detail = Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
      throw new ProviderError(res.status, detail || `The AI provider returned an error (${res.status}).`);
    }
    return res;
  };

  const done = (async () => {
    const models = [opts.model, ...(opts.fallbackModels ?? [])];
    let res: Response | undefined;
    for (const [i, model] of models.entries()) {
      try {
        res = await open(model);
        break;
      } catch (err) {
        const last = i === models.length - 1;
        if (last || !(err instanceof ProviderError) || !RETRYABLE.has(err.status)) throw err;
      }
    }
    const reader = res!.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "").trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const piece = acc.add(JSON.parse(data));
          if (piece) for (const l of listeners) l(piece);
        } catch {
          /* ignore malformed keep-alive lines */
        }
      }
    }
    return acc.toMessage();
  })();

  return {
    on(_event: "text", listener: (delta: string) => void) {
      listeners.push(listener);
      return this;
    },
    finalMessage: () => done,
  };
}
