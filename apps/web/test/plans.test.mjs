import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chargesCredit, compedGithubIds, isPro, proSource } from "../lib/plans.ts";

const base = { githubId: "1001", plan: "none", proUntil: null, creditMicroUsd: 0 };
afterEach(() => delete process.env.PRO_GITHUB_IDS);

test("nobody is Pro by default", () => {
  assert.equal(isPro(base), false);
  assert.equal(proSource(base), null);
});

test("comped by numeric GitHub ID from the server env, and never charged", () => {
  process.env.PRO_GITHUB_IDS = "190499371, 1001\n42";
  assert.equal(proSource(base), "comped");
  assert.equal(chargesCredit({ ...base, creditMicroUsd: 5_000_000 }), false);
  assert.equal(isPro({ ...base, githubId: "42" }), true);
  assert.equal(isPro({ ...base, githubId: "999" }), false);
});

test("allowlist ignores usernames and junk, so a renamed account can't be targeted", () => {
  process.env.PRO_GITHUB_IDS = "alice, 12ab, -5, , 1001.0, 7";
  assert.deepEqual([...compedGithubIds()], ["7"]);
  assert.equal(isPro(base), false);
});

test("manual plan override is not charged", () => {
  assert.equal(proSource({ ...base, plan: "pro" }), "manual");
  assert.equal(chargesCredit({ ...base, plan: "pro", creditMicroUsd: 9_000_000 }), false);
});

test("credit users are Pro only with a balance, and are charged", () => {
  assert.equal(proSource({ ...base, creditMicroUsd: 2_000_000 }), "credit");
  assert.equal(chargesCredit({ ...base, creditMicroUsd: 2_000_000 }), true);
  assert.equal(isPro({ ...base, creditMicroUsd: 19_999 }), false);
  assert.equal(isPro({ ...base, creditMicroUsd: -500 }), false);
});

test("legacy time-based grants still count until they end", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(proSource({ ...base, proUntil: new Date("2026-12-20T00:00:00Z") }, now), "legacy");
  assert.equal(proSource({ ...base, proUntil: new Date("2026-11-19T00:00:00Z") }, now), null);
});
