/**
 * Which model Dad Pro uses. Credit is charged at each model's real price (lib/pricing.ts),
 * so cheaper routing directly stretches users' credit.
 *
 *   auto    = the strongest model for strict mock interviews and Hard mode, a cheaper strong model otherwise
 *   max     = the strongest model always
 *   economy = the cheapest model
 */
export type ProMode = "auto" | "max" | "economy";
export const PRO_MODES: ProMode[] = ["auto", "max", "economy"];
export const isProMode = (x: unknown): x is ProMode => typeof x === "string" && (PRO_MODES as string[]).includes(x);

export function proModels(env: Record<string, string | undefined> = process.env) {
  return {
    max: env.PRO_MODEL_MAX || env.HOSTED_MODEL || "claude-opus-5-5",
    standard: env.PRO_MODEL_STANDARD || "claude-sonnet-5-5",
    economy: env.PRO_MODEL_ECONOMY || "claude-haiku-5-5",
  };
}

export function proModelFor(
  proMode: ProMode,
  interview: { mode: string; hard?: boolean },
  env: Record<string, string | undefined> = process.env,
): string {
  const m = proModels(env);
  if (proMode === "max") return m.max;
  if (proMode === "economy") return m.economy;
  return interview.mode === "sitdown" || interview.hard ? m.max : m.standard;
}

/**
 * The terminal's Pro requests only carry the conversation, so infer the interview type from the
 * hidden kickoff message the engine sends first (see packages/core/src/prompts.ts).
 */
export function interviewFromKickoff(firstUserMessage: unknown): { mode: string; hard: boolean } {
  const text = typeof firstUserMessage === "string" ? firstUserMessage : "";
  return { mode: /strict mock interview/i.test(text) ? "sitdown" : "talk", hard: /Difficulty: HARD/.test(text) };
}
