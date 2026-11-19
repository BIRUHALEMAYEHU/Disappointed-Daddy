/** Reads a required environment variable, failing loudly with a useful message. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/web/.env.example.`);
  return value;
}

export const appUrl = () => env("APP_URL").replace(/\/$/, "");
export const freeDailyRequests = () => Number(process.env.FREE_DAILY_REQUESTS ?? 150);
export const hostedModel = () => process.env.HOSTED_MODEL ?? "claude-opus-5-5";
