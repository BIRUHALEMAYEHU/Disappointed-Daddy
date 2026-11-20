"use client";

import { useEffect } from "react";

/**
 * Shown instead of Next.js's blank "Application error" page when something crashes in the browser.
 * Displays the real error message so problems can be reported and fixed.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1>Dad tripped over something.</h1>
      <p className="quote">&ldquo;I&rsquo;m not angry. I&rsquo;m just&hellip; confused.&rdquo;</p>
      <div className="card">
        <strong>What went wrong</strong>
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
          {error.message || "Unknown error"}
          {error.digest ? `\n(reference: ${error.digest})` : ""}
        </pre>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          If this keeps happening, please send a screenshot of this box. A browser translation tool (like Google
          Translate) can also cause this: try turning it off for this site.
        </p>
      </div>
      <div className="row">
        <button className="btn" onClick={() => reset()}>Try again</button>
        <a className="chip" href="/">Home</a>
      </div>
    </>
  );
}
