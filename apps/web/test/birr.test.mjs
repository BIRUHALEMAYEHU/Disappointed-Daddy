import { test } from "node:test";
import assert from "node:assert/strict";
import { birrConfig, evaluatePayment, normalizeReference, receiverMatches } from "../lib/birr.ts";

const cfg = birrConfig({
  BIRR_PRICE: "300",
  BIRR_DAYS: "30",
  BIRR_ACCOUNTS: JSON.stringify({
    telebirr: { account: "0912345678", name: "Dad Owner" },
    cbe: { account: "1000123457441", name: "Dad Owner" },
  }),
});
const now = new Date("2026-11-20T12:00:00Z");
const good = {
  status: "success", verified: true, amount: 300, currency: "ETB",
  senderName: "Payer", receiverAccount: "1****7441", timestamp: "2026-11-19T10:00:00Z",
  settlementAccountMatch: { matched: true },
};

test("config: only well-formed accounts for supported banks", () => {
  const c = birrConfig({ BIRR_ACCOUNTS: '{"telebirr":{"account":"09","name":"x"},"boa":{"account":"1","name":"y"},"cbe":{"account":""}}' });
  assert.deepEqual(Object.keys(c.accounts), ["telebirr"]);
  assert.deepEqual(birrConfig({ BIRR_ACCOUNTS: "not json" }).accounts, {});
});

test("valid payment grants 30 days", () => {
  const r = evaluatePayment(good, "cbe", cfg, now);
  assert.equal(r.ok, true);
  assert.equal(r.days, 30);
});

test("paying double grants 60 days; capped at 12 periods", () => {
  assert.equal(evaluatePayment({ ...good, amount: "650" }, "cbe", cfg, now).days, 60);
  assert.equal(evaluatePayment({ ...good, amount: 99999 }, "cbe", cfg, now).days, 360);
});

test("rejects: not verified, failed, missing", () => {
  assert.equal(evaluatePayment({ ...good, verified: false }, "cbe", cfg, now).ok, false);
  assert.equal(evaluatePayment({ ...good, status: "not_found" }, "cbe", cfg, now).ok, false);
  assert.equal(evaluatePayment(undefined, "cbe", cfg, now).ok, false);
});

test("rejects: too little, wrong currency, bank we don't accept", () => {
  assert.match(evaluatePayment({ ...good, amount: 299.99 }, "cbe", cfg, now).reason, /less than the price/);
  assert.equal(evaluatePayment({ ...good, currency: "USD" }, "cbe", cfg, now).ok, false);
  assert.equal(evaluatePayment(good, "dashen", cfg, now).ok, false);
});

test("rejects money sent to someone else's account", () => {
  const elsewhere = { ...good, receiverAccount: "1****9999", settlementAccountMatch: { matched: false } };
  assert.match(evaluatePayment(elsewhere, "cbe", cfg, now).reason, /didn't go to our/);
});

test("rejects old and future-dated payments", () => {
  assert.match(evaluatePayment({ ...good, timestamp: "2026-11-01T00:00:00Z" }, "cbe", cfg, now).reason, /older than/);
  assert.match(evaluatePayment({ ...good, timestamp: "2026-12-01T00:00:00Z" }, "cbe", cfg, now).reason, /future/);
});

test("receiver matching: masked accounts and phone formats", () => {
  assert.equal(receiverMatches("1****7441", "1000123457441", false), true);
  assert.equal(receiverMatches("1****441", "1000123457441", false), false); // too few visible digits
  assert.equal(receiverMatches("2****7441", "1000123457441", false), false); // wrong first digit
  assert.equal(receiverMatches("+251912345678", "0912345678", true), true);
  assert.equal(receiverMatches("2519****5678", "0912345678", true), true);
  assert.equal(receiverMatches("2519****0000", "0912345678", true), false);
  assert.equal(receiverMatches(undefined, "0912345678", true), false);
});

test("telebirr payment matched by phone even without settlementAccountMatch", () => {
  const tb = { ...good, receiverAccount: "2519****5678", settlementAccountMatch: undefined };
  assert.equal(evaluatePayment(tb, "telebirr", cfg, now).ok, true);
});

test("reference normalization", () => {
  assert.equal(normalizeReference(" ft25 1234 abc "), "FT251234ABC");
  assert.equal(normalizeReference("abc"), null);
  assert.equal(normalizeReference("DROP TABLE; --"), null);
});
