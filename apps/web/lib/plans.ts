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

/**
 * comped  = on the PRO_GITHUB_IDS allowlist (not charged)
 * manual  = users.plan = 'pro' set in the database (not charged)
 * legacy  = an old time-based grant still running (not charged)
 * credit  = has prepaid credit; every hosted request is charged at real cost
 */
export type ProSource = "comped" | "manual" | "legacy" | "credit" | null;

/** Smallest balance that may start a hosted request ($0.02). */
export const MIN_CREDIT_MICRO_USD = 20_000;

type PlanFields = Pick<User, "githubId" | "plan" | "proUntil" | "creditMicroUsd">;

/** Why a user may use the hosted model, or null if they may not. */
export function proSource(user: PlanFields, now = new Date()): ProSource {
  if (compedGithubIds().has(user.githubId)) return "comped";
  if (user.plan === "pro") return "manual";
  if (user.proUntil && user.proUntil.getTime() > now.getTime()) return "legacy";
  if ((user.creditMicroUsd ?? 0) >= MIN_CREDIT_MICRO_USD) return "credit";
  return null;
}

export const isPro = (user: PlanFields) => proSource(user) !== null;

/** Whether hosted usage should be charged to this user's credit. */
export const chargesCredit = (user: PlanFields) => proSource(user) === "credit";
