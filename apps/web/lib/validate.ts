import { buildSystemPrompt, TOOLS } from "@disappointed-dad/core";

export const MAX_BODY_BYTES = 1_500_000;
const MAX_MESSAGES = 300;
const GENUINE_PROMPTS = new Set([buildSystemPrompt("dad"), buildSystemPrompt("daddy")]);
const TOOL_NAMES = TOOLS.map((t) => t.name).sort().join(",");

/**
 * Checks that a request really is a Disappointed Dad interview, so the free tier can't be used
 * as a general-purpose Claude proxy. Returns a problem description, or null if it's fine.
 */
export function problemWith(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Body must be a JSON object.";
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return "Invalid messages.";
  if (!Array.isArray(b.system) || b.system.length !== 2) return "Not a Disappointed Dad session.";
  const [prompt, snapshot] = b.system as Array<{ type?: unknown; text?: unknown }>;
  if (prompt?.type !== "text" || typeof prompt.text !== "string" || !GENUINE_PROMPTS.has(prompt.text)) {
    return "Not a Disappointed Dad session (update the CLI: npm i -g disappointed-dad).";
  }
  if (snapshot?.type !== "text" || typeof snapshot.text !== "string" || !snapshot.text.startsWith("# Project snapshot:")) {
    return "Not a Disappointed Dad session.";
  }
  const names = Array.isArray(b.tools) ? (b.tools as Array<{ name?: unknown }>).map((t) => String(t?.name)).sort().join(",") : "";
  if (names !== TOOL_NAMES) return "Not a Disappointed Dad session.";
  return null;
}
