import type { User } from "./db";

/**
 * GitHub numeric IDs that get Pro for free ("comped"), from the PRO_GITHUB_IDS environment variable
 * on the server (comma or space separated). Only someone with access to the hosting account can change it.
 *
 * Numeric IDs, not usernames: a GitHub username can be renamed and then claimed by someone else,
 * which would hand them free Pro. A numeric ID never changes and is never reused.
 * Find one at https://api.github.com/users/<username> ("id").
 */
export function compedGithubIds(): Set<string> {
  return new Set(
    (process.env.PRO_GITHUB_IDS ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{1,12}$/.test(s)),
  );
}

export type ProSource = "comped" | "manual" | "paid" | null;

/** Why a user is Pro, or null if they aren't. */
export function proSource(user: Pick<User, "githubId" | "plan" | "proUntil">, now = new Date()): ProSource {
  if (compedGithubIds().has(user.githubId)) return "comped";
  if (user.plan === "pro") return "manual";
  if (user.proUntil && user.proUntil.getTime() > now.getTime()) return "paid";
  return null;
}

export const isPro = (user: Pick<User, "githubId" | "plan" | "proUntil">) => proSource(user) !== null;
