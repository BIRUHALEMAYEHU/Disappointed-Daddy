import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GitHubSource } from "../dist/index.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Fake GitHub: rejects any Authorization header with 401, serves a tiny public repo otherwise. */
function fakeGitHub(calls) {
  return async (url, init) => {
    const auth = init?.headers?.authorization;
    calls.push({ url: String(url), auth: Boolean(auth) });
    if (auth) return new Response('{"message":"Bad credentials"}', { status: 401 });
    if (String(url).endsWith("/repos/octo/demo")) return Response.json({ default_branch: "main", private: false });
    if (String(url).includes("/git/trees/")) return Response.json({ truncated: false, tree: [{ path: "README.md", type: "blob", size: 5 }] });
    if (String(url).includes("/contents/README.md")) return new Response("hello");
    return new Response("{}", { status: 404 });
  };
}

test("a rejected (expired/revoked) token falls back to anonymous access for public repos", async () => {
  const calls = [];
  globalThis.fetch = fakeGitHub(calls);
  const src = await new GitHubSource("octo", "demo", "gho_expired").init();
  assert.equal(src.tokenRejected, true);
  assert.deepEqual(await src.listFiles(), ["README.md"]);
  assert.equal(await src.readFile("README.md"), "hello");
  // Exactly one attempt with the bad token, everything after is anonymous.
  assert.equal(calls.filter((c) => c.auth).length, 1);
});

test("rate limit message is friendly", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 403 });
  await assert.rejects(new GitHubSource("octo", "demo").init(), /rate limit/);
});
