/**
 * Free tier: limited interviews on Google's free Gemini API, paid for by nobody.
 *
 * Google's Gemini API terms (unpaid services) shape these rules:
 *  - free-tier prompts and responses may be used to improve Google's products and read by human reviewers,
 *    so users must accept that knowingly;
 *  - API users must be 18+;
 *  - only paid services may be offered to users in the EEA, Switzerland and the UK.
 */

/** EU + EEA (Iceland, Liechtenstein, Norway) + Switzerland + UK, as ISO country codes. */
export const FREE_BLOCKED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "CH", "GB",
]);

export interface FreeLimits {
  interviewsPerDay: number;
  turnsPerDay: number;
  minAccountAgeDays: number;
}

export function freeLimits(env: Record<string, string | undefined> = process.env): FreeLimits {
  const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    interviewsPerDay: num(env.FREE_INTERVIEWS_PER_DAY, 2),
    turnsPerDay: num(env.FREE_TURNS_PER_DAY, 40),
    minAccountAgeDays: num(env.FREE_MIN_ACCOUNT_AGE_DAYS, 30),
  };
}

/**
 * Free-tier models, tried in order when one is busy (Google's free models regularly report "high demand").
 * FREE_MODEL may list several, comma separated.
 */
export const freeModels = (env: Record<string, string | undefined> = process.env): string[] => {
  const list = (env.FREE_MODEL || "gemini-3.8-flash,gemini-flash-latest,gemini-3.1-flash-lite-preview")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_\-.:/@]{1,120}$/.test(s));
  return list.length ? list : ["gemini-3.8-flash"];
};

export type FreeBlock =
  | "not_configured"
  | "region"
  | "account_too_new"
  | "account_age_unknown"
  | "terms_not_accepted"
  | "daily_interviews_used"
  | "daily_turns_used";

export interface FreeStatus {
  ok: boolean;
  block: FreeBlock | null;
  message: string;
  interviewsLeft: number;
  turnsLeft: number;
}

/** Decides whether a user may use the free tier right now. Pure, so every rule is testable. */
export function freeStatus(p: {
  configured: boolean;
  country: string | null;
  githubCreatedAt: Date | null;
  termsAcceptedAt: Date | null;
  interviewsToday: number;
  turnsToday: number;
  starting: boolean;
  limits: FreeLimits;
  now?: Date;
}): FreeStatus {
  const now = p.now ?? new Date();
  const interviewsLeft = Math.max(0, p.limits.interviewsPerDay - p.interviewsToday);
  const turnsLeft = Math.max(0, p.limits.turnsPerDay - p.turnsToday);
  const no = (block: FreeBlock, message: string): FreeStatus => ({ ok: false, block, message, interviewsLeft, turnsLeft });

  if (!p.configured) return no("not_configured", "The free tier isn't available right now.");
  if (p.country && FREE_BLOCKED_COUNTRIES.has(p.country.toUpperCase())) {
    return no("region", "The free tier isn't available in your region (Google only allows its paid API there). Use your own key or Dad Pro.");
  }
  if (!p.githubCreatedAt) return no("account_age_unknown", "We couldn't check your GitHub account's age. Sign out and back in, then try again.");
  const ageDays = (now.getTime() - p.githubCreatedAt.getTime()) / 86_400_000;
  if (ageDays < p.limits.minAccountAgeDays) {
    return no("account_too_new", `The free tier needs a GitHub account at least ${p.limits.minAccountAgeDays} days old. Use your own key or Dad Pro meanwhile.`);
  }
  if (!p.termsAcceptedAt) return no("terms_not_accepted", "Please confirm you're 18+ and accept how the free tier handles your data.");
  if (p.starting && interviewsLeft <= 0) {
    return no("daily_interviews_used", `You've used today's ${p.limits.interviewsPerDay} free interviews. They reset at midnight UTC.`);
  }
  if (turnsLeft <= 0) return no("daily_turns_used", "You've reached today's free limit. It resets at midnight UTC.");
  return { ok: true, block: null, message: "", interviewsLeft, turnsLeft };
}

/** The notice users must accept before using the free tier. Shown on the page and stored as accepted. */
export const FREE_TERMS =
  "I'm 18 or older. I understand the free tier uses Google's free Gemini API: Google may use what I send " +
  "(including code snippets from my repo) to improve its products, and people at Google may review it. " +
  "I won't use the free tier on code with sensitive or confidential information.";
