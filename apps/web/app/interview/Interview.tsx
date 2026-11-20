"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Mode = "talk" | "again" | "sitdown" | "topic";
type Voice = "dad" | "daddy";
type Line = { who: "dad" | "you" | "tool" | "notice" | "error"; text: string };
type Topic = { status: "solid" | "partial" | "weak"; notes: string; lastAsked: string };
type Progress = { topics: Record<string, Topic>; mocks: { date: string; score: number; weakest: string }[] };

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "talk", label: "Talk", hint: "“Son, we need to talk about your backend.”" },
  { value: "again", label: "Again", hint: "Redo what you got wrong. “We've been over this.”" },
  { value: "sitdown", label: "Sit-down", hint: "Strict 5-question mock interview, scored /10." },
  { value: "topic", label: "One topic", hint: "Just one area, like auth or the database." },
];
const GRADE = { solid: "A", partial: "C", weak: "D-" } as const;

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: fine */
  }
}

/** Providers a user can bring a key for. Mirrors packages/core/src/providers.ts (the server enforces the real list). */
const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-opus-5-5", keyUrl: "https://console.anthropic.com/settings/keys", note: "recommended" },
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-3.8-flash", keyUrl: "https://aistudio.google.com/apikey", note: "has a free tier" },
  { id: "openai", label: "OpenAI (GPT)", defaultModel: "", keyUrl: "https://platform.openai.com/api-keys", note: "" },
  { id: "openrouter", label: "OpenRouter (many models)", defaultModel: "", keyUrl: "https://openrouter.ai/keys", note: "" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "", keyUrl: "https://platform.deepseek.com/api_keys", note: "" },
  { id: "groq", label: "Groq", defaultModel: "", keyUrl: "https://console.groq.com/keys", note: "" },
] as const;
type ProviderId = (typeof PROVIDERS)[number]["id"];

interface FreeInfo {
  ok: boolean;
  block: string | null;
  message: string;
  interviewsLeft: number;
  terms: string;
  accepted: boolean;
  limits: { interviewsPerDay: number };
}

/** API keys live only in this browser, one per provider: sessionStorage by default, localStorage if they ask. */
const keySlot = (p: ProviderId) => `dd_key_${p}`;
function loadKey(p: ProviderId): { key: string; remembered: boolean } {
  try {
    const remembered = localStorage.getItem(keySlot(p)) ?? (p === "anthropic" ? localStorage.getItem("dd_anthropic_key") : null);
    if (remembered) return { key: remembered, remembered: true };
    return { key: sessionStorage.getItem(keySlot(p)) ?? (p === "anthropic" ? sessionStorage.getItem("dd_anthropic_key") ?? "" : ""), remembered: false };
  } catch {
    return { key: "", remembered: false };
  }
}
function storeKey(p: ProviderId, key: string, remember: boolean) {
  try {
    localStorage.removeItem(keySlot(p));
    sessionStorage.removeItem(keySlot(p));
    if (p === "anthropic") {
      localStorage.removeItem("dd_anthropic_key"); // old single-provider slot
      sessionStorage.removeItem("dd_anthropic_key");
    }
    if (key) (remember ? localStorage : sessionStorage).setItem(keySlot(p), key);
  } catch {
    /* storage unavailable: the key is still kept in memory for this page */
  }
}

/** Renders Dad's text, highlighting verdict lines. */
function DadText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const m = line.match(/^\s*(SOLID|PARTIAL|WEAK)\b(.*)$/);
        if (m) return <div key={i} className={`verdict v-${m[1].toLowerCase()}`}><b>{m[1]}</b>{m[2]}</div>;
        return <div key={i}>{line || " "}</div>;
      })}
    </>
  );
}

export default function Interview({ login, isPro }: { login: string; isPro: boolean }) {
  const [repo, setRepo] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [model, setModel] = useState("");
  const preset = PROVIDERS.find((p) => p.id === provider)!;
  const [mode, setMode] = useState<Mode>("talk");
  const [topic, setTopic] = useState("");
  const [hard, setHard] = useState(false);
  const [voice, setVoice] = useState<Voice>("dad");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [creditMicro, setCreditMicro] = useState<number | null>(null);
  /** How Dad is paid for: the free tier, the user's own key, or Pro credit. */
  const [tier, setTier] = useState<"free" | "key" | "pro">(isPro ? "pro" : "free");
  const [freeInfo, setFreeInfo] = useState<FreeInfo | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [proMode, setProMode] = useState<"auto" | "max" | "economy">("auto");
  const history = useRef<unknown[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadFree() {
    const res = await fetch("/api/free").catch(() => null);
    if (res?.ok) setFreeInfo((await res.json()) as FreeInfo);
  }

  useEffect(() => {
    setRepo(readLocal("dd_repo") ?? "");
    const savedProvider = readLocal("dd_provider");
    const p = (PROVIDERS.some((x) => x.id === savedProvider) ? savedProvider : "anthropic") as ProviderId;
    setProvider(p);
    setModel(readLocal(`dd_model_${p}`) ?? "");
    const saved = loadKey(p);
    setApiKey(saved.key);
    setRememberKey(saved.remembered);
    const savedTier = readLocal("dd_tier");
    if (savedTier === "key" || (savedTier === "pro" && isPro) || (savedTier === "free" && !isPro)) setTier(savedTier);
    else if (!isPro && saved.key) setTier("key");
    loadFree();
  }, [isPro]);

  function chooseProvider(p: ProviderId) {
    setProvider(p);
    setModel(readLocal(`dd_model_${p}`) ?? "");
    const saved = loadKey(p);
    setApiKey(saved.key);
    setRememberKey(saved.remembered);
  }
  // Braces matter: an effect must return nothing or a cleanup function. Newer browsers make
  // scrollIntoView() return a Promise, which React would later try to call as cleanup and crash.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  const name = voice === "daddy" ? "Daddy" : "Dad";

  async function refreshProgress(r = repo) {
    const res = await fetch(`/api/progress?repo=${encodeURIComponent(r)}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as Partial<Progress> | null;
    // Accept only well-formed progress, so odd data can never crash the page.
    setProgress({
      topics: data && typeof data.topics === "object" && data.topics ? data.topics : {},
      mocks: Array.isArray(data?.mocks) ? data.mocks : [],
    });
  }

  function toggleDaddy() {
    if (voice === "daddy") return setVoice("dad");
    if (readLocal("dd_daddy") === "yes" || window.confirm("You sure? This one's not for the office.\n\nDaddy mode is an adults-only, innuendo-humor voice. Same questions, cheekier delivery.")) {
      writeLocal("dd_daddy", "yes");
      setVoice("daddy");
    }
  }

  /** Sends one turn and streams the reply into the chat. */
  async function turn(message: string | null) {
    setBusy(true);
    if (message !== null) setLines((l) => [...l, { who: "you", text: message }]);
    let dadIndex = -1;
    const append = (delta: string) =>
      setLines((l) => {
        if (dadIndex === -1 || l[dadIndex]?.who !== "dad") {
          dadIndex = l.length;
          return [...l, { who: "dad", text: delta }];
        }
        const copy = l.slice();
        copy[dadIndex] = { who: "dad", text: copy[dadIndex].text + delta };
        return copy;
      });
    const add = (line: Line) => setLines((l) => { dadIndex = -1; return [...l, line]; });

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo, mode, voice, topic: topic || undefined, hard, history: history.current, message,
          ...(tier === "free"
            ? { tier: "free" }
            : tier === "pro"
              ? { proMode }
            : tier === "key" && apiKey.trim()
              ? { apiKey: apiKey.trim(), provider, model: model.trim() || undefined }
              : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        add({ who: "error", text: err.error ?? `Error ${res.status}` });
        return false;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!raw.trim()) continue;
          const e = JSON.parse(raw) as { type: string; delta?: string; kind?: string; detail?: string; message?: string; history?: unknown[]; balanceMicroUsd?: number };
          if (e.type === "credit" && typeof e.balanceMicroUsd === "number") setCreditMicro(e.balanceMicroUsd);
          if (e.type === "text") append(e.delta ?? "");
          else if (e.type === "tool") add({ who: "tool", text: `${name} is looking at ${e.kind === "commit" ? "commit " : ""}${e.detail}` });
          else if (e.type === "notice") add({ who: "notice", text: e.message ?? "" });
          else if (e.type === "error") add({ who: "error", text: e.message ?? "Something went wrong." });
          else if (e.type === "done" && e.history) history.current = e.history;
        }
      }
      return true;
    } catch {
      add({ who: "error", text: "Connection lost. Try again." });
      return false;
    } finally {
      setBusy(false);
      refreshProgress();
    }
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    writeLocal("dd_repo", repo);
    writeLocal("dd_tier", tier);
    if (tier === "key") {
      writeLocal("dd_provider", provider);
      writeLocal(`dd_model_${provider}`, model.trim());
      storeKey(provider, apiKey.trim(), rememberKey);
    }
    if (tier === "free" && freeInfo && !freeInfo.accepted) {
      const res = await fetch("/api/free", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept: acceptTerms }),
      }).catch(() => null);
      if (!res?.ok) return;
      await loadFree();
    }
    history.current = [];
    setLines([]);
    setStarted(true);
    refreshProgress(repo);
    const ok = await turn(null);
    if (!ok && history.current.length === 0) setStarted(false);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    await turn(t);
  }

  if (!started) {
    return (
      <>
        <h1>🧔 Sit down, {login}.</h1>
        <p className="quote">&ldquo;Which project are we talking about?&rdquo;</p>
        <form onSubmit={start} className="card stack">
          <label>
            <span className="label">GitHub repo (public)</span>
            <input className="field" required placeholder="owner/name or https://github.com/owner/name" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </label>
          <div className="modes">
            {MODES.map((m) => (
              <button type="button" key={m.value} className={`chip ${mode === m.value ? "on" : ""}`} onClick={() => setMode(m.value)}>{m.label}</button>
            ))}
          </div>
          <p className="muted small">{MODES.find((m) => m.value === mode)?.hint}</p>
          {mode === "topic" && <input className="field" required placeholder="e.g. auth, database, caching" value={topic} onChange={(e) => setTopic(e.target.value)} />}
          <label className="check"><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard mode (more twists, no easy questions)</label>
          <span className="label">How should Dad think?</span>
          <div className="modes">
            {isPro && <button type="button" className={`chip ${tier === "pro" ? "on" : ""}`} onClick={() => setTier("pro")}>Dad Pro</button>}
            {!isPro && <button type="button" className={`chip ${tier === "free" ? "on" : ""}`} onClick={() => setTier("free")}>Free</button>}
            <button type="button" className={`chip ${tier === "key" ? "on" : ""}`} onClick={() => setTier("key")}>Your own API key</button>
          </div>

          {tier === "pro" && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="modes">
                {([
                  ["auto", "Auto"],
                  ["max", "Max"],
                  ["economy", "Economy"],
                ] as const).map(([v, label]) => (
                  <button type="button" key={v} className={`chip ${proMode === v ? "on" : ""}`} onClick={() => setProMode(v)}>{label}</button>
                ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {proMode === "auto" && "Best model for sit-downs and Hard mode, a cheaper strong model otherwise. Recommended."}
                {proMode === "max" && "Our strongest model every time. Uses your credit about twice as fast."}
                {proMode === "economy" && "Our cheapest model. Stretches your credit furthest; questions may be simpler."}
              </p>
            </div>
          )}

          {tier === "free" && (
            <div className="stack" style={{ gap: 8 }}>
              {!freeInfo ? (
                <p className="muted small" style={{ margin: 0 }}>Checking the free tier…</p>
              ) : freeInfo.block && freeInfo.block !== "terms_not_accepted" ? (
                <p className="error small" style={{ margin: 0 }}>{freeInfo.message}</p>
              ) : (
                <>
                  <p className="small" style={{ margin: 0 }}>
                    Free: <b>{freeInfo.interviewsLeft} of {freeInfo.limits.interviewsPerDay}</b> interviews left today, on Google&rsquo;s Gemini.
                    Want better questions? <a href="/pro">Dad Pro</a> uses Claude.
                  </p>
                  {!freeInfo.accepted && (
                    <label className="check small" style={{ alignItems: "flex-start" }}>
                      <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ marginTop: 4 }} />
                      <span>{freeInfo.terms}</span>
                    </label>
                  )}
                  {freeInfo.accepted && (
                    <p className="muted small" style={{ margin: 0 }}>
                      Reminder: on the free tier Google may use what you send, including code snippets, to improve its products.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {tier === "key" && <>
          <label>
            <span className="label">AI provider</span>
            <select className="field" value={provider} onChange={(e) => chooseProvider(e.target.value as ProviderId)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}{p.note ? ` (${p.note})` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Your {preset.label} API key</span>
            <input
              className="field"
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="Paste your key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          {provider !== "anthropic" && (
            <label>
              <span className="label">Model{preset.defaultModel ? "" : " (required)"}</span>
              <input
                className="field"
                autoComplete="off"
                spellCheck={false}
                required={!preset.defaultModel && Boolean(apiKey.trim())}
                placeholder={preset.defaultModel || "e.g. the model name from your provider's docs"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Get a key at <a href={preset.keyUrl} target="_blank" rel="noreferrer">{new URL(preset.keyUrl).hostname}</a>.
            It stays in this browser and is sent only with your interview messages. It&rsquo;s never stored on our servers.
            {provider === "gemini" && <> On Gemini&rsquo;s free tier, Google may use what you send (including code snippets) to improve its products, and people may review it.</>}
            {provider !== "anthropic" && <> Dad is tuned for Claude; other models may ask vaguer questions.</>}
          </p>
          <label className="check small">
            <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} /> Remember the key on this device
          </label>
          </>}
          <div className="row">
            <button
              className="btn"
              type="submit"
              disabled={busy || (tier === "free" && (!freeInfo || Boolean(freeInfo.block && freeInfo.block !== "terms_not_accepted")))}
            >
              Start
            </button>
            <button type="button" className="link small" onClick={toggleDaddy}>{voice === "daddy" ? "😏 Daddy mode on (turn off)" : "🤫"}</button>
          </div>
        </form>
        <p className="muted small">Dad reads your repo through GitHub. The conversation stays in this tab; only your grades are saved.</p>
      </>
    );
  }

  const topics = Object.entries(progress?.topics ?? {});
  return (
    <div className="interview">
      <div className="chat">
        <div className="chat-head">
          <strong>{repo}</strong>
          <span className="muted small"> · {MODES.find((m) => m.value === mode)?.label}{hard ? " · hard" : ""}{voice === "daddy" ? " · 😏" : ""}</span>
          {creditMicro !== null && (
            <a href="/pro" className="muted small" style={{ marginLeft: 8 }}>
              · credit ${(Math.floor(Math.max(creditMicro, 0) / 10_000) / 100).toFixed(2)}
            </a>
          )}
          <button className="link small right" onClick={() => setStarted(false)} disabled={busy}>New session</button>
        </div>
        <div className="lines">
          {lines.map((l, i) =>
            l.who === "dad" ? <div key={i} className="bubble dad"><span className="who">{name}</span><DadText text={l.text} /></div>
            : l.who === "you" ? <div key={i} className="bubble you">{l.text}</div>
            : <div key={i} className={`meta ${l.who}`}>{l.text}</div>,
          )}
          {busy && <div className="meta tool">{name} is thinking…</div>}
          <div ref={bottom} />
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea
            className="field"
            rows={2}
            placeholder="Explain yourself…"
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          />
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !input.trim()}>Send</button>
            <button type="button" className="chip" disabled={busy} onClick={() => send("/hint")}>{voice === "daddy" ? "Beg" : "Hint"}</button>
            <button type="button" className="chip" disabled={busy} onClick={() => send("/skip")}>Skip</button>
            <button type="button" className="chip" disabled={busy} onClick={() => send("/done")}>Done</button>
          </div>
        </form>
      </div>

      <aside className="card report">
        <strong>Report card</strong>
        {topics.length === 0 ? (
          <p className="muted small">&ldquo;You haven&rsquo;t even talked to me yet.&rdquo;</p>
        ) : (
          <ul>
            {topics.map(([t, v]) => (
              <li key={t}><span className={`grade g-${v?.status}`}>{GRADE[v?.status] ?? "?"}</span> <b>{t}</b><div className="muted small">{v?.notes}</div></li>
            ))}
          </ul>
        )}
        {progress?.mocks?.length ? (
          <p className="small">Last sit-down: <b>{progress.mocks[progress.mocks.length - 1].score}/10</b></p>
        ) : null}
      </aside>
    </div>
  );
}
