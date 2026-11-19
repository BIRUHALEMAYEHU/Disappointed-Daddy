import { NextResponse } from "next/server";
import { GITHUB_COOKIE, isSameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const res = NextResponse.redirect(`${appUrl()}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(GITHUB_COOKIE);
  return res;
}
