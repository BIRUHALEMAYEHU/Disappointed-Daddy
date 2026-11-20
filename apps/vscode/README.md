# 🧔 Disappointed Dad for VS Code

> *"I'm not angry. I'm just disappointed you don't know why you used JWT."*

An AI interviewer that sits you down and makes you defend **your own** code, right next to it in the editor. Dad reads your project and git history, finds the real design decisions, and grills you on them until you understand the trade-offs.

## Use

1. Open your project folder.
2. Run **Disappointed Dad: Start Interview** from the Command Palette (Ctrl+Shift+P).
3. Pick a mode: **Talk**, **Talk (hard)**, **Again** (redo weak topics), **Sit-down** (scored mock interview) or **One topic**.

When Dad opens a file to ask about it, click the file name in the chat to jump there.
Buttons: **Hint**, **Skip**, **Done**. **Disappointed Dad: Show Report Card** shows your grades.

## Pick Dad's brain

| Setting `disappointedDad.provider` | Setup |
|---|---|
| `auto` (default) | Uses your API key if set, else Dad Pro if you ran `dad login` |
| `anthropic` (your own key) | **Disappointed Dad: Set API Key**, then pick Anthropic, OpenAI, Google Gemini (has a free tier), OpenRouter, DeepSeek or Groq. Keys are stored in VS Code's secret storage. |
| `ollama` | Local model via [Ollama](https://ollama.com): free, nothing leaves your machine |
| `hosted` | Dad Pro subscribers: run `dad login` in a terminal (needs the `disappointed-dad` CLI) |

## Shares progress with the terminal

Grades are saved in `.disappointed-dad/progress.json` in your project, the same file the `dad` CLI uses, so `dad reportcard` and the extension show the same report card.

## Privacy

Dad never reads `.env` files, private keys or credential files, respects `.gitignore`, and can't open files outside your project. Only the snippets Dad needs are sent, to the provider you choose.

---

<sub>🤫 Setting `disappointedDad.daddyMode`. Not for the office.</sub>
