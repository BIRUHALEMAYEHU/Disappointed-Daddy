-- Disappointed Dad backend schema. Run once in the Supabase SQL editor (or psql).
-- The server connects with the database owner role, so RLS below only blocks the public
-- Supabase API keys from reading these tables. No user code is ever stored here.

create table if not exists users (
  id          bigserial primary key,
  github_id   bigint unique not null,
  login       text not null,
  created_at  timestamptz not null default now()
);

-- Hosted usage (our Anthropic key) is only for paying users. 'none' = bring your own key.
alter table users add column if not exists plan text not null default 'none'
  check (plan in ('none', 'pro'));

-- Paid Pro access lasts until a date: card subscriptions (Polar) extend it on renewal,
-- Birr payments (verify.et) add 30 days. plan = 'pro' remains a manual, permanent override.
alter table users add column if not exists pro_until timestamptz;

-- Personal tokens for the CLI. Only a SHA-256 hash is stored; the token itself is shown once.
create table if not exists cli_tokens (
  token_hash    text primary key,
  user_id       bigint not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Pending `dad login` requests (device flow). Expire after 10 minutes.
create table if not exists device_codes (
  device_code_hash  text primary key,
  user_code         text unique not null,
  user_id           bigint references users(id) on delete cascade,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);

-- Metering: model requests per user per UTC day (Pro and bring-your-own-key limits differ).
create table if not exists usage_daily (
  user_id   bigint not null references users(id) on delete cascade,
  day       date not null,
  requests  integer not null default 0,
  primary key (user_id, day)
);

-- Web interview grades per repo: topic names, statuses and one-line notes. No code is stored.
create table if not exists web_progress (
  user_id     bigint not null references users(id) on delete cascade,
  repo        text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, repo)
);

-- Ethiopian payments verified through verify.et. Every accepted reference is stored once,
-- so the same transaction can never unlock Pro twice.
create table if not exists birr_payments (
  id                 bigserial primary key,
  user_id            bigint not null references users(id) on delete cascade,
  bank               text not null,
  reference          text not null,
  amount             numeric(12,2) not null,
  payer_name         text,
  receiver_account   text,
  paid_at            timestamptz,
  days_granted       integer not null,
  verified_at        timestamptz not null default now(),
  unique (bank, reference)
);

-- Prepaid AI credit for hosted usage, in micro-dollars (1 USD = 1,000,000) so sums are exact integers.
alter table users add column if not exists credit_micro_usd bigint not null default 0;

-- Every change to a balance: top-ups (positive) and AI usage charges (negative).
create table if not exists credit_ledger (
  id                bigserial primary key,
  user_id           bigint not null references users(id) on delete cascade,
  delta_micro_usd   bigint not null,
  balance_after     bigint not null,
  kind              text not null check (kind in ('topup', 'usage', 'adjustment')),
  detail            text,
  input_tokens      integer,
  output_tokens     integer,
  created_at        timestamptz not null default now()
);
create index if not exists credit_ledger_user_time on credit_ledger (user_id, created_at desc);

-- Birr payments now grant credit instead of days.
alter table birr_payments add column if not exists credit_micro_usd bigint;
alter table birr_payments alter column days_granted drop not null;

-- Every verification attempt (accepted or not), to rate-limit attempts and protect verify.et credits.
create table if not exists payment_attempts (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists payment_attempts_user_time on payment_attempts (user_id, created_at desc);

alter table users            enable row level security;
alter table web_progress     enable row level security;
alter table birr_payments    enable row level security;
alter table payment_attempts enable row level security;
alter table credit_ledger    enable row level security;
alter table cli_tokens    enable row level security;
alter table device_codes  enable row level security;
alter table usage_daily   enable row level security;
