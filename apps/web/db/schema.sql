-- Disappointed Dad backend schema. Run once in the Supabase SQL editor (or psql).
-- The server connects with the database owner role, so RLS below only blocks the public
-- Supabase API keys from reading these tables. No user code is ever stored here.

create table if not exists users (
  id          bigserial primary key,
  github_id   bigint unique not null,
  login       text not null,
  created_at  timestamptz not null default now()
);

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

-- Free-tier metering: model requests per user per UTC day.
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

alter table users         enable row level security;
alter table web_progress  enable row level security;
alter table cli_tokens    enable row level security;
alter table device_codes  enable row level security;
alter table usage_daily   enable row level security;
