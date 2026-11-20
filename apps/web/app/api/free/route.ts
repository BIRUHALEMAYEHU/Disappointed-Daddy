import { currentUser, isSameOrigin } from "@/lib/auth";
import { acceptFreeTerms } from "@/lib/db";
import { FREE_TERMS, freeLimits } from "@/lib/free";
import { freeStatusFor } from "@/lib/free-server";

export const runtime = "nodejs";

/** Free-tier status for the signed-in user: eligibility, what's left today, and the terms to accept. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const status = await freeStatusFor(user, req, true);
  return Response.json({ ...status, terms: FREE_TERMS, accepted: Boolean(user.freeTermsAcceptedAt), limits: freeLimits() });
}

/** Records that the user confirmed they're 18+ and accepted the free tier's data terms. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { accept?: unknown };
  if (body.accept !== true) return Response.json({ error: "Please tick the box to accept." }, { status: 400 });
  await acceptFreeTerms(user.id);
  return Response.json({ ok: true });
}
