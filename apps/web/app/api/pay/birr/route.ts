import { currentUser, isSameOrigin } from "@/lib/auth";
import {
  BANKS, birrConfig, evaluatePayment, normalizeReference, verifyWithVerifyEt, type Bank,
} from "@/lib/birr";
import { birrReferenceUsed, grantBirrPayment, recentPaymentAttempts, recordPaymentAttempt } from "@/lib/db";
import { proSource } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 20;

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Pricing, where to pay, and the signed-in user's Pro status. */
export async function GET() {
  const user = await currentUser();
  if (!user) return fail("Sign in first.", 401);
  const cfg = birrConfig();
  const accounts = (Object.keys(cfg.accounts) as Bank[]).map((bank) => ({ bank, label: BANKS[bank], ...cfg.accounts[bank]! }));
  return Response.json({
    price: cfg.price,
    days: cfg.days,
    accounts,
    available: accounts.length > 0 && Boolean(process.env.VERIFY_ET_API_KEY),
    pro: { source: proSource(user), until: user.proUntil?.toISOString() ?? null },
  });
}

/** Verify a Birr payment by its transaction reference and grant Pro. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Forbidden", 403);
  const user = await currentUser();
  if (!user) return fail("Sign in first.", 401);

  const apiKey = process.env.VERIFY_ET_API_KEY;
  const cfg = birrConfig();
  if (!apiKey || Object.keys(cfg.accounts).length === 0) return fail("Birr payments aren't set up yet.", 503);

  const body = (await req.json().catch(() => ({}))) as { bank?: unknown; reference?: unknown };
  const bank = body.bank as Bank;
  if (typeof body.bank !== "string" || !(body.bank in BANKS) || !cfg.accounts[bank]) return fail("Choose the bank or wallet you paid with.");
  const reference = typeof body.reference === "string" ? normalizeReference(body.reference) : null;
  if (!reference) return fail("Enter the transaction reference from your SMS or receipt (letters and numbers).");

  // Cheap checks first, so wrong or repeated submissions don't spend verify.et credits.
  if (await birrReferenceUsed(bank, reference)) return fail("That transaction has already been used to activate Pro.", 409);
  const attempts = await recentPaymentAttempts(user.id);
  if (attempts.hour >= MAX_PER_HOUR || attempts.day >= MAX_PER_DAY) {
    return fail("Too many attempts. Please wait an hour and try again, or contact us if your payment isn't recognised.", 429);
  }
  await recordPaymentAttempt(user.id);

  let outcome;
  try {
    outcome = await verifyWithVerifyEt(bank, reference, cfg, apiKey);
  } catch {
    return fail("Couldn't reach the payment checker. Please try again in a minute.", 502);
  }

  if (outcome.kind === "pending") {
    return Response.json({ ok: false, pending: true, error: "Your bank is still confirming the payment. Try again in about 30 seconds." }, { status: 202 });
  }
  if (outcome.kind === "error") {
    if (outcome.status === 422) return fail("That reference doesn't look right for this bank. Check it and try again.");
    if (outcome.status === 429) return fail("The payment checker is busy. Try again in a minute.", 503);
    // 401/403 (our key) and 402 (out of verify.et credits) are our problem, not the user's.
    console.error(`verify.et error ${outcome.status}`); // no reference or user data in logs
    return fail("Payment checking is temporarily unavailable. Your payment is safe; please try again later.", 503);
  }

  const result = evaluatePayment(outcome.item, bank, cfg);
  if (!result.ok) return fail(result.reason, 422);

  const proUntil = await grantBirrPayment({
    userId: user.id,
    bank,
    reference,
    amount: result.amount,
    days: result.days,
    payerName: result.payerName,
    receiverAccount: result.receiverAccount,
    paidAt: result.paidAt,
  });
  if (!proUntil) return fail("That transaction has already been used to activate Pro.", 409);

  return Response.json({ ok: true, days: result.days, proUntil: proUntil.toISOString() });
}
