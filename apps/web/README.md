# Disappointed Dad: backend & website

Powers the **free tier** (`dad login`) and **interviews in the browser** (`/interview`): sign in with GitHub, paste a public repo, get grilled.

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
| `POST /api/proxy/v1/messages` | Messages-API-compatible proxy for the free tier |

## Abuse protection
- Only **genuine Disappointed Dad sessions** pass: the system prompt must match the core package's prompt exactly, and the tools must be exactly Dad's tools. Anything else gets a 400, so the free tier isn't a free general-purpose Claude.
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
