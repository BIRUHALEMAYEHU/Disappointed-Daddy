import { currentUser } from "@/lib/auth";
import CopyCommand from "./CopyCommand";
import Terminal from "./Terminal";

export const dynamic = "force-dynamic";

const MARKETPLACE = "https://marketplace.visualstudio.com/items?itemName=dissappointeddaddy.disappointed-dad-vscode";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await currentUser().catch(() => null);
  const startHref = user ? "/interview" : "/api/auth/github?next=%2Finterview";

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">Can you explain your own code?</h1>
          <p className="lede">
            Disappointed Dad reads your repository and its git history, finds the design decisions that matter,
            and makes you defend them. Like a senior engineer in an interview, without the job on the line.
          </p>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <a className="btn" href={startHref}>Start an interview in the browser</a>
            </div>
            <CopyCommand command="npm install -g disappointed-dad" />
            <p className="muted small also" style={{ margin: 0 }}>
              Or in VS Code: search <b>Disappointed Dad</b> in Extensions, or <a href={MARKETPLACE}>open the Marketplace page</a>.
            </p>
          </div>
        </div>
        <Terminal />
      </section>

      <section className="section" aria-labelledby="ways">
        <h2 id="ways">Three ways in</h2>
        <p>Same interviewer everywhere. The terminal and VS Code share one report card per project.</p>
        <div className="table-wrap">
          <table className="spec">
            <thead>
              <tr><th scope="col"></th><th scope="col">Terminal</th><th scope="col">VS Code</th><th scope="col">Browser</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Install</th>
                <td><code>npm install -g disappointed-dad</code></td>
                <td>Extensions view, search &ldquo;Disappointed Dad&rdquo;</td>
                <td>Nothing to install</td>
              </tr>
              <tr>
                <th scope="row">Start</th>
                <td><code>cd your-project</code> then <code>dad</code></td>
                <td>Command Palette: <b>Disappointed Dad: Start Interview</b></td>
                <td>Sign in with GitHub, paste a public repo</td>
              </tr>
              <tr>
                <th scope="row">Reads</th>
                <td>Your local folder, including uncommitted work</td>
                <td>The open workspace; click a file Dad mentions to jump to it</td>
                <td>Public GitHub repositories</td>
              </tr>
              <tr>
                <th scope="row">AI</th>
                <td>Your own key, a local Ollama model, or Pro</td>
                <td>Your own key, a local Ollama model, or Pro</td>
                <td>Free tier, your own key, or Pro</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="grades">
        <h2 id="grades">How Dad grades you</h2>
        <p>
          Dad works through each decision the way an interviewer does: what the code does, why it&rsquo;s built that way,
          what it costs, and what breaks when one condition changes. Then you get a verdict and an answer you could give
          in a real interview.
        </p>
        <div className="table-wrap">
          <table className="spec">
            <thead>
              <tr><th scope="col">Verdict</th><th scope="col">Means</th><th scope="col">What happens next</th></tr>
            </thead>
            <tbody>
              <tr className="v-solid">
                <th scope="row"><span className="grade-name">SOLID</span></th>
                <td>You explained what the code does, gave a real reason for it, and named at least one trade-off.</td>
                <td>Dad moves to the next decision.</td>
              </tr>
              <tr className="v-partial">
                <th scope="row"><span className="grade-name">PARTIAL</span></th>
                <td>You know what the code does, but the reason or the trade-off is vague.</td>
                <td>Saved to your report card; <code>dad again</code> brings it back.</td>
              </tr>
              <tr className="v-weak">
                <th scope="row"><span className="grade-name">WEAK</span></th>
                <td>Wrong, guessing, or still unclear after hints.</td>
                <td>Dad teaches it, then re-drills it first next time.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Modes: Talk for a normal session, Again to redo weak topics, Sit-down for a strict five-question mock interview
          scored out of ten, and One topic to focus on a single area such as auth or the database.
        </p>
      </section>

      <section className="section" aria-labelledby="pricing">
        <h2 id="pricing">Pricing</h2>
        <p>No subscription. Use the free tier, bring a key you already have, or prepay for Pro and pay only for what you use.</p>
        <div className="table-wrap">
          <table className="spec">
            <thead>
              <tr><th scope="col"></th><th scope="col">Free</th><th scope="col">Your own key</th><th scope="col">Dad Pro</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Cost</th>
                <td>Free</td>
                <td>Whatever your AI provider charges</td>
                <td>Prepaid credit: 250 ETB buys $1, charged at real cost</td>
              </tr>
              <tr>
                <th scope="row">Model</th>
                <td>Google Gemini Flash</td>
                <td>Claude, GPT, Gemini, DeepSeek, Groq or any OpenRouter model</td>
                <td>Claude: Opus for sit-downs and Hard mode, Sonnet otherwise</td>
              </tr>
              <tr>
                <th scope="row">Limits</th>
                <td>2 interviews a day</td>
                <td>None from us</td>
                <td>Your credit balance</td>
              </tr>
              <tr>
                <th scope="row">Where</th>
                <td>Browser</td>
                <td>Terminal, VS Code, browser</td>
                <td>Terminal, VS Code, browser</td>
              </tr>
              <tr>
                <th scope="row">Your code</th>
                <td>Google may use it to improve its products</td>
                <td>Goes only to your provider</td>
                <td>Passes through our server to Anthropic; never stored</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">
          The free tier needs a GitHub account at least 30 days old and isn&rsquo;t available in the EU, EEA, Switzerland or
          the UK. <a href="/pro">Top up Pro</a> with telebirr or CBE.
        </p>
      </section>

      <section className="section" aria-labelledby="privacy">
        <h2 id="privacy">What happens to your code</h2>
        <ul className="facts">
          <li>Dad never reads <code>.env</code> files, private keys or credential files, and skips everything in <code>.gitignore</code>.</li>
          <li>Code snippets go only where your plan sends them, as listed above. Dad can&rsquo;t open files outside your project.</li>
          <li>We store your grades (topic names and one-line notes), not your code or your conversations.</li>
          <li>Open source under the MIT license. <a href="https://github.com/BIRUHALEMAYEHU/Disappointed-Daddy">Read every line on GitHub</a>.</li>
        </ul>
        <div className="row" style={{ marginTop: 24 }}>
          <a className="btn" href={startHref}>Start an interview</a>
          <a className="chip" href="https://github.com/BIRUHALEMAYEHU/Disappointed-Daddy">View the source</a>
        </div>
      </section>
    </>
  );
}
