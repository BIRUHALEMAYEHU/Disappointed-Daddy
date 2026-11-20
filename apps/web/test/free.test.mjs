import { test } from "node:test";
import assert from "node:assert/strict";
import { freeLimits, freeModels, freeStatus } from "../lib/free.ts";

const now = new Date("2026-11-20T12:00:00Z");
const base = {
  configured: true,
  country: "ET",
  githubCreatedAt: new Date("2024-12-03T00:00:00Z"),
  termsAcceptedAt: new Date("2026-11-20T10:00:00Z"),
  interviewsToday: 0,
  turnsToday: 0,
  starting: true,
  limits: freeLimits({}),
  now,
};

test("free models: a fallback chain by default, configurable, junk ignored", () => {
  assert.deepEqual(freeModels({}), ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite-preview"]);
  assert.deepEqual(freeModels({ FREE_MODEL: "a, b" }), ["a", "b"]);
  assert.deepEqual(freeModels({ FREE_MODEL: "bad model!, ok-model" }), ["ok-model"]);
});

test("defaults: 2 interviews, 40 turns, 30-day-old accounts", () => {
  assert.deepEqual(freeLimits({}), { interviewsPerDay: 2, turnsPerDay: 40, minAccountAgeDays: 30 });
});

test("eligible user in Ethiopia", () => {
  const s = freeStatus(base);
  assert.equal(s.ok, true);
  assert.equal(s.interviewsLeft, 2);
});

test("blocked in the EU, EEA, Switzerland and the UK; unknown country allowed", () => {
  for (const c of ["DE", "fr", "NO", "CH", "GB", "IE"]) assert.equal(freeStatus({ ...base, country: c }).block, "region", c);
  for (const c of ["ET", "US", "KE", "IN", null]) assert.equal(freeStatus({ ...base, country: c }).ok, true, String(c));
});

test("new or unknown-age GitHub accounts are refused", () => {
  assert.equal(freeStatus({ ...base, githubCreatedAt: new Date("2026-11-10T00:00:00Z") }).block, "account_too_new");
  assert.equal(freeStatus({ ...base, githubCreatedAt: null }).block, "account_age_unknown");
});

test("terms must be accepted first", () => {
  assert.equal(freeStatus({ ...base, termsAcceptedAt: null }).block, "terms_not_accepted");
});

test("2 interviews a day; an interview already in progress may continue", () => {
  assert.equal(freeStatus({ ...base, interviewsToday: 2 }).block, "daily_interviews_used");
  assert.equal(freeStatus({ ...base, interviewsToday: 2, starting: false }).ok, true);
});

test("turn cap stops long free interviews", () => {
  assert.equal(freeStatus({ ...base, turnsToday: 40, starting: false }).block, "daily_turns_used");
});

test("not configured wins over everything", () => {
  assert.equal(freeStatus({ ...base, configured: false }).block, "not_configured");
});
