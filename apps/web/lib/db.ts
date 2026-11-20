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
  /** "pro" may use the hosted model (our key). Everyone else brings their own key. */
  plan: Plan;
}

export async function upsertGithubUser(githubId: number, login: string): Promise<User> {
  const [user] = await db()<User[]>`
    insert into users (github_id, login) values (${githubId}, ${login})
    on conflict (github_id) do update set login = excluded.login
    returning id::int as id, login, plan`;
  return user;
}

export async function userById(id: number): Promise<User | null> {
  const [user] = await db()<User[]>`select id::int as id, login, plan from users where id = ${id}`;
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

export async function usageToday(userId: number): Promise<number> {
  const [row] = await db()<{ requests: number }[]>`
    select requests from usage_daily where user_id = ${userId} and day = (now() at time zone 'utc')::date`;
  return row?.requests ?? 0;
}
