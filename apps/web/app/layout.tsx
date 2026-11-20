import type { Metadata } from "next";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";

const SITE = process.env.APP_URL ?? "https://disappointed-daddy.vercel.app";
const DESCRIPTION =
  "An AI interviewer that reads your repository and makes you defend the design decisions in it, before a real interviewer does. Terminal, VS Code and browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Disappointed Dad: defend your own code", template: "%s | Disappointed Dad" },
  description: DESCRIPTION,
  openGraph: { title: "Disappointed Dad", description: DESCRIPTION, url: SITE, siteName: "Disappointed Dad", type: "website" },
  twitter: { card: "summary", title: "Disappointed Dad", description: DESCRIPTION },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#E3E4E6" };

/*
 * Design system: "workstation manual". 1990s engineering workstations and printed technical manuals:
 * grey chassis, raised and sunken bevels, true-black type, comparisons as spec tables.
 * The one loud element is the amber phosphor terminal in the hero.
 */
const css = `
:root {
  --chassis: #E3E4E6; --raised: #EDEEF0; --sunken: #D6D8DB; --field: #FBFBFC;
  --hi: #FFFFFF; --lo: #9A9EA5; --line: #B9BDC3;
  --ink: #000000; --text: #2A2D32; --muted: #5D626A;
  --amber: #FFB000; --crt: #000000;
  --solid: #2F6B2F; --partial: #8A5E00; --weak: #A3302A; --focus: #1F57C3;
  --sans: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --chassis: #1E2023; --raised: #2A2D31; --sunken: #18191B; --field: #141517;
    --hi: #41454C; --lo: #0B0C0D; --line: #3A3E44;
    --ink: #F4F5F6; --text: #C9CCD1; --muted: #8D929A;
    --solid: #86C27F; --partial: #E0B04E; --weak: #EC8A80; --focus: #7AA7FF;
    color-scheme: dark;
  }
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--chassis); color: var(--text); font: 400 16px/1.55 var(--sans); }
a { color: var(--ink); text-underline-offset: 3px; text-decoration-thickness: 1px; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
code, kbd, pre, .mono { font-family: var(--mono); font-size: 0.9em; }

h1, h2, h3 { color: var(--ink); font-family: var(--sans); margin: 0; }
h1 { font-size: clamp(2.6rem, 6.2vw, 4.6rem); line-height: 0.95; font-weight: 800; font-stretch: 72%; letter-spacing: -0.01em; }
h2 { font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.1; font-weight: 750; font-stretch: 82%; }
h3 { font-size: 1.05rem; font-weight: 700; }
p { margin: 0 0 1em; max-width: 68ch; }

/* ---------- chrome ---------- */
.masthead { border-bottom: 1px solid var(--lo); background: var(--raised); box-shadow: inset 0 -1px 0 var(--hi); }
.masthead-in { max-width: 1120px; margin: 0 auto; padding: 0 16px; height: 56px; display: flex; align-items: center; gap: 24px; }
.wordmark { font-weight: 800; font-stretch: 72%; font-size: 1.35rem; color: var(--ink); text-decoration: none; letter-spacing: -0.01em; }
.wordmark small { font-weight: 500; font-stretch: 100%; font-size: 0.7rem; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
.nav { display: flex; gap: 20px; align-items: center; margin-left: auto; font-size: 0.95rem; }
.nav a { text-decoration: none; color: var(--text); }
.nav a:hover { color: var(--ink); text-decoration: underline; }
.nav form { margin: 0; }
@media (max-width: 640px) {
  .nav .hide-sm, .wordmark small { display: none; }
  .masthead-in { gap: 12px; }
  .nav { gap: 14px; font-size: 0.9rem; }
  .wordmark { font-size: 1.2rem; white-space: nowrap; }
}

main { max-width: 1120px; margin: 0 auto; padding: 48px 16px 72px; }
main.narrow { max-width: 760px; }
.footer { border-top: 1px solid var(--lo); box-shadow: inset 0 1px 0 var(--hi); background: var(--raised); }
.footer-in { max-width: 1120px; margin: 0 auto; padding: 24px 16px; display: flex; flex-wrap: wrap; gap: 8px 28px; font-size: 0.9rem; color: var(--muted); }
.footer-in a { color: var(--muted); }

/* ---------- surfaces: 90s bevels ---------- */
.panel, .card { background: var(--raised); border: 1px solid; border-color: var(--hi) var(--lo) var(--lo) var(--hi); box-shadow: 0 0 0 1px var(--line); border-radius: 2px; padding: 20px; margin: 20px 0; }
.sunken { background: var(--sunken); border: 1px solid; border-color: var(--lo) var(--hi) var(--hi) var(--lo); border-radius: 2px; }

/* ---------- controls ---------- */
.btn, .chip, .link { font: inherit; cursor: pointer; }
.btn { display: inline-flex; align-items: center; gap: 8px; background: var(--ink); color: var(--chassis); border: 1px solid var(--ink); border-radius: 2px; padding: 11px 20px; font-weight: 650; text-decoration: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 1px 0 var(--lo); }
.btn:hover { text-decoration: none; filter: brightness(1.25); }
.btn:active { transform: translateY(1px); box-shadow: none; }
.chip { display: inline-flex; align-items: center; gap: 6px; background: var(--raised); color: var(--ink); border: 1px solid; border-color: var(--hi) var(--lo) var(--lo) var(--hi); box-shadow: 0 0 0 1px var(--line); border-radius: 2px; padding: 7px 14px; font-size: 0.95rem; text-decoration: none; }
.chip:hover { background: var(--field); }
.chip.on { background: var(--sunken); border-color: var(--lo) var(--hi) var(--hi) var(--lo); font-weight: 700; }
.link { background: none; border: 0; color: var(--muted); text-decoration: underline; padding: 0; text-underline-offset: 3px; }
button:disabled, .btn[aria-disabled="true"] { opacity: .45; cursor: default; filter: none; transform: none; }

.field { width: 100%; font: inherit; color: var(--ink); background: var(--field); border: 1px solid; border-color: var(--lo) var(--hi) var(--hi) var(--lo); box-shadow: inset 1px 1px 0 rgba(0,0,0,.08); border-radius: 2px; padding: 10px 12px; resize: vertical; }
select.field { appearance: auto; }
.label { display: block; font-weight: 650; color: var(--ink); margin-bottom: 6px; }
.check { display: flex; gap: 10px; align-items: flex-start; }
.check input { margin-top: 4px; }

.stack { display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.modes { display: flex; gap: 8px; flex-wrap: wrap; }
.muted { color: var(--muted); }
.small { font-size: 0.9rem; }
.error { color: var(--weak); }
.quote { color: var(--muted); font-size: 1.1rem; margin: 10px 0 28px; }
.right { margin-left: auto; }

/* ---------- command line block ---------- */
.cmd { display: flex; align-items: stretch; max-width: 560px; width: 100%; }
.cmd code { flex: 1; min-width: 0; display: block; background: var(--field); color: var(--ink); padding: 11px 14px; border: 1px solid; border-color: var(--lo) var(--hi) var(--hi) var(--lo); border-right: 0; border-radius: 2px 0 0 2px; overflow-x: auto; white-space: nowrap; font-size: 0.95rem; }
.cmd code::before { content: "$ "; color: var(--muted); }
.cmd .chip { border-radius: 0 2px 2px 0; box-shadow: none; }

/* ---------- spec tables ---------- */
.table-wrap { overflow-x: auto; margin: 20px 0; border: 1px solid var(--lo); box-shadow: 0 0 0 1px var(--hi) inset; background: var(--raised); }
.spec { border-collapse: collapse; width: 100%; min-width: 640px; font-size: 0.95rem; }
.spec th, .spec td { text-align: left; vertical-align: top; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.spec thead th { background: var(--sunken); color: var(--ink); font-weight: 750; font-stretch: 85%; font-size: 1.05rem; border-bottom: 1px solid var(--lo); }
.spec tbody th { color: var(--ink); font-weight: 650; width: 18%; background: var(--sunken); }
.spec tr:last-child th, .spec tr:last-child td { border-bottom: 0; }
.spec td + td, .spec th + td, .spec th + th { border-left: 1px solid var(--line); }

/* ---------- landing ---------- */
.hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 48px; align-items: center; padding: 16px 0 56px; }
/* minmax(0, 1fr), not 1fr: a plain 1fr track won't shrink below its widest unbreakable content (the npm command). */
@media (max-width: 900px) { .hero { grid-template-columns: minmax(0, 1fr); gap: 32px; } }
.lede { font-size: 1.2rem; line-height: 1.5; color: var(--text); margin: 20px 0 28px; max-width: 46ch; }
.also { margin-top: 14px; }
.section { padding: 48px 0 8px; border-top: 1px solid var(--lo); box-shadow: inset 0 1px 0 var(--hi); }
.section > p { color: var(--text); }
.section h2 { margin-bottom: 12px; }
.grade-name { font-family: var(--mono); font-weight: 600; }
.g-solid, .v-solid .grade-name { color: var(--solid); }
.g-partial, .v-partial .grade-name { color: var(--partial); }
.g-weak, .v-weak .grade-name { color: var(--weak); }
.facts { margin: 0; padding-left: 20px; max-width: 70ch; }
.facts li { margin: 0 0 10px; }

/* ---------- the amber terminal (the one loud element) ---------- */
.crt-frame { background: var(--raised); border: 1px solid; border-color: var(--hi) var(--lo) var(--lo) var(--hi); box-shadow: 0 0 0 1px var(--line), 0 18px 40px -24px rgba(0,0,0,.45); padding: 14px; border-radius: 4px; }
.crt-bar { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--muted); padding: 0 2px 10px; }
.crt { position: relative; background: var(--crt); color: var(--amber); font: 400 14.5px/1.6 var(--mono); padding: 20px 22px; min-height: 380px; border-radius: 3px; border: 1px solid; border-color: var(--lo) var(--hi) var(--hi) var(--lo); text-shadow: 0 0 6px rgba(255,176,0,.45); overflow: hidden; overflow-wrap: anywhere; }
/* Each line: a speaker column, and text that wraps under itself (a hanging indent, like a real CLI). */
.crt-line { display: grid; grid-template-columns: 6ch minmax(0, 1fr); }
.crt-line.full { display: block; }
.crt-line.gap { margin-top: 1.1em; }
.crt-line p { margin: 0; max-width: none; }
.crt::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(255,255,255,.035) 0 1px, transparent 1px 3px); }
.crt .dim { opacity: .6; }
.crt .caret { display: inline-block; width: .6em; height: 1.1em; vertical-align: text-bottom; background: var(--amber); box-shadow: 0 0 6px rgba(255,176,0,.6); }
@media (max-width: 520px) { .crt { font-size: 12.5px; min-height: 320px; padding: 16px; } }

/* ---------- interview ---------- */
main:has(.interview) { max-width: 1180px; }
.interview { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; align-items: start; }
@media (max-width: 820px) { .interview { grid-template-columns: 1fr; } }
.chat { display: flex; flex-direction: column; min-height: 70vh; background: var(--raised); border: 1px solid; border-color: var(--hi) var(--lo) var(--lo) var(--hi); box-shadow: 0 0 0 1px var(--line); }
.chat-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; padding: 12px 16px; background: var(--sunken); border-bottom: 1px solid var(--lo); }
.lines { flex: 1; display: flex; flex-direction: column; padding: 8px 16px; }
.bubble { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; }
.who { font-weight: 750; color: var(--ink); font-size: 0.9rem; padding-top: 2px; }
.bubble.you { color: var(--ink); }
.bubble.you .who { color: var(--muted); }
.meta { font-size: 0.88rem; color: var(--muted); padding: 8px 0 8px 76px; border-bottom: 1px solid var(--line); }
.meta.error { color: var(--weak); }
.verdict { margin: 8px 0; padding: 6px 10px; border-left: 3px solid; background: var(--sunken); }
.v-solid { border-color: var(--solid); } .v-partial { border-color: var(--partial); } .v-weak { border-color: var(--weak); }
.composer { position: sticky; bottom: 0; background: var(--sunken); padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--lo); }
.report { position: sticky; top: 16px; margin: 0; }
.report ul { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 12px; }
.grade { display: inline-block; min-width: 28px; font-family: var(--mono); font-weight: 700; }
.code { font: 700 1.9rem var(--mono); letter-spacing: .12em; color: var(--ink); }

@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <header className="masthead">
          <div className="masthead-in">
            <a className="wordmark" href="/">Disappointed Dad<small>v0.1</small></a>
            <nav className="nav" aria-label="Main">
              <a href="/interview">Interview</a>
              <a href="/pro">Pro</a>
              <a className="hide-sm" href="https://github.com/BIRUHALEMAYEHU/Disappointed-Daddy">Source</a>
              {user ? (
                <form action="/api/auth/logout" method="post">
                  <button className="link" type="submit" title={`Signed in as ${user.login}`}>Sign out</button>
                </form>
              ) : (
                <a className="chip" href="/api/auth/github?next=%2Finterview">Sign in</a>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="footer-in">
            <span>Disappointed Dad 0.1, MIT licensed</span>
            <a href="https://github.com/BIRUHALEMAYEHU/Disappointed-Daddy">Source on GitHub</a>
            <a href="https://www.npmjs.com/package/disappointed-dad">npm package</a>
            <a href="https://marketplace.visualstudio.com/items?itemName=dissappointeddaddy.disappointed-dad-vscode">VS Code extension</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
