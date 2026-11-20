import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await currentUser().catch(() => null);

  return (
    <>
      <h1>🧔 Disappointed Dad</h1>
      <p className="quote">&ldquo;I&rsquo;m not angry. I&rsquo;m just disappointed you can&rsquo;t explain your own backend.&rdquo;</p>
      <p>
        An AI interviewer that sits you down and makes you defend <strong>your own</strong> code: why you chose JWT,
        what happens at 100× traffic, how you&rsquo;d debug it at 3 a.m. Practise before a real interviewer asks.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <strong>Install</strong>
        <pre>{`npm install -g disappointed-dad
cd your-project
dad config set-key   # your Anthropic API key (or: dad --local with Ollama)
dad`}</pre>
      </div>

      <div className="card">
        <strong>Your code stays yours</strong>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Dad never reads <code>.env</code> files or keys. In the terminal and VS Code, snippets go straight from your
          machine to Anthropic with your own key, or nowhere at all with <code>--local</code>. In the browser they pass
          through this server to Anthropic and are never stored or logged; only your grades are saved.
        </p>
      </div>

      {user ? (
        <div className="row">
          <a className="btn" href="/interview">Start an interview</a>
          <a className="chip" href="/pro">Dad Pro</a>
          <form action="/api/auth/logout" method="post">
            <span className="muted">Signed in as {user.login} · </span>
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      ) : (
        <div className="row">
          <a className="btn" href="/api/auth/github?next=%2Finterview">Try it in the browser</a>
          <span className="muted small">Sign in with GitHub, paste a public repo and your API key, get grilled.</span>
        </div>
      )}
    </>
  );
}
