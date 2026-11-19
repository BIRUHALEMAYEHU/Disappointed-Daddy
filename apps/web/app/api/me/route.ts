import { userFromBearer } from "@/lib/auth";
import { usageToday } from "@/lib/db";
import { freeDailyRequests } from "@/lib/env";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

/** `dad whoami`: who the token belongs to and how much of today's free tier is left. */
export async function GET(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return apiError(401, "authentication_error", "Not signed in. Run: dad login");
  const used = await usageToday(user.id);
  return Response.json({ login: user.login, used_today: used, daily_limit: freeDailyRequests() });
}
