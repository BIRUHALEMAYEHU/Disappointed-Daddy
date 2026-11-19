import fs from "node:fs";
import path from "node:path";

export type Status = "solid" | "partial" | "weak";

export interface TopicRecord {
  files: string[];
  status: Status;
  lastAsked: string;
  notes: string;
}

export interface MockRecord {
  date: string;
  score: number;
  weakest: string;
}

export interface Progress {
  project: string;
  updated: string;
  topics: Record<string, TopicRecord>;
  mocks: MockRecord[];
}

/** Where grades are kept: a local file (CLI, VS Code) or the database (web). */
export interface ProgressStore {
  load(): Promise<Progress>;
  /** Returns true the first time something is saved (so the UI can mention where). */
  save(progress: Progress): Promise<boolean>;
}

export const STATE_DIR = ".disappointed-dad";
const today = () => new Date().toISOString().slice(0, 10);

export function emptyProgress(project: string): Progress {
  return { project, updated: today(), topics: {}, mocks: [] };
}

function file(root: string) {
  return path.join(root, STATE_DIR, "progress.json");
}

export function loadProgress(root: string): Progress {
  try {
    return JSON.parse(fs.readFileSync(file(root), "utf8")) as Progress;
  } catch {
    return emptyProgress(path.basename(path.resolve(root)));
  }
}

export function saveProgress(root: string, progress: Progress): boolean {
  const dir = path.join(root, STATE_DIR);
  const isNew = !fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });
  progress.updated = today();
  fs.writeFileSync(file(root), JSON.stringify(progress, null, 2) + "\n");
  return isNew;
}

/** The default store: .disappointed-dad/progress.json in the project folder. */
export class FileProgressStore implements ProgressStore {
  constructor(private readonly root: string) {}
  async load() {
    return loadProgress(this.root);
  }
  async save(progress: Progress) {
    return saveProgress(this.root, progress);
  }
}

export function recordVerdict(progress: Progress, topic: string, status: Status, files: string[], notes: string) {
  progress.topics[topic] = { status, files, notes, lastAsked: today() };
}

export function recordMock(progress: Progress, score: number, weakest: string) {
  progress.mocks.push({ date: today(), score, weakest });
}

/** Topics to re-drill: weak first, then partial, oldest first. */
export function reviewQueue(progress: Progress): string[] {
  const rank: Record<Status, number> = { weak: 0, partial: 1, solid: 2 };
  return Object.entries(progress.topics)
    .filter(([, t]) => t.status !== "solid")
    .sort(([, a], [, b]) => rank[a.status] - rank[b.status] || a.lastAsked.localeCompare(b.lastAsked))
    .map(([name]) => name);
}

export function summarizeProgress(progress: Progress): string {
  const rows = Object.entries(progress.topics).map(
    ([name, t]) => `- ${name} [${t.status}] (${t.lastAsked}) ${t.files.join(", ")}: ${t.notes}`,
  );
  const mocks = progress.mocks.slice(-5).map((m) => `- ${m.date}: ${m.score}/10, weakest: ${m.weakest}`);
  if (!rows.length && !mocks.length) return "No previous sessions.";
  return [`Topics:\n${rows.join("\n") || "- none"}`, `Recent mock scores:\n${mocks.join("\n") || "- none"}`].join("\n");
}
