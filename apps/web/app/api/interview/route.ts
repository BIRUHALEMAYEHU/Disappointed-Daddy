import Anthropic from "@anthropic-ai/sdk";
import { InterviewSession, parseGithubRepo, type History, type Mode, type Voice } from "@disappointed-dad/core";
import { currentUser, githubToken, isSameOrigin } from "@/lib/auth";
import { incrementUsage } from "@/lib/db";
import { env, freeDailyRequests, hostedModel } from "@/lib/env";
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
}

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

  if ((await incrementUsage(user.id)) > freeDailyRequests()) {
    return Response.json({ error: "Free tier limit reached for today. Come back tomorrow, or use the CLI with your own key." }, { status: 429 });
  }

  const { owner, repo } = parseGithubRepo(body.repo)!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { source, snapshot } = await loadRepo(user.id, owner, repo, await githubToken());
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
          apiKey: env("ANTHROPIC_API_KEY"),
          model: hostedModel(),
        });
        const handlers = {
          onText: (delta: string) => emit({ type: "text", delta }),
          onToolUse: (kind: string, detail: string) => emit({ type: "tool", kind, detail }),
          onNotice: (message: string) => emit({ type: "notice", message }),
        };
        if (body.message === null) await session.start(handlers);
        else await session.send(body.message, handlers);
        emit({ type: "done", history: session.history });
      } catch (err) {
        const message =
          err instanceof Anthropic.RateLimitError ? "Dad is busy right now. Try again in a minute."
          : err instanceof Anthropic.APIError ? "The AI had a problem. Try again."
          : err instanceof Error ? err.message
          : "Something went wrong.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" } });
}
