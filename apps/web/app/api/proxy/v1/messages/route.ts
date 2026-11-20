import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "@disappointed-dad/core";
import { isPro, userFromBearer } from "@/lib/auth";
import { incrementUsage } from "@/lib/db";
import { env, hostedModel, PRO_REQUIRED, proDailyRequests } from "@/lib/env";
import { apiError } from "@/lib/errors";
import { MAX_BODY_BYTES, problemWith } from "@/lib/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Dad Pro: hosted model for paying accounts. Speaks the Messages API so the CLI's normal SDK works against it.
 * Privacy: request and response bodies are streamed through and never logged or stored.
 */
export async function POST(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return apiError(401, "authentication_error", "Not signed in. Run: dad login");
  if (!isPro(user)) return apiError(402, "payment_required", PRO_REQUIRED);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return apiError(413, "request_too_large", "This session got too long. Start a new one.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "invalid_request_error", "Body must be JSON.");
  }
  const problem = problemWith(body);
  if (problem) return apiError(400, "invalid_request_error", problem);

  const used = await incrementUsage(user.id);
  if (used > proDailyRequests()) {
    return apiError(429, "rate_limit_error", "Daily limit reached. It resets at midnight UTC. Use your own key (dad config set-key) or --local meanwhile.");
  }

  const b = body as { messages: Anthropic.Beta.BetaMessageParam[]; system: Anthropic.Beta.BetaTextBlockParam[]; max_tokens?: number };
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  try {
    // The server picks the model, limits and tools; only the conversation comes from the client.
    const upstream = await client.beta.messages
      .create({
        model: hostedModel(),
        max_tokens: Math.min(Number(b.max_tokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: b.system.map(({ type, text }) => ({ type, text })),
        tools: TOOLS,
        messages: b.messages,
        stream: true,
      })
      .asResponse();

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "text/event-stream", "cache-control": "no-cache" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return apiError(429, "rate_limit_error", "Dad is busy right now. Try again in a minute.");
    if (err instanceof Anthropic.BadRequestError) return apiError(400, "invalid_request_error", err.message);
    if (err instanceof Anthropic.APIError) return apiError(502, "api_error", "Upstream model error. Try again.");
    throw err;
  }
}
