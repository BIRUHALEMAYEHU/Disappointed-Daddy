import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Interview from "./Interview";

export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const user = await currentUser();
  if (!user) redirect(`/api/auth/github?next=${encodeURIComponent("/interview")}`);
  return <Interview login={user.login} />;
}
