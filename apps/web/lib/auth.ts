import { cookies } from "next/headers";
import { decrypt, encrypt, seal, sha256, unseal } from "./crypto";
import { db, userById, type User } from "./db";
import { appUrl } from "./env";

export const SESSION_COOKIE = "dd_session";
const SESSION_DAYS = 30;

export function sessionCookie(userId: number) {
  return {
    name: SESSION_COOKIE,
    value: seal({ uid: userId }, SESSION_DAYS * 86400),
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}

/**
 * The user's GitHub token, kept only in an encrypted httpOnly cookie in their browser (never in the database).
 * Used to read public repos for web interviews with the user's own GitHub rate limit.
 */
export const GITHUB_COOKIE = "dd_gh";

export function githubCookie(accessToken: string) {
  return { ...sessionCookie(0), name: GITHUB_COOKIE, value: encrypt(accessToken) };
}

export async function githubToken(): Promise<string | null> {
  return decrypt((await cookies()).get(GITHUB_COOKIE)?.value);
}

/** The signed-in browser user, or null. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const session = unseal<{ uid: number }>(store.get(SESSION_COOKIE)?.value);
  return session ? userById(session.uid) : null;
}

/** The user behind a CLI `Authorization: Bearer dd_...` token, or null. */
export async function userFromBearer(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (dd_[A-Za-z0-9_-]{20,})$/);
  if (!match) return null;
  const [user] = await db()<User[]>`
    update cli_tokens set last_used_at = now() where token_hash = ${sha256(match[1])}
    returning user_id::int as id,
      (select login from users where id = cli_tokens.user_id) as login,
      (select plan from users where id = cli_tokens.user_id) as plan`;
  return user ?? null;
}

/** Only allow same-site relative redirects like "/cli/authorize?code=X". */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Blocks cross-site form posts (CSRF) on state-changing routes. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(appUrl()).origin;
}
