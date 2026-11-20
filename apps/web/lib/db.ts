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
  /** Paid Pro access ends at this time (null = never paid). */
  proUntil: Date | null;
}

export async function upsertGithubUser(githubId: number, login: string): Promise<User> {
  const [user] = await db()<User[]>`
    insert into users (github_id, login) values (${githubId}, ${login})
    on conflict (github_id) do update set login = excluded.login
    returning id::int as id, login, github_id::text as "githubId", plan, pro_until as "proUntil"`;
  return user;
}

export async function userById(id: number): Promise<User | null> {
  const [user] = await db()<User[]>`
    select id::int as id, login, github_id::text as "githubId", plan, pro_until as "proUntil"
    from users where id = ${id}`;
  return user ?? null;
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
 * Records a verified Birr payment and extends Pro, atomically. Returns the new Pro end date,
 * or null if the reference was already used (the unique constraint makes double-spending impossible,
 * even when two requests race).
 */
export async function grantBirrPayment(p: {
  userId: number;
  bank: string;
  reference: string;
  amount: number;
  days: number;
  payerName: string | null;
  receiverAccount: string | null;
  paidAt: Date | null;
}): Promise<Date | null> {
  return db().begin(async (sql) => {
    const inserted = await sql`
      insert into birr_payments (user_id, bank, reference, amount, payer_name, receiver_account, paid_at, days_granted)
      values (${p.userId}, ${p.bank}, ${p.reference}, ${p.amount}, ${p.payerName}, ${p.receiverAccount}, ${p.paidAt}, ${p.days})
      on conflict (bank, reference) do nothing
      returning id`;
    if (inserted.length === 0) return null;
    const [user] = await sql<{ proUntil: Date }[]>`
      update users
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => ${p.days})
      where id = ${p.userId}
      returning pro_until as "proUntil"`;
    return user.proUntil;
  });
}

export async function usageToday(userId: number): Promise<number> {
  const [row] = await db()<{ requests: number }[]>`
    select requests from usage_daily where user_id = ${userId} and day = (now() at time zone 'utc')::date`;
  return row?.requests ?? 0;
}
