# 🧔 Disappointed Dad

> *"I'm not angry. I'm just disappointed you don't know why you used JWT."*

You built a project with AI. It looks great on your resume. Then the interviewer asks **"why did you design your backend this way?"** and after two follow-up questions… silence.

**Disappointed Dad** is an AI interviewer that sits you down and makes you explain *your own* code before a real interviewer does. It reads your project and git history, finds the real design decisions (auth, data model, API shape, deployment…), and grills you on them, adding twists like *"now you have 100× the users"* until you actually understand the trade-offs.

It doesn't hand you answers. It guides you there, and it remembers where you struggled.

## Install

```bash
npm install -g disappointed-dad
```

Then pick how Dad thinks:

| Option | Setup | Where your code snippets go |
|---|---|---|
| **Your own key** | `dad config set-key` or `ANTHROPIC_API_KEY` ([get a key](https://console.anthropic.com/settings/keys)) | Straight to Anthropic |
| **Local model** (free) | Install [Ollama](https://ollama.com), then `dad --local` | Nowhere: stays on your computer |
| **Dad Pro** | `dad login` (paid accounts, no key needed) | Through our server to the AI; never stored or logged |

## Three ways to use it

- **Terminal**: `npm install -g disappointed-dad`, then `dad` in your project (below)
- **Browser**: sign in with GitHub at [disappointed-daddy.vercel.app](https://disappointed-daddy.vercel.app), paste a public repo and your API key, chat with Dad
- **VS Code**: install the *Disappointed Dad* extension, run **Disappointed Dad: Start Interview**

All three share the same interviewer; the terminal and VS Code also share your report card.

## Use (terminal)

`cd` into the project you want to be grilled on:

| Command | What Dad says |
|---|---|
| `dad` | *"Son, we need to talk about your backend."* A normal interview |
| `dad again` | *"We've been over this."* Re-drills only what you got wrong |
| `dad sitdown` | Strict 5-question mock interview, scored /10 |
| `dad topic auth` | Just one area |
| `dad reportcard` | *"Auth: D-. I expected more."* |
| `dad proud` | 🥲 Rare. Earn it. |

Flags: `--hard` (tougher questions), `--endless` (keeps going until `/done`), `--model <id>`.
During a session: `/hint`, `/skip`, `/done`, `/quit`.

## Your code stays yours

- Runs **on your machine**. Nothing is uploaded except the snippets Dad needs to ask about (see the table above for where they go).
- Never reads `.env` files, private keys or credential files, and respects `.gitignore`.
- Can't open files outside your project.
- Progress is saved locally in `.disappointed-dad/` (add it to `.gitignore` if you like).

## Example

```
Dad › routes/orders.js and routes/users.js each call verifyToken() themselves.
      Why not mount it once as middleware in app.js?
you › so I don't have to repeat it?
Dad › That's part of it. Now a teammate adds routes/admin.js and forgets the call.
      What happens, and which design prevents that by default?
```

## What it won't do

It won't make you interview-ready by itself. You still need fundamentals and practice. And it never edits your code.

## Project layout

```
packages/core   shared engine: repo scanner, interviewer prompts, voices, progress
packages/cli    the `dad` terminal app
apps/web        website: browser interviews + backend (login, Pro proxy, rate limits)
apps/vscode     VS Code extension
skills/         the same interviewer as an agent skill (Claude Code, Cursor…)
```

---

MIT licensed. See [LICENSE](LICENSE).

<sub>🤫 There's a hidden mode. Run `dad --help --all`.</sub>
