import { isOwner } from "@/lib/auth";
import { notify } from "@/lib/push";

/** "Send test notification" button on the settings page. */
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const via = await notify({ title: "HQ test notification", body: "If you can read this, reminders will reach you.", url: "/settings", tag: "test" }, { kind: "test" });
  return Response.json({ via });
}
