import Anthropic from "@anthropic-ai/sdk";
import { InterviewSession, parseGithubRepo, type History, type Mode, type Voice } from "@disappointed-dad/core";
import { currentUser, githubToken, isPro, isSameOrigin } from "@/lib/auth";
import { chargeUsage, incrementUsage } from "@/lib/db";
import { chargesCredit } from "@/lib/plans";
import { costMicroUsd } from "@/lib/pricing";

class OutOfCredit extends Error {}
import { byokDailyRequests, env, hostedModel, PRO_REQUIRED, proDailyRequests } from "@/lib/env";
import { DbProgressStore, loadRepo } from "@/lib/interview";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY_BYTES = 1_500_000;
const MAX_HISTORY = 300;
const MODES: Mode[] = ["talk", "again", "sitdown", "topic"];

interface Body {
  repo: string;
  mode: Mode;
  voice: Voice;
  topic?: string;
  hard?: boolean;
  endless?: boolean;
  /** Conversation so far, held by the browser. Empty on the first turn. */
  history: History;
  /** The user's message; null starts the session. */
  message: string | null;
  /**
   * The user's own Anthropic key (bring-your-own-key). Held in their browser, sent with each turn,
   * used for that turn only, and never stored, logged or returned.
   */
  apiKey?: string;
}

const API_KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

function parseBody(raw: string): Body | string {
  if (raw.length > MAX_BODY_BYTES) return "This session got too long. Start a new one.";
  let b: Partial<Body>;
  try {
    b = JSON.parse(raw);
  } catch {
    return "Invalid request.";
  }
  if (typeof b.repo !== "string" || !parseGithubRepo(b.repo)) return "Enter a GitHub repo like owner/name.";
  if (!MODES.includes(b.mode as Mode)) return "Invalid mode.";
  if (b.voice !== "dad" && b.voice !== "daddy") return "Invalid voice.";
  if (!Array.isArray(b.history) || b.history.length > MAX_HISTORY) return "Invalid history.";
  if (b.message !== null && (typeof b.message !== "string" || !b.message.trim() || b.message.length > 8000)) return "Invalid message.";
  if (b.history.length === 0 && b.message !== null) return "Start the session first.";
  if (b.mode === "topic" && (typeof b.topic !== "string" || !b.topic.trim())) return "Which topic?";
  if (b.apiKey !== undefined && (typeof b.apiKey !== "string" || !API_KEY_SHAPE.test(b.apiKey.trim()))) {
    return "That doesn't look like an Anthropic API key (they start with sk-ant-).";
  }
  return b as Body;
}

/**
 * One turn of a web interview, streamed as newline-delimited JSON events:
 *   {type:"text",delta} {type:"tool",kind,detail} {type:"notice",message} {type:"done",history} {type:"error",message}
 * The conversation (which includes code snippets) lives in the browser; the server keeps nothing.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = parseBody(await req.text());
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  // Whose AI account pays for this turn: the user's own key, or ours for Pro accounts. No free usage.
  const ownKey = body.apiKey?.trim();
  if (!ownKey && !isPro(user)) return Response.json({ error: PRO_REQUIRED, needKey: true }, { status: 402 });
  const limit = ownKey ? byokDailyRequests() : proDailyRequests();
  if ((await incrementUsage(user.id)) > limit) {
    return Response.json({ error: "Daily limit reached. It resets at midnight UTC." }, { status: 429 });
  }

  const { owner, repo } = parseGithubRepo(body.repo)!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { source, snapshot } = await loadRepo(user.id, owner, repo, await githubToken());
        if (source.tokenRejected && body.message === null) {
          emit({ type: "notice", message: "Your GitHub sign-in has expired, so Dad is reading this public repo without it. Sign out and back in on the home page to refresh it." });
        }
        const session = await InterviewSession.create({
          source,
          snapshot,
          progressStore: new DbProgressStore(user.id, `${owner}/${repo}`.toLowerCase()),
          history: body.history,
          mode: body.mode,
          voice: body.voice,
          topic: body.topic,
          hard: body.hard,
          endless: body.endless,
          provider: "anthropic",
          apiKey: ownKey ?? env("ANTHROPIC_API_KEY"),
          model: hostedModel(),
        });
        // Prepaid Pro: charge every model call at real cost; stop as soon as the balance runs out.
        const metered = !ownKey && chargesCredit(user);
        const handlers = {
          onText: (delta: string) => emit({ type: "text", delta }),
          onToolUse: (kind: string, detail: string) => emit({ type: "tool", kind, detail }),
          onNotice: (message: string) => emit({ type: "notice", message }),
          onUsage: metered
            ? async (usage: Parameters<typeof costMicroUsd>[0] & { input_tokens?: number; output_tokens?: number }, model: string) => {
                const balance = await chargeUsage({
                  userId: user.id,
                  costMicroUsd: costMicroUsd(usage, hostedModel(), model),
                  model,
                  inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
                  outputTokens: usage.output_tokens ?? 0,
                });
                emit({ type: "credit", balanceMicroUsd: balance });
                if (balance <= 0) throw new OutOfCredit();
              }
            : undefined,
        };
        if (body.message === null) await session.start(handlers);
        else await session.send(body.message, handlers);
        emit({ type: "done", history: session.history });
      } catch (err) {
        // Never include the raw error: an SDK error could echo request details.
        const message =
          err instanceof OutOfCredit ? "You're out of Dad Pro credit. Top up at /pro, or add your own API key."
          : err instanceof Anthropic.AuthenticationError ? (ownKey ? "Anthropic rejected that API key. Check it at console.anthropic.com." : "The server's API key is invalid.")
          : err instanceof Anthropic.PermissionDeniedError ? "That API key isn't allowed to use this model. Check your Anthropic account."
          : err instanceof Anthropic.RateLimitError ? "Rate limited by Anthropic. Try again in a minute."
          : err instanceof Anthropic.APIError && err.status === 400 && /credit|billing/i.test(err.message) ? "Your Anthropic account is out of credit."
          : err instanceof Anthropic.APIError ? "The AI had a problem. Try again."
          : err instanceof Error && !(err instanceof Anthropic.AnthropicError) ? err.message
          : "Something went wrong.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" } });
}
