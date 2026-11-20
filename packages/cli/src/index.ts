import { execFile } from "node:child_process";
import readline from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_SERVER_URL, InterviewSession, loadProgress, loadProjectConfig, loadUserConfig, saveUserConfig, userConfigPath,
  type Mode, type Progress, type Provider, type UserConfig, type Voice,
} from "@disappointed-dad/core";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  pink: (s: string) => `\x1b[35m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

const HELP = `
${c.bold("🧔 Disappointed Dad")}: "I'm not angry. I'm just disappointed you can't explain your own backend."

Run inside the project you want to be grilled on.

  dad                   Talk: a normal interview about this project
  dad again             Redo the topics you got wrong before ("We've been over this.")
  dad sitdown           Strict 5-question mock interview, scored /10
  dad topic <name>      Only one area, e.g. dad topic auth
  dad reportcard        Your grades so far
  dad proud             See if Dad is proud of you yet

  --hard                Harder questions, more constraint twists
  --endless             Keeps going until you type /done
  --model <id>          Model to use (default claude-opus-5-5, or gpt-oss:20b with --local)
  --local               Use a local Ollama model: free, and nothing leaves your machine
  --ollama-url <url>    Ollama address (default http://localhost:11434)
  --hosted              Use the free tier (after dad login)

During a session: /hint  /skip  /done  /quit

Setup, pick one:
  dad login             Free tier: sign in with GitHub, no API key needed
  dad config set-key    Your own Anthropic key (or set ANTHROPIC_API_KEY)
  dad --local           Ollama on your machine (dad config use-local makes it the default)

Account: dad whoami · dad logout
`;

const SECRET_HELP = `
${c.pink(c.bold("🤫 Daddy mode"))} (opt-in, not for the office)

  daddy                 Same interview, cheekier voice
  daddy harder          --hard
  daddy dontstop        --endless
  daddy again | sitdown | topic <name>
  /beg                  ...asks for a hint

Teams can disable it with {"daddyMode": false} in .disappointed-dad.json
`;

interface Parsed {
  command: string;
  rest: string[];
  hard: boolean;
  endless: boolean;
  model?: string;
  daddyFlag: boolean;
  all: boolean;
  local: boolean;
  hosted: boolean;
  ollamaUrl?: string;
}

function parse(argv: string[]): Parsed {
  const p: Parsed = { command: "talk", rest: [], hard: false, endless: false, daddyFlag: false, all: false, local: false, hosted: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hard") p.hard = true;
    else if (a === "--endless") p.endless = true;
    else if (a === "--daddy") p.daddyFlag = true;
    else if (a === "--all") p.all = true;
    else if (a === "--model") p.model = argv[++i];
    else if (a === "--local") p.local = true;
    else if (a === "--hosted") p.hosted = true;
    else if (a === "--ollama-url") { p.ollamaUrl = argv[++i]; p.local = true; }
    else if (a === "-h" || a === "--help") positional.unshift("help");
    else positional.push(a);
  }
  if (positional.length) [p.command, ...p.rest] = positional;
  // Daddy aliases map onto real features.
  if (p.command === "harder") { p.command = "talk"; p.hard = true; }
  if (p.command === "dontstop") { p.command = "talk"; p.endless = true; }
  return p;
}

async function ask(rl: readline.Interface, prompt: string) {
  try {
    return (await rl.question(prompt)).trim();
  } catch {
    return "/quit"; // stdin closed (Ctrl+C / Ctrl+D)
  }
}

const GRADE: Record<string, string> = { solid: c.green("A "), partial: c.yellow("C "), weak: c.red("D-") };

function reportCard(progress: Progress) {
  const topics = Object.entries(progress.topics);
  if (!topics.length) {
    console.log(`\n${c.bold("Report card")}: empty. "You haven't even talked to me yet." Run ${c.cyan("dad")}.\n`);
    return;
  }
  console.log(`\n${c.bold(`Report card: ${progress.project}`)}  ${c.dim(`updated ${progress.updated}`)}\n`);
  for (const [name, t] of topics) {
    console.log(`  ${GRADE[t.status] ?? "? "}  ${c.bold(name)}  ${c.dim(t.notes)}`);
  }
  if (progress.mocks.length) {
    const last = progress.mocks[progress.mocks.length - 1];
    console.log(`\n  Last sit-down: ${c.bold(`${last.score}/10`)} on ${last.date}. Weakest: ${last.weakest}`);
  }
  const weak = topics.filter(([, t]) => t.status !== "solid").length;
  console.log(
    `\n  ${weak ? `"${weak} topic${weak > 1 ? "s" : ""} to work on. I expected more." Run ${c.cyan("dad again")}.` : '"Straight A\'s. Run dad proud."'}\n`,
  );
}

function proud(progress: Progress) {
  const topics = Object.values(progress.topics);
  const lastMock = progress.mocks[progress.mocks.length - 1];
  if (topics.length >= 5 && topics.every((t) => t.status === "solid") && (lastMock?.score ?? 0) >= 9) {
    console.log(`\n🥲 "...I'm proud of you, kid. Don't tell your mother."\n`);
  } else {
    console.log(`\n😐 "Proud? Let's not get ahead of ourselves." (Needs 5+ topics all solid and a 9+/10 sit-down.)\n`);
  }
}

async function resolveVoice(rl: readline.Interface, defaultVoice: Voice, p: Parsed, root: string): Promise<Voice> {
  if (defaultVoice !== "daddy" && !p.daddyFlag) return "dad";
  if (loadProjectConfig(root).daddyMode === false) {
    console.log(c.dim("Daddy mode is disabled for this project (.disappointed-dad.json). Dad will see you instead."));
    return "dad";
  }
  const config = loadUserConfig();
  if (config.daddyUnlocked) return "daddy";
  const answer = await ask(rl, `${c.pink("You sure? This one's not for the office.")} Adults only, innuendo humor. Unlock? (y/N) `);
  if (answer.toLowerCase() !== "y") return "dad";
  saveUserConfig({ ...config, daddyUnlocked: true });
  return "daddy";
}

/** Which backend to use: explicit flag > saved default > whatever credentials exist. */
function pickProvider(p: Parsed, config: UserConfig): Provider {
  if (p.local) return "ollama";
  if (p.hosted) return "hosted";
  if (config.provider) return config.provider;
  if (process.env.ANTHROPIC_API_KEY || config.apiKey) return "anthropic";
  if (config.hostedToken) return "hosted";
  return "anthropic";
}

const serverUrl = (config: UserConfig) => (process.env.DAD_SERVER_URL ?? config.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/$/, "");

function openBrowser(url: string) {
  if (!/^https?:\/\//.test(url)) return;
  // No shell involved, so a URL can't inject commands.
  const [cmd, args] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  execFile(cmd, args as string[], () => {});
}

async function login() {
  const config = loadUserConfig();
  const server = serverUrl(config);
  const start = await fetch(`${server}/api/cli/start`, { method: "POST" }).catch(() => null);
  if (!start?.ok) throw new Error(`Can't reach the Disappointed Dad server at ${server}.`);
  const s = (await start.json()) as { device_code: string; user_code: string; verification_url: string; interval: number; expires_in: number };
  if (!s.verification_url.startsWith(server)) throw new Error("Server sent an unexpected login link. Aborting.");

  console.log(`\nYour code: ${c.bold(s.user_code)}`);
  console.log(`Opening ${c.cyan(s.verification_url)}\n(If nothing opens, paste that link into your browser.)`);
  openBrowser(s.verification_url);
  process.stdout.write(c.dim("Waiting for you to approve it in the browser..."));

  const deadline = Date.now() + s.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, s.interval * 1000));
    const res = await fetch(`${server}/api/cli/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: s.device_code }),
    }).catch(() => null);
    if (!res) continue;
    const j = (await res.json().catch(() => ({}))) as { token?: string; login?: string; error?: string };
    if (res.ok && j.token) {
      saveUserConfig({ ...loadUserConfig(), hostedToken: j.token, hostedLogin: j.login, serverUrl: server });
      console.log(`\n\n${c.green("Signed in")} as ${j.login}. "Good. Now sit down." Run ${c.cyan("dad")} in a project.`);
      return;
    }
    if (j.error !== "authorization_pending") break;
  }
  throw new Error("Login expired. Run dad login again.");
}

async function logout() {
  const config = loadUserConfig();
  if (config.hostedToken) {
    await fetch(`${serverUrl(config)}/api/cli/logout`, { method: "POST", headers: { authorization: `Bearer ${config.hostedToken}` } }).catch(() => null);
  }
  const { hostedToken: _t, hostedLogin: _l, ...rest } = config;
  saveUserConfig(rest.provider === "hosted" ? { ...rest, provider: undefined } : rest);
  console.log('Signed out. "Fine. Call me when you\'re ready to talk."');
}

async function whoami() {
  const config = loadUserConfig();
  const provider = pickProvider({ local: false, hosted: false } as Parsed, config);
  console.log(`Default mode: ${c.bold(provider === "ollama" ? "local (Ollama)" : provider === "hosted" ? "free tier" : "your own Anthropic key")}`);
  if (!config.hostedToken) return console.log(c.dim("Not signed in to the free tier. Run: dad login"));
  const res = await fetch(`${serverUrl(config)}/api/me`, { headers: { authorization: `Bearer ${config.hostedToken}` } }).catch(() => null);
  if (!res?.ok) return console.log(c.yellow("Free-tier login is invalid or the server is unreachable. Run: dad login"));
  const me = (await res.json()) as { login: string; used_today: number; daily_limit: number };
  console.log(`Free tier: ${me.login}, ${me.used_today}/${me.daily_limit} requests used today`);
}

function explainError(err: unknown, provider: Provider) {
  const local = provider === "ollama";
  if (local && err instanceof Anthropic.APIConnectionError) {
    console.error(c.red("\nCan't reach Ollama. Is it running? Start it with: ollama serve"));
  } else if (local && err instanceof Anthropic.NotFoundError) {
    console.error(c.red("\nThat model isn't downloaded. Run: ollama pull gpt-oss:20b (or pass --model <name>)"));
  } else if (provider === "hosted" && err instanceof Anthropic.AuthenticationError) {
    console.error(c.red("\nYour free-tier login expired. Run: dad login"));
  } else if (provider === "hosted" && err instanceof Anthropic.RateLimitError) {
    console.error(c.red("\nFree tier limit reached for today. Use your own key (dad config set-key) or --local."));
  } else if (provider === "hosted" && err instanceof Anthropic.APIConnectionError) {
    console.error(c.red("\nCan't reach the Disappointed Dad server. Check your connection and try again."));
  } else if (err instanceof Anthropic.AuthenticationError) {
    console.error(c.red("\nNo valid API key. Set ANTHROPIC_API_KEY or run: dad config set-key"));
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error(c.red("\nRate limited by the API. Give it a minute and try again."));
  } else if (err instanceof Anthropic.APIError) {
    console.error(c.red(`\nAPI error ${err.status}: ${err.message}`));
  } else if (err instanceof Anthropic.AnthropicError) {
    console.error(c.red(`\n${err.message}`));
  } else {
    console.error(c.red(`\n${err instanceof Error ? err.message : String(err)}`));
  }
}

export async function main(argv: string[], defaultVoice: Voice) {
  const p = parse(argv);
  const root = process.cwd();
  const provider = pickProvider(p, loadUserConfig());
  const local = provider === "ollama";

  if (["login", "logout", "whoami"].includes(p.command)) {
    try {
      await (p.command === "login" ? login() : p.command === "logout" ? logout() : whoami());
    } catch (err) {
      console.error(c.red(`\n${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
    return;
  }

  if (p.command === "help") {
    console.log(HELP + (p.all || defaultVoice === "daddy" ? SECRET_HELP : c.dim("🤫 There's a hidden mode. Try: dad --help --all\n")));
    return;
  }
  if (p.command === "reportcard") return reportCard(loadProgress(root));
  if (p.command === "proud") return proud(loadProgress(root));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => { console.log(c.dim("\n\"Fine. Walk away. We'll talk later.\"")); process.exit(0); });

  try {
    if (p.command === "config") {
      const config = loadUserConfig();
      if (p.rest[0] === "set-key") {
        const key = await ask(rl, "Paste your Anthropic API key (stored in your home folder, not this project): ");
        if (key) saveUserConfig({ ...config, apiKey: key });
        console.log(`Saved to ${userConfigPath()}`);
      } else if (p.rest[0] === "lock-daddy") {
        saveUserConfig({ ...config, daddyUnlocked: false });
        console.log("Daddy mode locked again.");
      } else if (p.rest[0] === "use-local") {
        saveUserConfig({ ...config, provider: "ollama" });
        console.log("Default is now a local Ollama model. Nothing leaves your machine.");
      } else if (p.rest[0] === "use-claude") {
        saveUserConfig({ ...config, provider: "anthropic" });
        console.log("Default is now the Claude API with your key.");
      } else if (p.rest[0] === "use-hosted") {
        saveUserConfig({ ...config, provider: "hosted" });
        console.log("Default is now the free tier (run dad login if you haven't).");
      } else if (p.rest[0] === "set-server" && /^https?:\/\//.test(p.rest[1] ?? "")) {
        saveUserConfig({ ...config, serverUrl: p.rest[1].replace(/\/$/, "") });
        console.log(`Free-tier server set to ${p.rest[1]}. Run dad login.`);
      } else {
        console.log("Usage: dad config set-key | use-local | use-claude | use-hosted | set-server <url> | lock-daddy");
      }
      return;
    }

    const modes: Record<string, Mode> = { talk: "talk", again: "again", sitdown: "sitdown", topic: "topic" };
    const mode = modes[p.command];
    if (!mode) {
      console.log(`Unknown command "${p.command}". "Did you even read the help?"\n${HELP}`);
      return;
    }
    if (mode === "topic" && !p.rest.length) {
      console.log("Which topic? e.g. dad topic auth");
      return;
    }

    const config = loadUserConfig();
    if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !config.apiKey) {
      console.log(`\n"Before we talk, I need a brain." Pick one:\n
  ${c.cyan("dad login")}             Free tier: sign in with GitHub, no key needed
  ${c.cyan("dad config set-key")}    Use your own Anthropic API key
  ${c.cyan("dad --local")}           Use a local Ollama model (nothing leaves your machine)\n`);
      return;
    }
    const voice = await resolveVoice(rl, defaultVoice, p, root);
    const accent = voice === "daddy" ? c.pink : c.cyan;
    const name = voice === "daddy" ? "Daddy" : "Dad";

    console.log(c.dim("Reading your project (secrets and ignored files are skipped)..."));
    if (local) console.log(c.dim("Local mode: using Ollama, nothing leaves this machine."));
    if (provider === "hosted") console.log(c.dim("Free tier: snippets pass through the Disappointed Dad server to the AI and are never stored."));
    const session = await InterviewSession.create({
      root,
      provider,
      ollamaUrl: p.ollamaUrl,
      serverUrl: serverUrl(config),
      hostedToken: config.hostedToken,
      mode,
      voice,
      topic: p.rest.join(" ") || undefined,
      hard: p.hard,
      endless: p.endless,
      model: p.model ?? (local ? undefined : config.model),
      apiKey: process.env.ANTHROPIC_API_KEY ? undefined : config.apiKey,
    });
    console.log(c.dim(`${session.snapshot.fileCount} files in ${session.snapshot.name}. Commands: /hint /skip /done /quit\n`));

    let started = false;
    const handlers = {
      onText: (d: string) => {
        if (!started) { process.stdout.write(accent(c.bold(`${name} › `))); started = true; }
        process.stdout.write(d);
      },
      onToolUse: (kind: string, detail: string) => {
        process.stdout.write(c.dim(`${started ? "\n" : ""}  (${name} is looking at ${kind === "commit" ? "commit " : ""}${detail})\n`));
        started = false;
      },
      onNotice: (m: string) => console.log(c.yellow(`\n${m}`)),
      onProgressCreated: (dir: string) =>
        console.log(c.dim(`\n  (Progress saved in ${dir}. Add it to .gitignore if you don't want it committed.)`)),
    };

    const turn = async (text: string | null) => {
      started = false;
      if (text === null) await session.start(handlers);
      else await session.send(text, handlers);
      process.stdout.write("\n\n");
    };

    await turn(null);
    for (;;) {
      let input = await ask(rl, c.bold("you › "));
      if (!input) continue;
      if (input === "/quit" || input === "/exit") break;
      if (input === "/beg") input = "/hint";
      await turn(input);
      if (input === "/done") break;
    }
    console.log(c.dim(`See how you did: dad reportcard`));
  } catch (err) {
    explainError(err, provider);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}
