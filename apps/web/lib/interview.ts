import {
  buildSnapshot, emptyProgress, GitHubSource,
  type Progress, type ProgressStore, type RepoSnapshot,
} from "@disappointed-dad/core";
import { loadWebProgress, saveWebProgress } from "./db";

/** Grades for one user + repo, kept in the database (topic names and notes only, no code). */
export class DbProgressStore implements ProgressStore {
  constructor(private readonly userId: number, private readonly repo: string) {}
  async load(): Promise<Progress> {
    return ((await loadWebProgress(this.userId, this.repo)) as Progress | null) ?? emptyProgress(this.repo);
  }
  async save(progress: Progress): Promise<boolean> {
    progress.updated = new Date().toISOString().slice(0, 10);
    return saveWebProgress(this.userId, this.repo, progress);
  }
}

interface Cached {
  source: GitHubSource;
  snapshot: RepoSnapshot;
  at: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;
const g = globalThis as unknown as { __repoCache?: Map<string, Cached> };
const cache = (g.__repoCache ??= new Map());

/**
 * Loads a repo from GitHub and builds its snapshot, reusing a recent copy on this server instance.
 * Keyed per user, so one user's view of a repo is never served to another.
 * The cache lives in memory only and expires after 10 minutes.
 */
export async function loadRepo(userId: number, owner: string, repo: string, token: string | null): Promise<Cached> {
  const key = `${userId}:${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const source = await new GitHubSource(owner, repo, token ?? undefined).init();
  const snapshot = await buildSnapshot(source);
  const entry = { source, snapshot, at: Date.now() };

  cache.set(key, entry);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return entry;
}
