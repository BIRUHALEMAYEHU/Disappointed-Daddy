import { test } from "node:test";
import assert from "node:assert/strict";
import { costMicroUsd, fmtUsd, priceFor } from "../lib/pricing.ts";

test("Opus 5.5: $4 in / $20 out per million tokens", () => {
  assert.equal(costMicroUsd({ input_tokens: 1_000_000 }, "claude-opus-5-5"), 4_000_000);
  assert.equal(costMicroUsd({ output_tokens: 1_000_000 }, "claude-opus-5-5"), 20_000_000);
});

test("cache reads are cheap, cache writes cost 1.25x input", () => {
  assert.equal(costMicroUsd({ cache_read_input_tokens: 1_000_000 }, "claude-opus-5-5"), 200_000);
  assert.equal(costMicroUsd({ cache_creation_input_tokens: 1_000_000 }, "claude-opus-5-5"), 5_000_000);
});

test("a typical interview turn costs cents, rounded up", () => {
  // 20k cached snapshot read + 2k fresh input + 600 output tokens
  const c = costMicroUsd({ cache_read_input_tokens: 20_000, input_tokens: 2_000, output_tokens: 600 }, "claude-opus-5-5");
  assert.equal(c, 4_000 + 8_000 + 12_000);
  assert.equal(costMicroUsd({ output_tokens: 1 }, "claude-haiku-5-5"), 1);
});

test("fallback model: charge the more expensive one; unknown model: most expensive rate", () => {
  const u = { output_tokens: 1_000_000 };
  assert.equal(costMicroUsd(u, "claude-opus-5-5", "claude-fable-5-2"), 40_000_000);
  assert.equal(costMicroUsd(u, "some-new-model"), 40_000_000);
  assert.equal(priceFor("anthropic.claude-sonnet-5-5").output, 10);
});

test("missing or junk usage counts as zero", () => {
  assert.equal(costMicroUsd({}, "claude-opus-5-5"), 0);
  assert.equal(costMicroUsd({ input_tokens: -5, output_tokens: null }, "claude-opus-5-5"), 0);
});

test("formatting rounds down to cents", () => {
  assert.equal(fmtUsd(2_000_000), "$2.00");
  assert.equal(fmtUsd(1_999_999), "$1.99");
});
