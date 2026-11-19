import * as vscode from "vscode";
import {
  DEFAULT_SERVER_URL, InterviewSession, isForbiddenPath, loadProgress, loadProjectConfig, loadUserConfig,
  type Mode, type Progress, type Provider, type Voice,
} from "@disappointed-dad/core";
import { webviewHtml } from "./webview";

const SECRET_KEY = "disappointedDad.anthropicApiKey";

export function activate(context: vscode.ExtensionContext) {
  const register = (id: string, fn: () => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register("disappointedDad.start", () => startInterview(context));
  register("disappointedDad.reportCard", () => showReportCard());
  register("disappointedDad.setApiKey", async () => {
    const key = await vscode.window.showInputBox({ prompt: "Anthropic API key (stored in VS Code's secret storage)", password: true, ignoreFocusOut: true });
    if (key?.trim()) {
      await context.secrets.store(SECRET_KEY, key.trim());
      vscode.window.showInformationMessage("Saved. \"Good. Now sit down.\"");
    }
  });
  register("disappointedDad.clearApiKey", async () => {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage("API key removed.");
  });
}

export function deactivate() {}

/** The folder to interview on: the active file's workspace folder, else the first one. */
function projectRoot(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  const folder = (active && vscode.workspace.getWorkspaceFolder(active)) ?? vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

interface Brain {
  provider: Provider;
  apiKey?: string;
  hostedToken?: string;
  serverUrl?: string;
  ollamaUrl?: string;
  model?: string;
}

/** Picks the model backend from settings, the secret store, the environment and the CLI's `dad login`. */
async function resolveBrain(context: vscode.ExtensionContext): Promise<Brain | null> {
  const cfg = vscode.workspace.getConfiguration("disappointedDad");
  const choice = cfg.get<string>("provider", "auto");
  const cli = loadUserConfig();
  const apiKey = (await context.secrets.get(SECRET_KEY)) ?? process.env.ANTHROPIC_API_KEY ?? cli.apiKey;
  const model = cfg.get<string>("model") || undefined;
  const serverUrl = cfg.get<string>("serverUrl") || cli.serverUrl || DEFAULT_SERVER_URL;

  if (choice === "ollama") return { provider: "ollama", ollamaUrl: cfg.get<string>("ollamaUrl"), model };
  if (choice === "anthropic" && apiKey) return { provider: "anthropic", apiKey, model };
  if (choice === "hosted" && cli.hostedToken) return { provider: "hosted", hostedToken: cli.hostedToken, serverUrl };
  if (choice === "auto" && apiKey) return { provider: "anthropic", apiKey, model };
  if (choice === "auto" && cli.hostedToken) return { provider: "hosted", hostedToken: cli.hostedToken, serverUrl };

  const pick = await vscode.window.showWarningMessage(
    "Dad needs a brain first.",
    "Set API Key",
    "Free tier (dad login)",
    "Use local Ollama",
  );
  if (pick === "Set API Key") await vscode.commands.executeCommand("disappointedDad.setApiKey");
  else if (pick === "Use local Ollama") await cfg.update("provider", "ollama", vscode.ConfigurationTarget.Global);
  else if (pick === "Free tier (dad login)") {
    const terminal = vscode.window.createTerminal("Disappointed Dad");
    terminal.show();
    terminal.sendText("dad login", false); // typed, not run: the user presses Enter
    vscode.window.showInformationMessage("Press Enter in the terminal to sign in, then start the interview again.");
    return null;
  }
  return pick ? resolveBrain(context) : null;
}

async function startInterview(context: vscode.ExtensionContext) {
  const root = projectRoot();
  if (!root) return vscode.window.showWarningMessage("Open a project folder first. \"What am I supposed to look at, son?\"");

  const modes: Array<vscode.QuickPickItem & { mode: Mode; hard?: boolean }> = [
    { label: "$(comment-discussion) Talk", description: "A normal interview about this project", mode: "talk" },
    { label: "$(flame) Talk (hard)", description: "Straight to why and trade-offs, more twists", mode: "talk", hard: true },
    { label: "$(history) Again", description: "Redo the topics you got wrong before", mode: "again" },
    { label: "$(law) Sit-down", description: "Strict 5-question mock interview, scored /10", mode: "sitdown" },
    { label: "$(target) One topic", description: "Just one area, e.g. auth", mode: "topic" },
  ];
  const picked = await vscode.window.showQuickPick(modes, { title: "Disappointed Dad", placeHolder: "\"Son, we need to talk.\" Pick a mode" });
  if (!picked) return;
  let topic: string | undefined;
  if (picked.mode === "topic") {
    topic = (await vscode.window.showInputBox({ prompt: "Which topic?", placeHolder: "auth, database, caching…" }))?.trim();
    if (!topic) return;
  }

  const brain = await resolveBrain(context);
  if (!brain) return;

  const daddyAllowed = loadProjectConfig(root).daddyMode !== false;
  const voice: Voice = daddyAllowed && vscode.workspace.getConfiguration("disappointedDad").get<boolean>("daddyMode") ? "daddy" : "dad";
  await InterviewPanel.open(context, { root, mode: picked.mode, hard: picked.hard, topic, voice, brain });
}

interface PanelOptions {
  root: string;
  mode: Mode;
  hard?: boolean;
  topic?: string;
  voice: Voice;
  brain: Brain;
}

class InterviewPanel {
  private session: InterviewSession | null = null;
  private busy = false;

  private constructor(private readonly panel: vscode.WebviewPanel, private readonly opts: PanelOptions) {}

  static async open(context: vscode.ExtensionContext, opts: PanelOptions) {
    const name = opts.voice === "daddy" ? "Daddy" : "Dad";
    const panel = vscode.window.createWebviewPanel("disappointedDad", `${opts.voice === "daddy" ? "😏" : "🧔"} ${name}`, vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    });
    panel.webview.html = webviewHtml(panel.webview.cspSource, name);
    const self = new InterviewPanel(panel, opts);
    panel.webview.onDidReceiveMessage((m) => self.onMessage(m), undefined, context.subscriptions);
    await self.begin();
  }

  private post(message: object) {
    void this.panel.webview.postMessage(message);
  }

  private handlers() {
    return {
      onText: (delta: string) => this.post({ type: "text", delta }),
      onToolUse: (kind: string, detail: string) => this.post({ type: "tool", kind, detail }),
      onNotice: (message: string) => this.post({ type: "notice", message }),
      onProgressCreated: (where: string) =>
        this.post({ type: "notice", message: `Progress saved in ${where}. Add it to .gitignore if you don't want it committed.` }),
    };
  }

  private async run(fn: () => Promise<void>) {
    this.busy = true;
    this.post({ type: "busy", value: true });
    try {
      await fn();
    } catch (err) {
      this.post({ type: "error", message: explain(err, this.opts.brain.provider) });
    } finally {
      this.busy = false;
      this.post({ type: "busy", value: false });
      this.post({ type: "progress", progress: loadProgress(this.opts.root) });
    }
  }

  private async begin() {
    const { root, mode, hard, topic, voice, brain } = this.opts;
    await this.run(async () => {
      this.post({ type: "notice", message: "Reading your project (secrets and ignored files are skipped)…" });
      this.session = await InterviewSession.create({ root, mode, hard, topic, voice, ...brain });
      this.post({ type: "notice", message: `${this.session.snapshot.fileCount} files in ${this.session.snapshot.name}.` });
      await this.session.start(this.handlers());
    });
  }

  private async onMessage(m: { type: string; text?: string; path?: string }) {
    if (m.type === "send" && typeof m.text === "string" && m.text.trim() && this.session && !this.busy) {
      const text = m.text.trim() === "/beg" ? "/hint" : m.text.trim();
      await this.run(() => this.session!.send(text, this.handlers()));
    } else if (m.type === "open" && typeof m.path === "string" && !isForbiddenPath(m.path)) {
      // Only files inside the project that Dad is allowed to read can be opened from the chat.
      const uri = vscode.Uri.joinPath(vscode.Uri.file(this.opts.root), ...m.path.split("/"));
      vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.One }).then(undefined, () => {});
    }
  }
}

function explain(err: unknown, provider: Provider): string {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  if (provider === "ollama" && /ECONNREFUSED|Connection error/i.test(msg)) return "Can't reach Ollama. Is it running? (ollama serve)";
  if (status === 401) return provider === "hosted" ? "Your free-tier login expired. Run `dad login` in a terminal." : "Invalid API key. Run \"Disappointed Dad: Set Anthropic API Key\".";
  if (status === 429) return provider === "hosted" ? "Free tier limit reached for today." : "Rate limited. Try again in a minute.";
  return msg;
}

async function showReportCard() {
  const root = projectRoot();
  if (!root) return;
  const p: Progress = loadProgress(root);
  const grade = { solid: "A ", partial: "C ", weak: "D-" } as const;
  const rows = Object.entries(p.topics).map(([t, v]) => `${grade[v.status]}  ${t}: ${v.notes}`);
  const last = p.mocks[p.mocks.length - 1];
  const doc = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: rows.length
      ? `# Report card: ${p.project}\n\n${rows.map((r) => `- ${r}`).join("\n")}\n${last ? `\nLast sit-down: **${last.score}/10** (weakest: ${last.weakest})\n` : ""}`
      : `# Report card\n\n"You haven't even talked to me yet." Run **Disappointed Dad: Start Interview**.\n`,
  });
  vscode.window.showTextDocument(doc, { preview: true });
}
