import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Pro from "./Pro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dad Pro" };

export default async function ProPage() {
  const user = await currentUser();
  if (!user) redirect(`/api/auth/github?next=${encodeURIComponent("/pro")}`);
  return <Pro login={user.login} />;
}
