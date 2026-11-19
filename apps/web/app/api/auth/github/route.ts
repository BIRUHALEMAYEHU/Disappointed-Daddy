import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth";
import { randomToken, seal } from "@/lib/crypto";
import { appUrl, env } from "@/lib/env";

export const runtime = "nodejs";

/** Step 1 of GitHub sign-in: redirect to GitHub with an anti-CSRF state. */
export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = randomToken(16);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${appUrl()}/api/auth/callback`);
  url.searchParams.set("scope", "read:user"); // identity only: no repo access
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("dd_oauth", seal({ state, next }, 600), {
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
