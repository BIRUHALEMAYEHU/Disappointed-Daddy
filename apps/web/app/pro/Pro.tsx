"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Account { bank: string; label: string; account: string; name: string }
interface Info {
  birrPerUsd: number;
  minTopup: number;
  accounts: Account[];
  available: boolean;
  pro: { source: "comped" | "manual" | "legacy" | "credit" | null; creditMicroUsd: number };
}

const usd = (micro: number) => `$${(Math.floor(Math.max(micro, 0) / 10_000) / 100).toFixed(2)}`;

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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; error?: string; addedMicroUsd?: number; balanceMicroUsd?: number };
      if (data.ok && typeof data.balanceMicroUsd === "number") {
        setMessage({ kind: "ok", text: `Payment confirmed: ${usd(data.addedMicroUsd ?? 0)} added. Balance: ${usd(data.balanceMicroUsd)}. "...I'm proud of you."` });
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

  const free = info.pro.source === "comped" || info.pro.source === "manual";
  const selected = info.accounts.find((a) => a.bank === bank);
  const examples = [info.minTopup, info.minTopup * 2, info.minTopup * 4];

  return (
    <>
      <h1>Dad Pro</h1>
      <p className="quote">&ldquo;No API key? Fine. I&rsquo;ll do the thinking. You pay for what you use.&rdquo;</p>

      <div className="card">
        <strong>Your balance</strong>
        <p className="mono" style={{ margin: "8px 0 0", fontSize: "2rem", fontWeight: 600, color: "var(--ink)" }}>{free ? "Unlimited" : usd(info.pro.creditMicroUsd)}</p>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          {free
            ? `${login}, you're on the house. Dad's treat.`
            : "Pro credit pays for Dad's AI time, at real cost, with no API key needed: in the browser and with `dad login` in the terminal. A typical interview uses roughly $0.30 to $1.50."}
        </p>
      </div>

      {!info.available ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Birr payments open soon.</p></div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <strong>Top up in Birr: {info.birrPerUsd} ETB = $1 of credit</strong>
          <p className="small" style={{ margin: 0 }}>
            {examples.map((b, i) => <span key={b}>{i > 0 && " · "}{b} ETB → <b>{usd(Math.floor((b / info.birrPerUsd) * 1_000_000))}</b></span>)}
            {" "}(minimum {info.minTopup} ETB)
          </p>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Send any amount from <b>{info.minTopup} ETB</b> to one of these:</li>
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
            <li>Paste it below. We check it with the bank and add the credit right away.</li>
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
            <p className={message.kind === "error" ? "error" : message.kind === "ok" ? "g-solid" : "muted"} style={{ margin: 0, fontWeight: message.kind === "ok" ? 650 : undefined }} role="status">
              {message.text}
            </p>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Payments are verified through verify.et. Each transaction can be used once. Credit doesn&rsquo;t expire. Pay only to the accounts above.
          </p>
        </form>
      )}
      <p className="small"><a href="/interview">← Back to interviews</a></p>
    </>
  );
}
