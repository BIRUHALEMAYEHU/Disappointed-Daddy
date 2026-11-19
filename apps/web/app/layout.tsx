import type { ReactNode } from "react";

export const metadata = {
  title: "Disappointed Dad",
  description: "I'm not angry. I'm just disappointed you can't explain your own backend.",
};

const css = `
  :root { --bg:#faf7f2; --fg:#231f1a; --muted:#6b6259; --card:#fff; --line:#e7e0d6; --accent:#b4532a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#171513; --fg:#efe9e1; --muted:#a39a90; --card:#211e1b; --line:#38322c; --accent:#e58a5c; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 56px 16px; }
  h1 { font-size: clamp(2rem, 6vw, 2.8rem); line-height:1.1; margin: 0 0 12px; }
  .quote { color: var(--muted); font-style: italic; font-size: 1.15rem; margin-bottom: 32px; }
  .card { background: var(--card); border:1px solid var(--line); border-radius: 12px; padding: 20px; margin: 20px 0; }
  pre { background: var(--bg); border:1px solid var(--line); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 14px; }
  .btn { display:inline-block; background: var(--accent); color:#fff; border:0; border-radius: 8px; padding: 10px 18px; font: inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  .link { background:none; border:0; color: var(--muted); text-decoration: underline; cursor:pointer; font: inherit; padding:0; }
  .code { font: 700 1.8rem ui-monospace, monospace; letter-spacing: .12em; }
  .muted { color: var(--muted); }
  .error { color: #c0392b; }
  .small { font-size: .9rem; }
  .stack { display:flex; flex-direction:column; gap:12px; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .label { display:block; font-weight:600; margin-bottom:6px; }
  .field { width:100%; font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px 12px; resize:vertical; }
  .field:focus { outline:2px solid var(--accent); outline-offset:-1px; }
  .check { display:flex; gap:8px; align-items:center; }
  .modes { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { font:inherit; font-size:.9rem; background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:999px; padding:6px 14px; cursor:pointer; }
  .chip.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled { opacity:.5; cursor:default; }
  main:has(.interview) { max-width: 1040px; }
  .interview { display:grid; grid-template-columns: minmax(0,1fr) 260px; gap:20px; align-items:start; }
  @media (max-width: 760px) { .interview { grid-template-columns: 1fr; } }
  .chat { display:flex; flex-direction:column; min-height: 70vh; }
  .chat-head { display:flex; align-items:baseline; gap:4px; padding-bottom:12px; border-bottom:1px solid var(--line); }
  .right { margin-left:auto; }
  .lines { flex:1; display:flex; flex-direction:column; gap:12px; padding:16px 0; }
  .bubble { border-radius:12px; padding:12px 14px; max-width: 92%; white-space: pre-wrap; overflow-wrap:anywhere; }
  .bubble.dad { background:var(--card); border:1px solid var(--line); align-self:flex-start; }
  .bubble.you { background:var(--accent); color:#fff; align-self:flex-end; }
  .who { display:block; font-weight:700; color:var(--accent); font-size:.85rem; margin-bottom:4px; }
  .meta { font-size:.85rem; color:var(--muted); font-style:italic; }
  .meta.error { color:#c0392b; font-style:normal; }
  .verdict { margin:6px 0; padding:4px 8px; border-radius:6px; }
  .v-solid { background: color-mix(in srgb, #2e9d5b 18%, transparent); }
  .v-partial { background: color-mix(in srgb, #d4a017 20%, transparent); }
  .v-weak { background: color-mix(in srgb, #c0392b 18%, transparent); }
  .composer { position:sticky; bottom:0; background:var(--bg); padding:12px 0; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--line); }
  .report { position:sticky; top:16px; margin:0; }
  .report ul { list-style:none; padding:0; margin:12px 0 0; display:flex; flex-direction:column; gap:10px; }
  .grade { display:inline-block; min-width:28px; text-align:center; font-weight:800; border-radius:6px; padding:0 4px; }
  .g-solid { color:#2e9d5b; } .g-partial { color:#b8860b; } .g-weak { color:#c0392b; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
