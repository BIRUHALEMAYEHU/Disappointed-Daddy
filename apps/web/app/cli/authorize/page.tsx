import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export default async function Authorize({ searchParams }: { searchParams: Promise<{ code?: string; status?: string }> }) {
  const { code = "", status } = await searchParams;
  const userCode = code.toUpperCase();
  if (!CODE.test(userCode)) {
    return <p className="error">That link is broken. Run <code>dad login</code> again.</p>;
  }

  const user = await currentUser();
  if (!user) redirect(`/api/auth/github?next=${encodeURIComponent(`/cli/authorize?code=${userCode}`)}`);

  if (status === "approved") {
    return (
      <>
        <h1>Terminal connected</h1>
        <p>Go back to your terminal. &ldquo;Now, about your backend&hellip;&rdquo;</p>
      </>
    );
  }

  return (
    <>
      <h1>Connect your terminal?</h1>
      {status === "expired" && <p className="error">That code expired or was already used. Run <code>dad login</code> again.</p>}
      <p>Check that this code matches the one in your terminal:</p>
      <div className="card" style={{ textAlign: "center" }}>
        <div className="code">{userCode}</div>
      </div>
      <p className="muted">Signed in as {user.login}. Only approve if you just ran <code>dad login</code> yourself.</p>
      <form action="/api/cli/approve" method="post">
        <input type="hidden" name="user_code" value={userCode} />
        <button className="btn" type="submit">Yes, connect it</button>
      </form>
    </>
  );
}
