import { NextResponse } from "next/server";
import { currentUser, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

/** `dad login` step 2: the signed-in user approves the code shown in their terminal. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/`, 303);

  const code = String((await req.formData()).get("user_code") ?? "").toUpperCase();
  const updated = await db()`
    update device_codes set user_id = ${user.id}
    where user_code = ${code} and user_id is null and expires_at > now()
    returning user_code`;

  const status = updated.length ? "approved" : "expired";
  return NextResponse.redirect(`${appUrl()}/cli/authorize?code=${encodeURIComponent(code)}&status=${status}`, 303);
}
