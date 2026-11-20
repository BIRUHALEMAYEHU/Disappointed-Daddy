"use client";

import { useEffect, useState } from "react";

interface Line {
  /** Speaker column ("Dad ›", "you ›"); omitted for full-width lines like the shell prompt. */
  who?: string;
  /** Paragraphs that wrap under the speaker column. */
  text: string[];
  dim?: boolean;
  /** Typed character by character, as if by the user. */
  type?: boolean;
  /** Blank line before this one. */
  gap?: boolean;
}

/** One realistic session, in the CLI's own words. */
const SCRIPT: Line[] = [
  { text: ["~/shop-api $ dad"], type: true },
  { text: ["Reading your project (secrets and ignored files are skipped)..."], dim: true },
  { text: ["142 files in shop-api. Commands: /hint /skip /done /quit"], dim: true },
  { who: "Dad ›", gap: true, text: ["routes/orders.js and routes/users.js both call verifyToken() themselves. Why not mount it once in app.js?"] },
  { who: "you ›", gap: true, text: ["so I don't have to repeat it?"], type: true },
  { who: "Dad ›", gap: true, text: ["That's part of it. A teammate adds routes/admin.js and forgets the call. What happens?"] },
  { who: "you ›", gap: true, text: ["anyone can hit the admin routes without a token"], type: true },
  {
    who: "Dad ›",
    gap: true,
    text: [
      "Right, once I pointed at it.",
      "PARTIAL: saw the risk, not the design rule behind it.",
      "Interview answer: \"Auth lives in one middleware, so a new route can't ship unprotected by accident.\"",
    ],
  },
];

/** How much of each line is visible: number of characters of its (joined) text. */
type Progress = number[];
const lengthOf = (l: Line) => l.text.join("\n").length;

function render(line: Line, chars: number) {
  // Reveal paragraphs up to `chars` characters (counting the joins as one character each).
  let left = chars;
  const paras: string[] = [];
  for (const p of line.text) {
    if (left <= 0) break;
    paras.push(p.slice(0, left));
    left -= p.length + 1;
  }
  return paras;
}

/**
 * The hero's amber terminal. Types the session out once (the page's only ambient motion);
 * with reduced motion it shows the finished transcript immediately.
 */
export default function Terminal() {
  const [progress, setProgress] = useState<Progress>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(SCRIPT.map(lengthOf));
      setDone(true);
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await sleep(500);
      for (const [i, line] of SCRIPT.entries()) {
        if (cancelled) return;
        const total = lengthOf(line);
        if (line.type) {
          for (let n = 1; n <= total; n++) {
            if (cancelled) return;
            setProgress((p) => [...p.slice(0, i), n]);
            await sleep(28);
          }
        } else {
          setProgress((p) => [...p.slice(0, i), total]);
        }
        await sleep(line.dim ? 250 : 900);
      }
      setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="crt-frame">
      <div className="crt-bar">
        <span>dad, terminal session</span>
        <span>{done ? "waiting for your answer" : "running"}</span>
      </div>
      <div
        className="crt"
        role="img"
        aria-label="Example terminal session: Dad asks why authentication is checked in each route file instead of one middleware, the user answers, and Dad grades the answer PARTIAL with an interview-ready explanation."
      >
        {progress.map((chars, i) => {
          const line = SCRIPT[i];
          const classes = ["crt-line", line.who ? "" : "full", line.gap ? "gap" : "", line.dim ? "dim" : ""].filter(Boolean).join(" ");
          return (
            <div key={i} className={classes}>
              {line.who && <span>{line.who}</span>}
              <div>{render(line, chars).map((p, j) => <p key={j}>{p}</p>)}</div>
            </div>
          );
        })}
        {done && (
          <div className="crt-line gap">
            <span>you ›</span>
            <div><span className="caret" /></div>
          </div>
        )}
      </div>
    </div>
  );
}
