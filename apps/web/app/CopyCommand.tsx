"use client";

import { useState } from "react";

/** A shell command with a Copy button. */
export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the command is still selectable */
    }
  }
  return (
    <div className="cmd">
      <code>{command}</code>
      <button type="button" className="chip" onClick={copy} aria-label={`Copy command: ${command}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
