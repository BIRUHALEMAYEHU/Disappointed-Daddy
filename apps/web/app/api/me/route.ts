import { isPro, userFromBearer } from "@/lib/auth";
import { proSource } from "@/lib/plans";
import { usageToday } from "@/lib/db";
import { proDailyRequests } from "@/lib/env";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

/** `dad whoami`: who the token belongs to, their plan, and today's hosted usage. */
export async function GET(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return apiError(401, "authentication_error", "Not signed in. Run: dad login");
  const used = await usageToday(user.id);
  return Response.json({
    login: user.login,
    plan: isPro(user) ? "pro" : "none",
    pro_source: proSource(user),
    credit_usd: Math.floor(user.creditMicroUsd / 10_000) / 100,
    used_today: used,
    daily_limit: proDailyRequests(),
  });
}
