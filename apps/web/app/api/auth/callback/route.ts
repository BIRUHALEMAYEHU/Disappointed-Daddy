import { NextResponse } from "next/server";
import { githubCookie, safeNext, sessionCookie } from "@/lib/auth";
import { unseal } from "@/lib/crypto";
import { upsertGithubUser } from "@/lib/db";
import { appUrl, env } from "@/lib/env";

export const runtime = "nodejs";

/** Step 2 of GitHub sign-in: verify state, exchange the code, create the session. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)dd_oauth=([^;]+)/)?.[1];
  const saved = unseal<{ state: string; next: string }>(cookie ? decodeURIComponent(cookie) : undefined);
  const fail = (why: string) => NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(why)}`);

  if (!saved || !params.get("code") || params.get("state") !== saved.state) return fail("Sign-in expired. Try again.");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env("GITHUB_CLIENT_ID"),
      client_secret: env("GITHUB_CLIENT_SECRET"),
      code: params.get("code"),
      redirect_uri: `${appUrl()}/api/auth/callback`,
    }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return fail("GitHub sign-in failed.");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${access_token}`, accept: "application/vnd.github+json", "user-agent": "disappointed-dad" },
  });
  if (!userRes.ok) return fail("Could not read your GitHub profile.");
  const gh = (await userRes.json()) as { id: number; login: string };

  // The GitHub token is never stored server-side: it goes into an encrypted cookie in the user's browser,
  // so web interviews can read public repos with the user's own rate limit.
  const user = await upsertGithubUser(gh.id, gh.login);
  const res = NextResponse.redirect(`${appUrl()}${safeNext(saved.next)}`);
  res.cookies.set(sessionCookie(user.id));
  res.cookies.set(githubCookie(access_token));
  res.cookies.delete({ name: "dd_oauth", path: "/api/auth" });
  return res;
}
