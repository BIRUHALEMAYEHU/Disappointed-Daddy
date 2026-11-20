"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Account { bank: string; label: string; account: string; name: string }
interface Info {
  price: number;
  days: number;
  accounts: Account[];
  available: boolean;
  pro: { source: "comped" | "manual" | "paid" | null; until: string | null };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function Pro({ login }: { login: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "wait"; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/pay/birr").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as Info;
      setInfo(data);
      setBank((b) => b || data.accounts[0]?.bank || "");
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pay/birr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bank, reference }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; error?: string; days?: number; proUntil?: string };
      if (data.ok && data.proUntil) {
        setMessage({ kind: "ok", text: `Payment confirmed: ${data.days} days added. Pro until ${fmtDate(data.proUntil)}. "...I'm proud of you."` });
        setReference("");
        load();
      } else {
        setMessage({ kind: data.pending ? "wait" : "error", text: data.error ?? "Something went wrong. Try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Connection lost. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <p className="muted">Loading…</p>;

  const proActive = info.pro.source !== null;
  const selected = info.accounts.find((a) => a.bank === bank);

  return (
    <>
      <h1>Dad Pro</h1>
      <p className="quote">&ldquo;No API key? Fine. I&rsquo;ll pay for the thinking. You pay for the coffee.&rdquo;</p>

      <div className="card">
        <strong>Your plan</strong>
        <p style={{ margin: "8px 0 0" }}>
          {info.pro.source === "comped" || info.pro.source === "manual"
            ? `${login}, you have Pro on the house. Dad's treat.`
            : proActive && info.pro.until
              ? `Pro until ${fmtDate(info.pro.until)}. Paying again adds more time.`
              : "No Pro yet. With Pro you can use Dad without your own API key, in the browser and with `dad login` in the terminal."}
        </p>
      </div>

      {!info.available ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Birr payments open soon.</p></div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <strong>Pay in Birr: {info.price} ETB for {info.days} days</strong>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Send <b>{info.price} ETB</b> (or a multiple, for more months) to one of these:</li>
          </ol>
          <div className="stack" style={{ gap: 8 }}>
            {info.accounts.map((a) => (
              <label key={a.bank} className={`chip ${bank === a.bank ? "on" : ""}`} style={{ borderRadius: 10, padding: "10px 14px", display: "block" }}>
                <input type="radio" name="bank" value={a.bank} checked={bank === a.bank} onChange={() => setBank(a.bank)} style={{ marginRight: 8 }} />
                <b>{a.label}</b>: {a.account} <span className="small">({a.name})</span>
              </label>
            ))}
          </div>
          <ol className="small" start={2} style={{ margin: 0, paddingLeft: 20 }}>
            <li>Copy the <b>transaction reference</b> from your confirmation SMS or receipt.</li>
            <li>Paste it below. We check it with the bank and activate Pro right away.</li>
          </ol>
          <label>
            <span className="label">Transaction reference{selected ? ` (${selected.label})` : ""}</span>
            <input
              className="field"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder={bank === "telebirr" ? "e.g. CK12AB3CDE" : "e.g. FT25123ABCDE"}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !reference.trim() || !bank}>{busy ? "Checking with the bank…" : "Verify payment"}</button>
          </div>
          {message && (
            <p className={message.kind === "error" ? "error" : message.kind === "ok" ? "" : "muted"} style={{ margin: 0 }} role="status">
              {message.kind === "ok" ? "✅ " : message.kind === "wait" ? "⏳ " : ""}{message.text}
            </p>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Payments are verified through verify.et. Each transaction can be used once. Pay only to the accounts above.
          </p>
        </form>
      )}
      <p className="small"><a href="/interview">← Back to interviews</a></p>
    </>
  );
}
