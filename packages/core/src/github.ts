import { MAX_FILE_BYTES, type GitSummary, type RepoSource } from "./scanner.js";

/** GitHub usernames/orgs: letters, digits, hyphens. Repo names may also contain "." and "_". */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;

/** Parses "owner/repo", "https://github.com/owner/repo(.git)" etc. Returns null if it isn't a GitHub repo. */
export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const m = input.trim().match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  if (!m || !OWNER.test(m[1]) || !REPO.test(m[2])) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Reads a GitHub repository through the REST API (no cloning). Used by the web app.
 * Call `init()` first. The token only needs to identify the user (public repos).
 */
export class GitHubSource implements RepoSource {
  readonly name: string;
  private branch = "";
  private sizes = new Map<string, number>();
  private files: string[] = [];
  isPrivate = false;
  truncated = false;

  constructor(readonly owner: string, readonly repo: string, private readonly token?: string) {
    if (!OWNER.test(owner) || !REPO.test(repo)) throw new Error("Invalid repository name.");
    this.name = repo;
  }

  private async api<T>(pathAndQuery: string, accept = "application/vnd.github+json"): Promise<{ data: T; res: Response } | null> {
    const res = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${pathAndQuery}`, {
      headers: {
        accept,
        "user-agent": "disappointed-dad",
        "x-github-api-version": "2022-11-28",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached. Try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
    const data = (accept.endsWith("raw") ? await res.text() : await res.json()) as T;
    return { data, res };
  }

  async init(): Promise<this> {
    const meta = await this.api<{ default_branch: string; private: boolean }>("");
    if (!meta) throw new Error(`Repository ${this.owner}/${this.repo} not found (or it's private).`);
    this.branch = meta.data.default_branch;
    this.isPrivate = meta.data.private;
    const tree = await this.api<{ tree: Array<{ path: string; type: string; size?: number }>; truncated: boolean }>(
      `/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
    );
    if (!tree) throw new Error("Repository is empty.");
    this.truncated = tree.data.truncated;
    for (const entry of tree.data.tree) {
      if (entry.type !== "blob") continue;
      this.files.push(entry.path);
      this.sizes.set(entry.path, entry.size ?? 0);
    }
    return this;
  }

  async listFiles() {
    return this.files;
  }

  async readFile(rel: string): Promise<string | null> {
    const size = this.sizes.get(rel);
    if (size === undefined || size > MAX_FILE_BYTES) return null;
    const encoded = rel.split("/").map(encodeURIComponent).join("/");
    const got = await this.api<string>(`/contents/${encoded}?ref=${encodeURIComponent(this.branch)}`, "application/vnd.github.raw");
    if (!got || got.data.includes("\0")) return null;
    return got.data;
  }

  async gitSummary(): Promise<GitSummary | null> {
    const commits = await this.api<Array<{ sha: string; commit: { message: string; author: { date: string } | null } }>>(
      `/commits?sha=${encodeURIComponent(this.branch)}&per_page=80`,
    );
    if (!commits) return null;
    const log = commits.data
      .map((c) => `${c.sha.slice(0, 7)} ${c.commit.author?.date.slice(0, 10) ?? ""} ${c.commit.message.split("\n")[0]}`)
      .join("\n");
    // Total count trick: with per_page=1, the "last" page number equals the commit count.
    let count: number | null = commits.data.length < 80 ? commits.data.length : null;
    if (count === null) {
      const one = await this.api<unknown[]>(`/commits?sha=${encodeURIComponent(this.branch)}&per_page=1`);
      const last = one?.res.headers.get("link")?.match(/[?&]page=(\d+)>;\s*rel="last"/);
      count = last ? Number(last[1]) : null;
    }
    return { count, log, changes: null };
  }

  async showCommit(hash: string): Promise<string | null> {
    const got = await this.api<{
      sha: string;
      commit: { message: string; author: { name: string; date: string } | null };
      stats?: { additions: number; deletions: number };
      files?: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
    }>(`/commits/${hash}`);
    if (!got) return null;
    const c = got.data;
    const header = `${c.sha.slice(0, 7)} ${c.commit.author?.date.slice(0, 10) ?? ""} ${c.commit.author?.name ?? ""}\n${c.commit.message}\n`;
    const stat = (c.files ?? []).map((f) => ` ${f.filename} | +${f.additions} -${f.deletions} (${f.status})`).join("\n");
    // Same "diff --git a/<path>" shape as local git, so the shared sensitive-file filter applies.
    const diffs = (c.files ?? []).map((f) => `diff --git a/${f.filename} b/${f.filename}\n${f.patch ?? "(binary or too large)"}\n`).join("");
    return `${header}\n${stat}\n\n${diffs}`;
  }
}
