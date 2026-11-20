import Anthropic from "@anthropic-ai/sdk";
import { buildKickoff, buildSystemPrompt, type Mode } from "./prompts.js";
import {
  FileProgressStore, recordMock, recordVerdict, reviewQueue, summarizeProgress,
  type Progress, type ProgressStore, type Status,
} from "./progress.js";
import { buildSnapshot, commitForModel, FsSource, readForModel, type RepoSnapshot, type RepoSource } from "./scanner.js";
import type { Voice } from "./voices.js";
import { streamChat, toChatMessages, toChatTools } from "./openai.js";
import { PROVIDERS, type ProviderId } from "./providers.js";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_LOCAL_MODEL = "gpt-oss:20b";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * "anthropic" = Claude API with the user's key (or, on the web server, the server's key).
 * "ollama"    = a local model; nothing leaves the machine.
 * "hosted"    = Dad Pro on the Disappointed Dad server (it holds the key; snippets pass through it, never stored).
 * "openai-compatible" = the user's own key for an OpenAI-compatible provider (OpenAI, Gemini, OpenRouter…),
 *               chosen with `providerId`.
 */
export type Provider = "anthropic" | "ollama" | "hosted" | "openai-compatible";

export type History = Anthropic.Beta.BetaMessageParam[];

/** Server-side refusal fallbacks exist for Opus/Sonnet/Fable models, not Haiku. */
export const supportsFallbacks = (model: string) => !/haiku/i.test(model);

export interface SessionOptions {
  mode: Mode;
  voice: Voice;
  /** Where the code comes from. Defaults to the folder `root`. */
  source?: RepoSource;
  root?: string;
  /** Where grades are saved. Defaults to `<root>/.disappointed-dad/progress.json`. */
  progressStore?: ProgressStore;
  /** Resume an earlier conversation (the web app keeps it in the browser between requests). */
  history?: History;
  /** Reuse a snapshot built earlier (the web app caches it). */
  snapshot?: RepoSnapshot;
  provider?: Provider;
  /** Which OpenAI-compatible provider, when provider = "openai-compatible". */
  providerId?: ProviderId;
  ollamaUrl?: string;
  serverUrl?: string;
  hostedToken?: string;
  /** Dad Pro model routing (hosted only): "auto" (default), "max" or "economy". */
  proMode?: "auto" | "max" | "economy";
  topic?: string;
  hard?: boolean;
  endless?: boolean;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  apiKey?: string;
}

export interface SessionHandlers {
  onText: (delta: string) => void;
  onToolUse?: (name: string, detail: string) => void;
  onNotice?: (message: string) => void;
  onProgressCreated?: (where: string) => void;
  /** Called after every model response with its token usage (used to meter hosted usage). */
  onUsage?: (usage: Anthropic.Beta.BetaUsage | Anthropic.Usage, model: string) => void | Promise<void>;
}

/** The interviewer's tools. Exported so the hosted proxy can verify requests use exactly these. */
export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "read_file",
    description: "Read one file from the user's project (path relative to the project root). Secrets, .env files and ignored folders are refused.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative path, e.g. src/routes/auth.ts" } },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "show_commit",
    description: "Show one git commit: message, changed files and a capped diff.",
    input_schema: {
      type: "object",
      properties: { hash: { type: "string", description: "Short or full commit hash from the history" } },
      required: ["hash"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "record_verdict",
    description: "Save the grade for one design decision to the user's progress. Call once per graded decision.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short stable name, e.g. 'Auth middleware'" },
        status: { type: "string", enum: ["solid", "partial", "weak"] },
        files: { type: "array", items: { type: "string" } },
        notes: { type: "string", description: "One line: what they got right or missed" },
      },
      required: ["topic", "status", "files", "notes"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "record_mock_score",
    description: "Save the final score of a sit-down mock interview.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "integer", description: "Total out of 10" },
        weakest: { type: "string", description: "Weakest area" },
      },
      required: ["score", "weakest"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const str = (v: unknown): v is string => typeof v === "string";

export class InterviewSession {
  private readonly local: boolean;
  private readonly system: Anthropic.Beta.BetaTextBlockParam[];
  private readonly kickoff: string;

  private constructor(
    private readonly opts: SessionOptions,
    /** Anthropic SDK client; null for OpenAI-compatible providers. */
    private readonly client: Anthropic | null,
    private readonly source: RepoSource,
    private readonly store: ProgressStore,
    readonly snapshot: RepoSnapshot,
    readonly progress: Progress,
    private readonly messages: History,
  ) {
    this.local = opts.provider === "ollama";
    // Both system blocks stay identical for the whole session so the prompt cache keeps hitting.
    this.system = [
      { type: "text", text: buildSystemPrompt(opts.voice) },
      { type: "text", text: `# Project snapshot: ${snapshot.name}\n\n${snapshot.text}` },
    ];
    this.kickoff = buildKickoff({
      mode: opts.mode,
      topic: opts.topic,
      hard: opts.hard,
      endless: opts.endless,
      progressSummary: summarizeProgress(progress),
      reviewTopics: reviewQueue(progress),
    });
  }

  static async create(opts: SessionOptions): Promise<InterviewSession> {
    const source = opts.source ?? new FsSource(opts.root ?? process.cwd());
    const store = opts.progressStore ?? new FileProgressStore(opts.root ?? process.cwd());
    const local = opts.provider === "ollama";

    let client: Anthropic | null;
    if (opts.provider === "openai-compatible") {
      const preset = opts.providerId ? PROVIDERS[opts.providerId] : undefined;
      if (!preset || preset.kind !== "openai" || !preset.baseUrl) throw new Error("Choose a supported AI provider.");
      if (!opts.apiKey) throw new Error(`Add your ${preset.label} API key first.`);
      if (!(opts.model ?? preset.defaultModel)) throw new Error(`Choose a ${preset.label} model (e.g. from ${preset.keyUrl.split("/").slice(0, 3).join("/")}).`);
      client = null;
    } else if (local) {
      // Ollama serves an Anthropic-compatible Messages API; the token is a placeholder it ignores.
      client = new Anthropic({ baseURL: opts.ollamaUrl ?? DEFAULT_OLLAMA_URL, apiKey: "ollama" });
    } else if (opts.provider === "hosted") {
      if (!opts.serverUrl || !opts.hostedToken) throw new Error("Hosted mode needs you to sign in first: dad login");
      // The proxy speaks the Messages API, so the normal SDK works against it with a bearer token.
      client = new Anthropic({
        baseURL: `${opts.serverUrl.replace(/\/$/, "")}/api/proxy`,
        apiKey: null,
        authToken: opts.hostedToken,
        defaultHeaders: opts.proMode ? { "x-dad-pro-mode": opts.proMode } : undefined,
      });
    } else {
      client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
    }

    // Local models usually have much smaller context windows, so send a smaller snapshot.
    const snapshot = opts.snapshot ?? (await buildSnapshot(source, { maxChars: local ? 20_000 : undefined }));
    const progress = await store.load();
    return new InterviewSession(opts, client, source, store, snapshot, progress, [...(opts.history ?? [])]);
  }

  /** The conversation so far (to resume later with `history`). */
  get history(): History {
    return this.messages;
  }

  /** Starts the interview. The kickoff message is hidden from the user. */
  start(h: SessionHandlers) {
    return this.send(this.kickoff, h);
  }

  /** Sends one user message and runs the model (and any tool calls) until it replies. */
  async send(text: string, h: SessionHandlers): Promise<void> {
    const startLength = this.messages.length;
    this.messages.push({ role: "user", content: text });

    for (let step = 0; step < 15; step++) {
      const stream = this.createStream();
      stream.on("text", (delta: string) => h.onText(delta));
      const message = (await stream.finalMessage()) as Anthropic.Beta.BetaMessage;
      await h.onUsage?.(message.usage, message.model);

      if (message.stop_reason === "refusal") {
        // Drop this exchange so the conversation can continue cleanly.
        this.messages.length = startLength;
        h.onNotice?.("The model declined that one. Try rephrasing, or type /skip.");
        return;
      }

      this.messages.push({ role: "assistant", content: message.content });
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) return;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of toolUses) {
        const { content, isError } = await this.runTool(block, h);
        results.push({ type: "tool_result", tool_use_id: block.id, content, is_error: isError });
      }
      this.messages.push({ role: "user", content: results });
    }
    h.onNotice?.("Dad got lost in your codebase. Say something to continue.");
  }

  /** The two SDK stream classes share this surface; narrowing to it lets both providers use one loop. */
  private createStream(): {
    on(event: "text", listener: (delta: string) => void): unknown;
    finalMessage(): Promise<Anthropic.Beta.BetaMessage | Anthropic.Message>;
  } {
    if (this.opts.provider === "openai-compatible") {
      const preset = PROVIDERS[this.opts.providerId!];
      return streamChat({
        baseUrl: preset.baseUrl!,
        apiKey: this.opts.apiKey!,
        model: (this.opts.model ?? preset.defaultModel)!,
        messages: toChatMessages(this.system, this.messages),
        tools: toChatTools(TOOLS),
      });
    }
    const client = this.client!;
    if (this.local) {
      // Plain Messages API only: Ollama doesn't implement betas, fallbacks, effort, caching or strict tools.
      return client.messages.stream({
        model: this.opts.model ?? DEFAULT_LOCAL_MODEL,
        max_tokens: 8192,
        system: this.system as Anthropic.TextBlockParam[],
        tools: TOOLS.map(({ strict: _strict, ...tool }) => tool) as Anthropic.Tool[],
        messages: this.messages as Anthropic.MessageParam[],
      });
    }
    const model = this.opts.model ?? DEFAULT_MODEL;
    return client.beta.messages.stream({
      model,
      max_tokens: 64000,
      // Haiku has no server-side refusal fallback; sending the option there would be rejected.
      ...(supportsFallbacks(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: this.opts.effort ?? "medium" },
      cache_control: { type: "ephemeral" },
      system: this.system,
      tools: TOOLS,
      messages: this.messages,
    });
  }

  private async runTool(block: Anthropic.Beta.BetaToolUseBlock, h: SessionHandlers): Promise<{ content: string; isError: boolean }> {
    const input = (block.input ?? {}) as Record<string, unknown>;
    const bad = (msg: string) => ({ content: `Invalid input: ${msg}`, isError: true });

    switch (block.name) {
      case "read_file": {
        if (!str(input.path)) return bad("path must be a string");
        h.onToolUse?.("read", input.path);
        return { content: await readForModel(this.source, input.path), isError: false };
      }
      case "show_commit": {
        if (!str(input.hash)) return bad("hash must be a string");
        h.onToolUse?.("commit", input.hash);
        return { content: await commitForModel(this.source, input.hash), isError: false };
      }
      case "record_verdict": {
        const { topic, status, files, notes } = input;
        if (!str(topic) || !str(notes) || !["solid", "partial", "weak"].includes(status as string)) return bad("topic/status/notes");
        const fileList = Array.isArray(files) ? files.filter(str) : [];
        recordVerdict(this.progress, topic, status as Status, fileList, notes);
        await this.persist(h);
        return { content: "Saved.", isError: false };
      }
      case "record_mock_score": {
        const { score, weakest } = input;
        if (typeof score !== "number" || score < 0 || score > 10 || !str(weakest)) return bad("score 0-10 and weakest");
        recordMock(this.progress, Math.round(score), weakest);
        await this.persist(h);
        return { content: "Saved.", isError: false };
      }
      default:
        return { content: `Unknown tool ${block.name}`, isError: true };
    }
  }

  private async persist(h: SessionHandlers) {
    if (await this.store.save(this.progress)) h.onProgressCreated?.(".disappointed-dad/");
  }
}
