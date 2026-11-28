// Invite link: /invite/<invitationId>. Signed-out people make an account (or sign in) and come straight back here.
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/Mark";
import { auth } from "@/server/auth";
import { getSession } from "@/server/guard";
import { one } from "@/server/db";
import "../../entry.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a workspace · IZWI AI" };

export default async function Invite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?mode=create&next=${encodeURIComponent(`/invite/${id}`)}`);

  let problem = "";
  try {
    const h = await headers();
    const res = (await auth.api.acceptInvitation({ body: { invitationId: id }, headers: h })) as { invitation?: { organizationId?: string } } | null;
    const orgId = res?.invitation?.organizationId;
    if (orgId) await auth.api.setActiveOrganization({ body: { organizationId: orgId }, headers: h });
  } catch (e) {
    problem = (e as { message?: string }).message ?? "";
  }
  if (!problem) redirect("/app");
  // Already used by this very person (a second tab, a reload): they are in, so take them there.
  const joined = await one(
    `SELECT 1 FROM invitation i JOIN member m ON m."organizationId" = i."organizationId" AND m."userId" = ? WHERE i.id = ? AND i.status = 'accepted' AND lower(i.email) = lower(?)`,
    session.user.id, id, session.user.email,
  );
  if (joined) redirect("/app");

  return (
    <main className="invite">
      <Mark />
      <div className="invite-box" role="alert">
        <WarningCircle weight="fill" />
        <h1>This invite <em>did not work.</em></h1>
        <p className="lede">This invite is for another email, has expired or was already used.</p>
        <p className="fine">You are signed in as {session.user.email}. If the invite was sent to a different address, sign out and open the link again with that address.{problem ? ` Details: ${problem}` : ""}</p>
        <div className="invite-actions">
          <Link href="/app" className="btn btn-lg">Go to my workspace <ArrowRight weight="bold" /></Link>
        </div>
      </div>
    </main>
  );
}
