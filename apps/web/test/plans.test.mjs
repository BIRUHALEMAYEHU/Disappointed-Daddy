import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { compedGithubIds, isPro, proSource } from "../lib/plans.ts";

const base = { githubId: "1001", plan: "none", proUntil: null };
afterEach(() => delete process.env.PRO_GITHUB_IDS);

test("nobody is Pro by default", () => {
  assert.equal(isPro(base), false);
  assert.equal(proSource(base), null);
});

test("comped by numeric GitHub ID from the server env", () => {
  process.env.PRO_GITHUB_IDS = "190499371, 1001\n42";
  assert.equal(proSource(base), "comped");
  assert.equal(isPro({ ...base, githubId: "42" }), true);
  assert.equal(isPro({ ...base, githubId: "999" }), false);
});

test("allowlist ignores usernames and junk, so a renamed account can't be targeted", () => {
  process.env.PRO_GITHUB_IDS = "alice, 12ab, -5, , 1001.0, 7";
  assert.deepEqual([...compedGithubIds()], ["7"]);
  assert.equal(isPro(base), false);
});

test("manual plan override", () => {
  assert.equal(proSource({ ...base, plan: "pro" }), "manual");
});

test("paid access only until pro_until", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(proSource({ ...base, proUntil: new Date("2026-12-20T00:00:00Z") }, now), "paid");
  assert.equal(proSource({ ...base, proUntil: new Date("2026-11-19T00:00:00Z") }, now), null);
});
