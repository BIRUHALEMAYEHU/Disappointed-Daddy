import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Directories never worth sending to the model. */
export const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", "coverage",
  "vendor", "venv", ".venv", "__pycache__", "target", "bin", "obj", ".idea",
  ".vscode", ".disappointed-dad", ".turbo", ".cache",
]);

/** Files that may hold secrets. These are never read or listed. */
const SENSITIVE = [
  /(^|\/)\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks|crt|cer)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)credentials(\.json)?$/i,
  /(^|\/)secrets?\.(json|ya?ml|toml)$/i,
  /service[-_]?account.*\.json$/i,
];

export const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|rar|7z|gz|tar|mp[34]|mov|avi|woff2?|ttf|otf|eot|exe|dll|so|dylib|class|jar|pyc|lock|db|sqlite)$/i;

const MANIFESTS = /^(package\.json|requirements\.txt|pyproject\.toml|setup\.py|Pipfile|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|composer\.json|Gemfile|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|vercel\.json|netlify\.toml|tsconfig\.json|next\.config\.(js|mjs|ts)|vite\.config\.(js|ts))$/i;
const ENTRY = /(^|\/)(server|app|main|index|routes?|api|middleware|schema|models?|db|database|auth)\.(js|ts|mjs|cjs|jsx|tsx|py|go|rb|php|java|kt|rs)$/i;
const SCHEMA = /(^|\/)(prisma\/schema\.prisma|.*\.sql|.*models?\.py|.*schema\.(ts|js|graphql|gql))$/i;

const MAX_TREE = 500;
const MAX_FILE_CHARS = 8_000;
const MAX_SNAPSHOT_CHARS = 60_000;
export const MAX_READ_CHARS = 40_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function isSensitive(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  return SENSITIVE.some((re) => re.test(p));
}

/** True for paths the model must never see: secrets, skipped folders, escapes, absolute paths. */
export function isForbiddenPath(rel: string): boolean {
  const p = rel.replace(/\\/g, "/");
  if (!p || p.startsWith("/") || /^[a-z]:/i.test(p)) return true;
  const parts = p.split("/");
  return parts.includes("..") || parts.some((part) => SKIP_DIRS.has(part)) || isSensitive(p);
}

export function capText(text: string, cap: number): string {
  return text.length > cap ? text.slice(0, cap) + `\n… [truncated, ${text.length - cap} more chars]` : text;
}

export interface GitSummary {
  /** Total commits, if known. */
  count: number | null;
  /** One line per commit: "<hash> <date> <subject>", newest first. */
  log: string;
  /** Files added/deleted/renamed per commit, if available. */
  changes: string | null;
}

/**
 * Where the code comes from: the local disk (CLI, VS Code) or GitHub (web app).
 * Implementations return raw data; the safety checks live in this module, not in each source.
 */
export interface RepoSource {
  readonly name: string;
  /** All file paths (forward slashes, relative). Filtering is applied by the caller. */
  listFiles(): Promise<string[]>;
  /** Text contents, or null if missing, too large or binary. */
  readFile(rel: string): Promise<string | null>;
  gitSummary(): Promise<GitSummary | null>;
  /** Commit message, stats and diff text, or null if not found. Hash is pre-validated. */
  showCommit(hash: string): Promise<string | null>;
}

// ---------- local disk ----------

function git(root: string, args: string[], maxBuffer = 20 * 1024 * 1024): string | null {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Reads a project from a folder on disk, respecting .gitignore when it's a git repo. */
export class FsSource implements RepoSource {
  readonly name: string;
  constructor(readonly root: string) {
    this.name = path.basename(path.resolve(root));
  }

  async listFiles(): Promise<string[]> {
    const out = git(this.root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
    if (out !== null) return out.split("\0").filter(Boolean);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(this.root, dir), { withFileTypes: true })) {
        if (files.length > 20_000) return;
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(rel);
        } else if (entry.isFile()) {
          files.push(rel);
        }
      }
    };
    walk("");
    return files;
  }

  async readFile(rel: string): Promise<string | null> {
    const abs = path.resolve(this.root, rel);
    const relative = path.relative(this.root, abs);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null; // defence in depth
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
      const text = fs.readFileSync(abs, "utf8");
      return text.includes("\0") ? null : text;
    } catch {
      return null;
    }
  }

  async gitSummary(): Promise<GitSummary | null> {
    if (git(this.root, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return null;
    const count = Number(git(this.root, ["rev-list", "--count", "HEAD"])?.trim() ?? NaN);
    return {
      count: Number.isFinite(count) ? count : null,
      log: (git(this.root, ["log", "-n", "80", "--date=short", "--format=%h %ad %s"]) ?? "").trim(),
      changes: (git(this.root, ["log", "-n", "40", "--diff-filter=ADR", "--name-status", "--format=--- %h %s"]) ?? "").trim(),
    };
  }

  async showCommit(hash: string): Promise<string | null> {
    return git(this.root, ["show", "--stat", "--patch", "--format=%h %ad %an%n%s%n%n%b", "--date=short", hash]);
  }
}

// ---------- safe, source-independent operations ----------

/** Project files the model may know about. */
export async function listSafeFiles(source: RepoSource): Promise<string[]> {
  return (await source.listFiles())
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => !isForbiddenPath(f))
    .sort();
}

/** Tool backend: read one project file for the model. */
export async function readForModel(source: RepoSource, rel: string): Promise<string> {
  if (isForbiddenPath(rel)) return `Refused: "${rel}" is outside the project, ignored, or may contain secrets.`;
  if (BINARY_EXT.test(rel)) return `Refused: "${rel}" is a binary or lock file.`;
  const text = await source.readFile(rel.replace(/\\/g, "/"));
  if (text === null) return `Could not read "${rel}" (missing, too large, or binary).`;
  return capText(text, MAX_READ_CHARS);
}

/** Tool backend: show one commit, with diffs of sensitive files removed. */
export async function commitForModel(source: RepoSource, hash: string): Promise<string> {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) return "Refused: commit must be a hex hash.";
  const out = await source.showCommit(hash);
  if (out === null) return `No commit "${hash}" found.`;
  const cleaned = out
    .split(/^(?=diff --git )/m)
    .filter((chunk) => {
      const m = chunk.match(/^diff --git a\/(\S+)/);
      return !m || !isSensitive(m[1]);
    })
    .join("");
  return cleaned.length > 15_000 ? cleaned.slice(0, 15_000) + "\n… [diff truncated]" : cleaned;
}

export interface RepoSnapshot {
  name: string;
  fileCount: number;
  text: string;
}

/** Builds the initial context the interviewer sees: tree, key files, history. */
export async function buildSnapshot(source: RepoSource, opts: { maxChars?: number } = {}): Promise<RepoSnapshot> {
  const maxChars = opts.maxChars ?? MAX_SNAPSHOT_CHARS;
  const files = await listSafeFiles(source);
  const parts: string[] = [];

  parts.push(`## File tree (${files.length} files${files.length > MAX_TREE ? `, first ${MAX_TREE} shown` : ""})\n${files.slice(0, MAX_TREE).join("\n")}`);

  const history = await source.gitSummary();
  if (history) {
    parts.push(`## Git history (${history.count ?? "unknown number of"} commits total, latest 80)\n${history.log}`);
    if (history.changes) parts.push(`## Files added/deleted/renamed (latest 40 commits)\n${history.changes.slice(0, 8_000)}`);
  } else {
    parts.push("## Git history\nNot available.");
  }

  const isReadme = (f: string) => /^readme(\.\w+)?$/i.test(f);
  const score = (f: string) => {
    const base = f.split("/").pop() ?? f;
    const depth = f.split("/").length;
    if (isReadme(f)) return 0;
    if (MANIFESTS.test(base) && depth <= 3) return 1 + depth;
    if (SCHEMA.test(f)) return 5 + depth;
    if (ENTRY.test(f)) return 6 + depth;
    return Infinity;
  };
  const keyFiles = files
    .filter((f) => !BINARY_EXT.test(f) && score(f) !== Infinity)
    .sort((a, b) => score(a) - score(b))
    .slice(0, 25);

  let budget = maxChars;
  const included: string[] = [];
  for (const f of keyFiles) {
    if (budget <= 0) break;
    const text = await source.readFile(f);
    if (!text) continue;
    const capped = capText(text, Math.min(MAX_FILE_CHARS, budget));
    included.push(`### ${f}\n\`\`\`\n${capped}\n\`\`\``);
    budget -= capped.length;
  }
  parts.push(`## Key files\n${included.join("\n\n") || "(none found)"}`);

  return { name: source.name, fileCount: files.length, text: parts.join("\n\n") };
}
