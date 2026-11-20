import postgres from "postgres";
import { env } from "./env";

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __sql?: Sql };

/** One shared connection pool (reused across hot reloads in dev). */
export function db(): Sql {
  // prepare: false is required for Supabase's transaction pooler.
  g.__sql ??= postgres(env("DATABASE_URL"), { prepare: false, max: 5 });
  return g.__sql;
}

export type Plan = "none" | "pro";

export interface User {
  id: number;
  login: string;
  /** GitHub's numeric account ID, as a string (never changes, unlike the login). */
  githubId: string;
  /** Manual permanent override: "pro" may use the hosted model. Use lib/plans.ts isPro() to decide access. */
  plan: Plan;
  /** Legacy time-based Pro (no longer granted; kept so older grants still count). */
  proUntil: Date | null;
  /** Prepaid AI credit in micro-dollars (1 USD = 1,000,000). Hosted usage is charged against it. */
  creditMicroUsd: number;
  /** When the GitHub account was created (free-tier abuse check). */
  githubCreatedAt: Date | null;
  /** When the user confirmed 18+ and accepted the free tier's data terms. */
  freeTermsAcceptedAt: Date | null;
}

export async function upsertGithubUser(githubId: number, login: string, githubCreatedAt: Date | null = null): Promise<User> {
  const [user] = await db()<User[]>`
    insert into users (github_id, login, github_created_at) values (${githubId}, ${login}, ${githubCreatedAt})
    on conflict (github_id) do update
      set login = excluded.login,
          github_created_at = coalesce(excluded.github_created_at, users.github_created_at)
    returning id::int as id, login, github_id::text as "githubId", plan, pro_until as "proUntil",
      credit_micro_usd::float8 as "creditMicroUsd", github_created_at as "githubCreatedAt",
      free_terms_accepted_at as "freeTermsAcceptedAt"`;
  return user;
}

export async function userById(id: number): Promise<User | null> {
  const [user] = await db()<User[]>`
    select id::int as id, login, github_id::text as "githubId", plan, pro_until as "proUntil",
      credit_micro_usd::float8 as "creditMicroUsd", github_created_at as "githubCreatedAt",
      free_terms_accepted_at as "freeTermsAcceptedAt"
    from users where id = ${id}`;
  return user ?? null;
}

export async function setGithubCreatedAt(userId: number, createdAt: Date): Promise<void> {
  await db()`update users set github_created_at = ${createdAt} where id = ${userId}`;
}

export async function acceptFreeTerms(userId: number): Promise<void> {
  await db()`update users set free_terms_accepted_at = now() where id = ${userId} and free_terms_accepted_at is null`;
}

export async function freeUsageToday(userId: number): Promise<{ interviews: number; turns: number }> {
  const [row] = await db()<{ interviews: number; turns: number }[]>`
    select free_interviews as interviews, free_turns as turns from usage_daily
    where user_id = ${userId} and day = (now() at time zone 'utc')::date`;
  return row ?? { interviews: 0, turns: 0 };
}

/** Counts one free turn (and one free interview when starting), atomically. Returns today's new totals. */
export async function recordFreeUse(userId: number, starting: boolean): Promise<{ interviews: number; turns: number }> {
  const add = starting ? 1 : 0;
  const [row] = await db()<{ interviews: number; turns: number }[]>`
    insert into usage_daily (user_id, day, requests, free_interviews, free_turns)
    values (${userId}, (now() at time zone 'utc')::date, 0, ${add}, 1)
    on conflict (user_id, day) do update
      set free_interviews = usage_daily.free_interviews + ${add},
          free_turns = usage_daily.free_turns + 1
    returning free_interviews as interviews, free_turns as turns`;
  return row;
}

/** Atomically adds one request to today's count and returns the new total. */
export async function incrementUsage(userId: number): Promise<number> {
  const [row] = await db()<{ requests: number }[]>`
    insert into usage_daily (user_id, day, requests) values (${userId}, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set requests = usage_daily.requests + 1
    returning requests`;
  return row.requests;
}

export async function loadWebProgress(userId: number, repo: string): Promise<unknown | null> {
  const [row] = await db()<{ data: unknown }[]>`select data from web_progress where user_id = ${userId} and repo = ${repo}`;
  return row?.data ?? null;
}

/** Returns true if this was the first save for this repo. */
export async function saveWebProgress(userId: number, repo: string, data: unknown): Promise<boolean> {
  const [row] = await db()<{ inserted: boolean }[]>`
    insert into web_progress (user_id, repo, data) values (${userId}, ${repo}, ${db().json(data as never)})
    on conflict (user_id, repo) do update set data = excluded.data, updated_at = now()
    returning (xmax = 0) as inserted`;
  return row.inserted;
}

/** Payment verification attempts in the last hour and day (for rate limiting). */
export async function recentPaymentAttempts(userId: number): Promise<{ hour: number; day: number }> {
  const [row] = await db()<{ hour: number; day: number }[]>`
    select count(*) filter (where created_at > now() - interval '1 hour')::int as hour,
           count(*)::int as day
    from payment_attempts where user_id = ${userId} and created_at > now() - interval '1 day'`;
  return row;
}

export async function recordPaymentAttempt(userId: number): Promise<void> {
  await db()`insert into payment_attempts (user_id) values (${userId})`;
}

export async function birrReferenceUsed(bank: string, reference: string): Promise<boolean> {
  const rows = await db()`select 1 from birr_payments where bank = ${bank} and reference = ${reference}`;
  return rows.length > 0;
}

/**
 * Records a verified Birr payment and adds its credit, atomically. Returns the new balance (micro-dollars),
 * or null if the reference was already used (the unique constraint makes double-spending impossible,
 * even when two requests race).
 */
export async function grantBirrPayment(p: {
  userId: number;
  bank: string;
  reference: string;
  amount: number;
  creditMicroUsd: number;
  payerName: string | null;
  receiverAccount: string | null;
  paidAt: Date | null;
}): Promise<number | null> {
  return db().begin(async (sql) => {
    const inserted = await sql`
      insert into birr_payments (user_id, bank, reference, amount, payer_name, receiver_account, paid_at, credit_micro_usd)
      values (${p.userId}, ${p.bank}, ${p.reference}, ${p.amount}, ${p.payerName}, ${p.receiverAccount}, ${p.paidAt}, ${p.creditMicroUsd})
      on conflict (bank, reference) do nothing
      returning id`;
    if (inserted.length === 0) return null;
    const [user] = await sql<{ balance: number }[]>`
      update users set credit_micro_usd = credit_micro_usd + ${p.creditMicroUsd}
      where id = ${p.userId}
      returning credit_micro_usd::float8 as balance`;
    await sql`
      insert into credit_ledger (user_id, delta_micro_usd, balance_after, kind, detail)
      values (${p.userId}, ${p.creditMicroUsd}, ${user.balance}, 'topup', ${`birr:${p.bank}:${p.reference}`})`;
    return user.balance;
  });
}

/**
 * Charges real AI cost against a user's credit and logs it. The balance may dip slightly below zero
 * on the last request (we can't know a response's size in advance); the next request is then refused.
 * Returns the new balance.
 */
export async function chargeUsage(p: {
  userId: number;
  costMicroUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<number> {
  if (p.costMicroUsd <= 0) return (await userById(p.userId))?.creditMicroUsd ?? 0;
  return db().begin(async (sql) => {
    const [user] = await sql<{ balance: number }[]>`
      update users set credit_micro_usd = credit_micro_usd - ${p.costMicroUsd}
      where id = ${p.userId}
      returning credit_micro_usd::float8 as balance`;
    await sql`
      insert into credit_ledger (user_id, delta_micro_usd, balance_after, kind, detail, input_tokens, output_tokens)
      values (${p.userId}, ${-p.costMicroUsd}, ${user.balance}, 'usage', ${p.model}, ${p.inputTokens}, ${p.outputTokens})`;
    return user.balance;
  });
}

export async function usageToday(userId: number): Promise<number> {
  const [row] = await db()<{ requests: number }[]>`
    select requests from usage_daily where user_id = ${userId} and day = (now() at time zone 'utc')::date`;
  return row?.requests ?? 0;
}
