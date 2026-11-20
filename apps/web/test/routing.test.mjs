import { test } from "node:test";
import assert from "node:assert/strict";
import { interviewFromKickoff, isProMode, proModelFor } from "../lib/routing.ts";
import { buildKickoff } from "@disappointed-dad/core";

test("auto: Opus for sit-down and hard, Sonnet otherwise", () => {
  assert.equal(proModelFor("auto", { mode: "talk" }, {}), "claude-sonnet-5-5");
  assert.equal(proModelFor("auto", { mode: "again" }, {}), "claude-sonnet-5-5");
  assert.equal(proModelFor("auto", { mode: "sitdown" }, {}), "claude-opus-5-5");
  assert.equal(proModelFor("auto", { mode: "talk", hard: true }, {}), "claude-opus-5-5");
});

test("max and economy", () => {
  assert.equal(proModelFor("max", { mode: "talk" }, {}), "claude-opus-5-5");
  assert.equal(proModelFor("economy", { mode: "sitdown", hard: true }, {}), "claude-haiku-5-5");
});

test("models are configurable; HOSTED_MODEL still sets the max model", () => {
  assert.equal(proModelFor("max", { mode: "talk" }, { HOSTED_MODEL: "claude-fable-5-2" }), "claude-fable-5-2");
  assert.equal(proModelFor("auto", { mode: "talk" }, { PRO_MODEL_STANDARD: "claude-sonnet-5" }), "claude-sonnet-5");
});

test("interview type is recovered from the engine's real kickoff text", () => {
  const base = { progressSummary: "none", reviewTopics: [] };
  assert.deepEqual(interviewFromKickoff(buildKickoff({ ...base, mode: "sitdown" })), { mode: "sitdown", hard: false });
  assert.deepEqual(interviewFromKickoff(buildKickoff({ ...base, mode: "talk", hard: true })), { mode: "talk", hard: true });
  assert.deepEqual(interviewFromKickoff(buildKickoff({ ...base, mode: "talk" })), { mode: "talk", hard: false });
  assert.deepEqual(interviewFromKickoff(undefined), { mode: "talk", hard: false });
});

test("mode validation", () => {
  assert.equal(isProMode("auto"), true);
  assert.equal(isProMode("ultra"), false);
});
