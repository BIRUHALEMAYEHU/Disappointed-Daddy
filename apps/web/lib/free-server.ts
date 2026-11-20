import { freeUsageToday, setGithubCreatedAt, type User } from "./db";
import { freeLimits, freeStatus, type FreeStatus } from "./free";

/** Visitor's country from Vercel's edge (ISO code), or null when unknown (e.g. local dev). */
export const requestCountry = (req: Request) => req.headers.get("x-vercel-ip-country");

/** True when the server has a Gemini key to run the free tier. */
export const freeConfigured = () => Boolean(process.env.GEMINI_API_KEY);

/**
 * Users who signed in before we recorded GitHub account ages: look it up once from GitHub's public API
 * (by numeric ID, which never changes) and store it.
 */
async function ensureGithubCreatedAt(user: User): Promise<Date | null> {
  if (user.githubCreatedAt) return user.githubCreatedAt;
  try {
    const res = await fetch(`https://api.github.com/user/${encodeURIComponent(user.githubId)}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "disappointed-dad" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { created_at } = (await res.json()) as { created_at?: string };
    const date = created_at ? new Date(created_at) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    await setGithubCreatedAt(user.id, date);
    return date;
  } catch {
    return null;
  }
}

export async function freeStatusFor(user: User, req: Request, starting: boolean): Promise<FreeStatus> {
  const [githubCreatedAt, usage] = await Promise.all([ensureGithubCreatedAt(user), freeUsageToday(user.id)]);
  return freeStatus({
    configured: freeConfigured(),
    country: requestCountry(req),
    githubCreatedAt,
    termsAcceptedAt: user.freeTermsAcceptedAt,
    interviewsToday: usage.interviews,
    turnsToday: usage.turns,
    starting,
    limits: freeLimits(),
  });
}
