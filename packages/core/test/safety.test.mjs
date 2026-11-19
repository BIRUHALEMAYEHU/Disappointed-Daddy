import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FsSource, isSensitive, isForbiddenPath, listSafeFiles, readForModel, buildSnapshot, commitForModel, parseGithubRepo,
  loadProgress, saveProgress, recordVerdict, recordMock, reviewQueue,
} from "../dist/index.js";

let root;
let source;
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dad-test-"));
  write("package.json", '{"name":"fixture"}');
  write("src/server.js", "app.use(auth);");
  write("README.md", "# Fixture");
  write(".env", "SECRET=do-not-send");
  write(".env.local", "SECRET=do-not-send");
  write("keys/server.pem", "-----BEGIN PRIVATE KEY-----");
  write("config/credentials.json", '{"token":"do-not-send"}');
  write("node_modules/lib/index.js", "ignored");
  write("ignored-by-git/notes.txt", "ignored");
  write(".gitignore", "ignored-by-git/\n");
  git("init", "-q");
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  source = new FsSource(root);
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

test("sensitive file patterns", () => {
  for (const p of [".env", "api/.env.production", ".env.example", "a/b/id_rsa", "x.pem", "x.key", ".npmrc", "secrets.yaml", "gcp-service-account.json", "credentials.json"]) {
    assert.equal(isSensitive(p), true, p);
  }
  for (const p of ["src/env.ts", "README.md", "src/keyboard.ts", "docs/environment.md"]) {
    assert.equal(isSensitive(p), false, p);
  }
});

test("forbidden paths: escapes, absolute, skipped folders, secrets", () => {
  for (const p of ["../x", "a/../../x", "/etc/passwd", "C:/Windows/win.ini", "c:\\x", "node_modules/a.js", ".git/config", ".env", ""]) {
    assert.equal(isForbiddenPath(p), true, p);
  }
  assert.equal(isForbiddenPath("src/server.js"), false);
});

test("listSafeFiles skips secrets, node_modules and gitignored files", async () => {
  const files = await listSafeFiles(source);
  assert.ok(files.includes("src/server.js"));
  for (const f of files) {
    assert.ok(!f.startsWith(".env"), f);
    assert.ok(!f.endsWith(".pem"), f);
    assert.ok(!f.includes("credentials"), f);
    assert.ok(!f.startsWith("node_modules/"), f);
    assert.ok(!f.startsWith("ignored-by-git/"), f);
  }
});

test("readForModel refuses secrets, escapes and ignored folders", async () => {
  assert.match(await readForModel(source, "src/server.js"), /app\.use/);
  for (const p of [".env", ".env.local", "keys/server.pem", "config/credentials.json", "../outside.txt", "node_modules/lib/index.js", path.resolve(os.tmpdir(), "x")]) {
    assert.match(await readForModel(source, p), /^Refused/, p);
  }
});

test("snapshot never contains secret contents", async () => {
  const snap = await buildSnapshot(source);
  assert.ok(!snap.text.includes("do-not-send"));
  assert.ok(snap.text.includes("src/server.js"));
  assert.match(snap.text, /1 commits total/);
});

test("commitForModel only accepts hex hashes and strips secret diffs", async () => {
  assert.match(await commitForModel(source, "HEAD; rm -rf /"), /^Refused/);
  const hash = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const out = await commitForModel(source, hash);
  assert.match(out, /init/);
  assert.ok(!out.includes("do-not-send"), "secret diff leaked");
});

test("parseGithubRepo", () => {
  assert.deepEqual(parseGithubRepo("vercel/next.js"), { owner: "vercel", repo: "next.js" });
  assert.deepEqual(parseGithubRepo("https://github.com/a-b/c_d.git"), { owner: "a-b", repo: "c_d" });
  assert.deepEqual(parseGithubRepo("https://github.com/a/b/"), { owner: "a", repo: "b" });
  for (const bad of ["", "a", "a/b/c", "https://evil.com/a/b", "a/..", "../x", "a b/c"]) {
    assert.equal(parseGithubRepo(bad), null, bad);
  }
});

test("progress round-trip and review order", () => {
  const p = loadProgress(root);
  recordVerdict(p, "Auth", "partial", ["src/server.js"], "vague why");
  recordVerdict(p, "DB", "weak", [], "guessing");
  recordVerdict(p, "API", "solid", [], "good");
  recordMock(p, 7, "Caching");
  assert.equal(saveProgress(root, p), true);
  const loaded = loadProgress(root);
  assert.deepEqual(reviewQueue(loaded), ["DB", "Auth"]);
  assert.equal(loaded.mocks[0].score, 7);
});
