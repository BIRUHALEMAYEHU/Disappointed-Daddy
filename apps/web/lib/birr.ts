/**
 * Ethiopian payments: users pay to our telebirr/bank account, submit the transaction reference,
 * and we confirm it with verify.et (https://verify.et/docs/get-started) before granting Pro.
 */
import { createHash } from "node:crypto";

/** Banks we accept. Each needs only a reference (BOA and CBE Birr also need sender details, so they're left out). */
export const BANKS = {
  telebirr: "telebirr",
  cbe: "Commercial Bank of Ethiopia (CBE)",
  dashen: "Dashen Bank",
  awash: "Awash Bank",
  mpesa: "M-Pesa",
} as const;
export type Bank = keyof typeof BANKS;

export interface ReceivingAccount {
  /** Phone number (telebirr, M-Pesa) or bank account number. */
  account: string;
  /** Name on the account, shown to the payer so they can double-check. */
  name: string;
}

export interface BirrConfig {
  price: number;
  days: number;
  /** Reject payments older than this many days. */
  maxAgeDays: number;
  accounts: Partial<Record<Bank, ReceivingAccount>>;
}

/**
 * Reads BIRR_PRICE, BIRR_DAYS and BIRR_ACCOUNTS from the environment.
 * BIRR_ACCOUNTS is JSON, e.g. {"telebirr":{"account":"0912345678","name":"Biruh A."}}
 */
export function birrConfig(env: Record<string, string | undefined> = process.env): BirrConfig {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(env.BIRR_ACCOUNTS ?? "{}");
  } catch {
    parsed = {};
  }
  const accounts: BirrConfig["accounts"] = {};
  for (const bank of Object.keys(BANKS) as Bank[]) {
    const a = parsed[bank] as Partial<ReceivingAccount> | undefined;
    if (a && typeof a.account === "string" && a.account.trim() && typeof a.name === "string") {
      accounts[bank] = { account: a.account.trim(), name: a.name.trim() };
    }
  }
  return {
    price: Number(env.BIRR_PRICE ?? 300),
    days: Number(env.BIRR_DAYS ?? 30),
    maxAgeDays: Number(env.BIRR_MAX_AGE_DAYS ?? 7),
    accounts,
  };
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Ethiopian phone numbers in any form (+251 9…, 2519…, 09…, 9…) → "9xxxxxxxx". */
function normalizePhone(s: string): string {
  const d = digits(s);
  if (d.startsWith("251")) return d.slice(3);
  if (d.startsWith("0")) return d.slice(1);
  return d;
}

/**
 * Does a (possibly masked) receiver account from the receipt match ours?
 * verify.et masks accounts like "1****7441": the visible leading and trailing digits must all match,
 * and at least 4 trailing digits must be visible, or we don't accept it.
 */
export function receiverMatches(receipt: string | undefined | null, ours: string, isPhone: boolean): boolean {
  if (!receipt) return false;
  const norm = (s: string) => (isPhone ? normalizePhone(s) : digits(s));
  const target = norm(ours);
  const masked = receipt.replace(/\s/g, "");
  if (!/[*xX•]/.test(masked)) return norm(masked) === target && target.length > 0;
  const [head, ...rest] = masked.split(/[*xX•]+/);
  const tail = rest.pop() ?? "";
  const h = isPhone ? normalizePhone(head) : digits(head);
  const t = digits(tail);
  if (t.length < 4) return false;
  return target.startsWith(h) && target.endsWith(t);
}

/** One completed result item from verify.et (fields as documented; all optional to be safe). */
export interface VerifyItem {
  status?: string;
  verified?: boolean;
  amount?: number | string;
  currency?: string;
  senderName?: string;
  receiverName?: string;
  receiverAccount?: string;
  referenceNumber?: string;
  receiptNumber?: string;
  timestamp?: string;
  settlementAccountMatch?: { matched?: boolean; ambiguous?: boolean };
}

export type Evaluation =
  | { ok: true; amount: number; periods: number; days: number; payerName: string | null; receiverAccount: string | null; paidAt: Date | null }
  | { ok: false; reason: string };

/**
 * All the checks a payment must pass before we grant Pro. Pure, so it's fully testable.
 * (Reuse of the same reference is checked separately by the database's unique constraint.)
 */
export function evaluatePayment(item: VerifyItem | undefined, bank: Bank, cfg: BirrConfig, now = new Date()): Evaluation {
  const ours = cfg.accounts[bank];
  if (!ours) return { ok: false, reason: "We don't accept payments through that bank." };
  if (!item || item.verified !== true || item.status !== "success") {
    return { ok: false, reason: "That transaction couldn't be verified. Check the reference and the bank, then try again." };
  }
  if ((item.currency ?? "ETB").toUpperCase() !== "ETB") return { ok: false, reason: "The payment isn't in Birr." };

  const isPhone = bank === "telebirr" || bank === "mpesa";
  const toUs = item.settlementAccountMatch?.matched === true || receiverMatches(item.receiverAccount, ours.account, isPhone);
  if (!toUs) return { ok: false, reason: `That payment didn't go to our ${BANKS[bank]} account (${ours.account}).` };

  const amount = Number(item.amount);
  if (!Number.isFinite(amount) || amount < cfg.price) {
    return { ok: false, reason: `The amount (${Number.isFinite(amount) ? amount : "?"} ETB) is less than the price (${cfg.price} ETB).` };
  }

  const paidAt = item.timestamp ? new Date(item.timestamp) : null;
  if (paidAt && !Number.isNaN(paidAt.getTime())) {
    const ageDays = (now.getTime() - paidAt.getTime()) / 86_400_000;
    if (ageDays > cfg.maxAgeDays) return { ok: false, reason: `That payment is older than ${cfg.maxAgeDays} days. Please make a new payment.` };
    if (ageDays < -1) return { ok: false, reason: "That payment's date is in the future." };
  }

  // Paying for several periods at once is allowed (e.g. 600 ETB = 60 days), up to a year.
  const periods = Math.min(Math.floor(amount / cfg.price), 12);
  return {
    ok: true,
    amount,
    periods,
    days: periods * cfg.days,
    payerName: item.senderName ?? null,
    receiverAccount: item.receiverAccount ?? null,
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  };
}

/** References as people paste them: trimmed, no inner spaces, upper-cased. */
export function normalizeReference(input: string): string | null {
  const ref = input.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9_-]{6,40}$/.test(ref) ? ref : null;
}

export type VerifyOutcome =
  | { kind: "completed"; item: VerifyItem | undefined }
  | { kind: "pending" }
  | { kind: "error"; status: number; message: string };

/**
 * Calls verify.et. It may answer immediately (200) or say it's still working (202);
 * for 202 we ask the user to try again shortly; the idempotency key makes the retry return the same check.
 */
export async function verifyWithVerifyEt(bank: Bank, reference: string, cfg: BirrConfig, apiKey: string): Promise<VerifyOutcome> {
  const ours = cfg.accounts[bank]!;
  const body: Record<string, string> = { bank, reference, settlementAccount: ours.account };
  if (bank === "cbe") body.accountNumber = digits(ours.account); // older CBE "FT" references need the receiver account
  const waitMs = bank === "telebirr" ? 8000 : 5000;

  const res = await fetch(`https://verify.et/api/verify?waitMs=${waitMs}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "idempotency-key": createHash("sha256").update(`dad:${bank}:${reference}`).digest("hex"),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 202) return { kind: "pending" };
  const json = (await res.json().catch(() => ({}))) as { data?: VerifyItem[] | VerifyItem; message?: string };
  if (res.ok) {
    const item = Array.isArray(json.data) ? json.data[0] : json.data;
    return { kind: "completed", item };
  }
  return { kind: "error", status: res.status, message: json.message ?? "" };
}
