# Disappointed Dad: backend & website

Powers **interviews in the browser** (`/interview`: sign in with GitHub, paste a public repo and your own Anthropic key) and **Dad Pro** (`dad login`: paid accounts use the server's key).

**Three ways to pay for an interview:**
- **Free** (website only): Google's free Gemini API (`GEMINI_API_KEY`, model `FREE_MODEL`). 2 interviews and 40 turns per user per day, GitHub accounts at least 30 days old, users confirm they're 18+ and accept that Google may use free-tier data. Not offered in the EU/EEA, Switzerland or the UK (Google's terms allow only its paid API there); country comes from Vercel's `x-vercel-ip-country`.
- **Own key**: Anthropic, OpenAI, Gemini, OpenRouter, DeepSeek or Groq (fixed base URLs only).
- **Dad Pro**: prepaid credit on the server's Anthropic key, routed by `proMode`: auto (Opus for sit-downs/Hard, Sonnet otherwise), max (Opus), economy (Haiku). Models: `PRO_MODEL_MAX`, `PRO_MODEL_STANDARD`, `PRO_MODEL_ECONOMY`.

Historical note: hosted usage (the server's key) requires Pro. Everyone else brings their own key, which the browser sends with each turn and the server uses once and never stores or logs.

```
dad login ─► /api/cli/start ─► browser: /cli/authorize (GitHub sign-in, "Yes, connect it")
          ◄─ /api/cli/token (polls) ◄─ personal token dd_… (only its hash is stored)

dad ─► /api/proxy/v1/messages ─► token ✓  genuine Dad session ✓  daily limit ✓ ─► Claude (server key)
```

| Route | Purpose |
|---|---|
| `GET /api/auth/github`, `/api/auth/callback` | GitHub sign-in (`read:user` scope, no private repo access). The GitHub token is kept only in an encrypted httpOnly cookie in the user's browser, never in the database. |
| `GET /interview` | Browser interview: pick a public repo and mode, chat with Dad, live report card |
| `POST /api/interview` | One interview turn, streamed as NDJSON. The repo is read through the GitHub API; the conversation is held by the browser, not the server |
| `GET /api/progress?repo=` | Web report card for a repo |
| `POST /api/auth/logout` | Browser sign-out |
| `POST /api/cli/start` · `/api/cli/token` · `/api/cli/approve` | Terminal login (device flow) |
| `POST /api/cli/logout` | Revokes a CLI token |
| `GET /api/me` | `dad whoami`: login + today's usage |
| `POST /api/proxy/v1/messages` | Messages-API-compatible proxy for Dad Pro (402 for non-Pro accounts) |

## Abuse protection
- Only **genuine Disappointed Dad sessions** pass: the system prompt must match the core package's prompt exactly, and the tools must be exactly Dad's tools. Anything else gets a 400, so Pro isn't a general-purpose Claude proxy.
- To make an account Pro (until payments are wired up): `update users set plan = 'pro' where login = '<github-login>';`
- The **server** picks the model, output limit and tools. Only the conversation comes from the client.
- Per-user daily request limit (`FREE_DAILY_REQUESTS`, default 150; one interview is roughly 20–40 requests).
- Request bodies are streamed through and **never logged or stored**.
- Web interviews: repo contents are cached in server memory for at most 10 minutes (per user) so each message doesn't re-download the repo; only grades (topic names + one-line notes) go into the `web_progress` table.

> If you ran `schema.sql` before the web interview existed, run it again. It's safe to re-run and adds the `web_progress` table.

## Run locally

1. **Database**: create a free Supabase project, open the SQL editor and run [`db/schema.sql`](db/schema.sql).
2. **GitHub OAuth app**: github.com → Settings → Developer settings → OAuth Apps → New.
   Homepage `http://localhost:3000`, callback `http://localhost:3000/api/auth/callback`.
3. `cp .env.example .env.local` and fill it in.
4. From the repo root: `npm run web`, then open http://localhost:3000.
5. In another terminal: `dad login` (the CLI defaults to `http://localhost:3000`; change it with `dad config set-server <url>`).

## Deploy (Vercel)
Import the repo, set **Root Directory** to `apps/web`, add the same env vars (with `APP_URL` set to your real domain), and add a second GitHub OAuth app whose callback uses that domain. Then change `DEFAULT_SERVER_URL` in `packages/core/src/config.ts` to your domain before publishing the CLI.

## Tests
`npm test -w @disappointed-dad/web` checks the proxy's request validation.
