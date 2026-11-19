# Finding design decisions in a codebase

Spend little time here. Aim for breadth, then go deep only on what you'll ask about.

## 1. Orient (read in this order)
- Manifests: `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`, `composer.json`
- Infra: `Dockerfile`, `docker-compose.yml`, `.github/workflows/*`, `vercel.json`, `.env.example`
- Entry points: `server.*`, `app.*`, `main.*`, `index.*`, `src/app/`, `pages/`, `routes/`
- Top two levels of the folder tree
- `README.md` (the user's claimed design; compare it with reality)

## 2. Read the history
```
git log --oneline -n 60
git log --stat --diff-filter=AD --format="%h %s" -n 40   # files added/removed
git log --format="%h %s" -S "<keyword>"                   # when something was introduced
```
Look for: big refactors, library swaps, reverted commits, "fix auth", "move to", "replace". Each one is a decision with a story: "In commit `abc123` you switched from X to Y. Why?"

If the history is one giant commit (common with AI-built projects), say so neutrally. It's itself a good interview question ("how did this evolve?").

## 3. Decision checklist
Pick the ones that actually exist in this repo:

| Area | What to look for |
|---|---|
| Architecture | monolith vs services, folder layering (routes/controllers/services/repos), server vs client rendering |
| API design | REST vs GraphQL vs RPC, URL shape, status codes, validation, error format, pagination, versioning |
| Auth & security | sessions vs JWT, where tokens live, middleware vs per-route checks, password hashing, CORS, rate limiting, secrets handling, input sanitising |
| Data | SQL vs NoSQL, ORM vs raw queries, schema/relations, indexes, migrations, transactions, N+1 queries |
| State (frontend) | local vs global store, server-state caching, form handling |
| Performance | caching, lazy loading, background jobs, queues |
| Reliability | error handling, retries, logging, health checks |
| Testing | what's tested, what isn't, unit vs integration |
| Deployment | hosting, env config, CI, containers |
| Dependencies | why this framework/library; what it replaced |

## 4. Rank
Prefer decisions that are (a) likely to be asked in an interview, (b) visible in the code, and (c) have a real alternative. Auth, data modelling, and API structure almost always rank high.

Keep a private note per decision: file paths, the alternative, the main trade-off, one constraint twist. Don't show this note to the user.
