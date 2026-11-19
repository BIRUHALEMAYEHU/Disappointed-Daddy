import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** `dad login` step 3: the CLI polls until the code is approved, then receives its personal token once. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { device_code?: unknown };
  if (typeof body.device_code !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });

  const hash = sha256(body.device_code);
  const [row] = await db()<{ user_id: number | null; expired: boolean; login: string | null }[]>`
    select d.user_id::int as user_id, d.expires_at < now() as expired, u.login
    from device_codes d left join users u on u.id = d.user_id
    where d.device_code_hash = ${hash}`;

  if (!row || row.expired) return Response.json({ error: "expired_token" }, { status: 400 });
  if (row.user_id === null) return Response.json({ error: "authorization_pending" }, { status: 400 });

  // One-time exchange: delete the code, issue a token, store only its hash.
  const deleted = await db()`delete from device_codes where device_code_hash = ${hash} returning 1`;
  if (!deleted.length) return Response.json({ error: "expired_token" }, { status: 400 });
  const token = `dd_${randomToken(32)}`;
  await db()`insert into cli_tokens (token_hash, user_id) values (${sha256(token)}, ${row.user_id})`;
  return Response.json({ token, login: row.login });
}
