/** Reads a required environment variable, failing loudly with a useful message. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/web/.env.example.`);
  return value;
}

export const appUrl = () => env("APP_URL").replace(/\/$/, "");
/** Daily cap on hosted (our key) requests for Pro users. FREE_DAILY_REQUESTS is the old name, still honoured. */
export const proDailyRequests = () => Number(process.env.PRO_DAILY_REQUESTS ?? process.env.FREE_DAILY_REQUESTS ?? 150);
/** Daily cap on bring-your-own-key web turns: they cost us nothing in AI, but still use GitHub and server time. */
export const byokDailyRequests = () => Number(process.env.BYOK_DAILY_REQUESTS ?? 1000);
export const PRO_REQUIRED =
  "Dad's hosted brain is for Pro accounts. Use your own Anthropic key instead (dad config set-key, or paste it on the website), or run locally with --local.";
export const hostedModel = () => process.env.HOSTED_MODEL ?? "claude-opus-5-5";
