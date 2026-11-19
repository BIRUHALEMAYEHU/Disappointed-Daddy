import { randomBytes } from "node:crypto";

/**
 * The chat UI. Everything from the model is rendered with textContent (never innerHTML),
 * and the CSP only allows this page's own nonce'd script and styles.
 */
export function webviewHtml(cspSource: string, name: string): string {
  const nonce = randomBytes(16).toString("base64");
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
  body { margin:0; padding:0 12px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); display:flex; flex-direction:column; height:100vh; box-sizing:border-box; }
  #lines { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding:12px 0; }
  .bubble { padding:10px 12px; border-radius:8px; white-space:pre-wrap; overflow-wrap:anywhere; max-width:95%; line-height:1.5; }
  .dad { background: var(--vscode-editorWidget-background); border:1px solid var(--vscode-widget-border, transparent); align-self:flex-start; }
  .you { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self:flex-end; }
  .who { display:block; font-weight:700; font-size:.85em; margin-bottom:4px; color: var(--vscode-textLink-foreground); }
  .meta { font-size:.85em; opacity:.75; font-style:italic; }
  .meta a { color: var(--vscode-textLink-foreground); cursor:pointer; font-style:normal; }
  .error { color: var(--vscode-errorForeground); font-style:normal; opacity:1; }
  .verdict { margin:6px 0; padding:3px 8px; border-radius:4px; border-left:3px solid; }
  .v-solid { border-color: var(--vscode-testing-iconPassed, #3c9); }
  .v-partial { border-color: var(--vscode-editorWarning-foreground, #db3); }
  .v-weak { border-color: var(--vscode-errorForeground, #e55); }
  form { display:flex; flex-direction:column; gap:6px; padding:10px 0 12px; border-top:1px solid var(--vscode-widget-border, transparent); }
  textarea { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border:1px solid var(--vscode-input-border, transparent); border-radius:4px; padding:6px 8px; resize:vertical; }
  .row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  button { font:inherit; border:0; border-radius:4px; padding:4px 12px; cursor:pointer; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:disabled { opacity:.5; cursor:default; }
  #grades { font-size:.85em; opacity:.85; }
</style>
</head>
<body>
  <div id="lines"></div>
  <div id="grades"></div>
  <form id="composer">
    <textarea id="input" rows="2" placeholder="Explain yourself…  (Enter to send, Shift+Enter for a new line)"></textarea>
    <div class="row">
      <button class="primary" type="submit" id="send">Send</button>
      <button type="button" data-cmd="/hint">Hint</button>
      <button type="button" data-cmd="/skip">Skip</button>
      <button type="button" data-cmd="/done">Done</button>
    </div>
  </form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const NAME = ${JSON.stringify(name)};
  const lines = document.getElementById("lines");
  const input = document.getElementById("input");
  const grades = document.getElementById("grades");
  const buttons = () => document.querySelectorAll("button");
  let current = null, raw = "", thinking = null;

  function scroll() { lines.scrollTop = lines.scrollHeight; }
  function renderDad(el, text) {
    el.replaceChildren();
    const who = document.createElement("span"); who.className = "who"; who.textContent = NAME; el.appendChild(who);
    for (const line of text.split("\\n")) {
      const div = document.createElement("div");
      const m = line.match(/^\\s*(SOLID|PARTIAL|WEAK)\\b/);
      if (m) div.className = "verdict v-" + m[1].toLowerCase();
      div.textContent = line || "\\u00a0";
      el.appendChild(div);
    }
  }
  function addMeta(text, cls) {
    current = null;
    const div = document.createElement("div"); div.className = "meta " + (cls || ""); div.textContent = text;
    lines.appendChild(div); scroll(); return div;
  }
  function send(text) {
    text = text.trim(); if (!text || input.disabled) return;
    current = null;
    const b = document.createElement("div"); b.className = "bubble you"; b.textContent = text; lines.appendChild(b); scroll();
    vscode.postMessage({ type: "send", text });
  }

  document.getElementById("composer").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); input.value = ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); input.value = ""; } });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => send(b.dataset.cmd)));

  window.addEventListener("message", ({ data: m }) => {
    if (m.type === "text") {
      if (thinking) { thinking.remove(); thinking = null; }
      if (!current) { current = document.createElement("div"); current.className = "bubble dad"; raw = ""; lines.appendChild(current); }
      raw += m.delta; renderDad(current, raw); scroll();
    } else if (m.type === "tool") {
      const div = addMeta(NAME + " is looking at ");
      if (m.kind === "read") {
        const a = document.createElement("a"); a.textContent = m.detail; a.title = "Open in editor";
        a.addEventListener("click", () => vscode.postMessage({ type: "open", path: m.detail }));
        div.appendChild(a);
      } else div.append("commit " + m.detail);
    } else if (m.type === "notice") addMeta(m.message);
    else if (m.type === "error") addMeta(m.message, "error");
    else if (m.type === "busy") {
      input.disabled = m.value; buttons().forEach((b) => (b.disabled = m.value));
      if (m.value) thinking = addMeta(NAME + " is thinking…");
      else { if (thinking) thinking.remove(); thinking = null; input.focus(); }
    } else if (m.type === "progress") {
      const t = Object.entries(m.progress.topics || {});
      const g = { solid: "A", partial: "C", weak: "D-" };
      grades.textContent = t.length ? "Report card: " + t.map(([k, v]) => g[v.status] + " " + k).join(" · ") : "";
    }
  });
</script>
</body>
</html>`;
}
