import { parseGithubRepo } from "@disappointed-dad/core";
import { currentUser } from "@/lib/auth";
import { DbProgressStore } from "@/lib/interview";

export const runtime = "nodejs";

/** Report card for one repo (web interviews). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = parseGithubRepo(new URL(req.url).searchParams.get("repo") ?? "");
  if (!parsed) return Response.json({ error: "Invalid repo." }, { status: 400 });
  const progress = await new DbProgressStore(user.id, `${parsed.owner}/${parsed.repo}`.toLowerCase()).load();
  return Response.json(progress);
}
