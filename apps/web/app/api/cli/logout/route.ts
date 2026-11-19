import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** `dad logout`: revokes the calling CLI token on the server. */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (dd_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (token) await db()`delete from cli_tokens where token_hash = ${sha256(token)}`;
  return Response.json({ ok: true });
}
