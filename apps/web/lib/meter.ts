import type { Usage } from "./pricing";

/**
 * Passes a Messages API server-sent-event stream through unchanged while reading its token usage:
 * `message_start` carries the input-side usage and the model, `message_delta` the final output tokens.
 * `onDone` runs exactly once, when the stream ends or the client disconnects (charging what was produced).
 */
export function meterSse(
  upstream: ReadableStream<Uint8Array>,
  onDone: (usage: Usage, model: string | null) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const usage: Usage = {};
  let model: string | null = null;
  let buffer = "";
  let finished = false;

  const absorb = (line: string) => {
    if (!line.startsWith("data:")) return;
    try {
      const event = JSON.parse(line.slice(5).trim()) as {
        type?: string;
        message?: { model?: string; usage?: Usage };
        usage?: Usage;
      };
      const u = event.type === "message_start" ? event.message?.usage : event.type === "message_delta" ? event.usage : undefined;
      if (event.type === "message_start" && event.message?.model) model = event.message.model;
      if (u) {
        // Later events report cumulative totals, so keep the latest value of each field.
        for (const k of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"] as const) {
          if (typeof u[k] === "number") usage[k] = u[k];
        }
      }
    } catch {
      /* not JSON (ping etc.): ignore */
    }
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    await onDone(usage, model).catch((err) => console.error("usage metering failed", err instanceof Error ? err.message : err));
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        await finish();
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        absorb(buffer.slice(0, nl).replace(/\r$/, ""));
        buffer = buffer.slice(nl + 1);
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      await finish();
    },
  });
}
