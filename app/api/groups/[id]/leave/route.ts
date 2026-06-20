import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leaveGroup } from "@/lib/services/memberships";

/**
 * POST /api/groups/[id]/leave
 * Removes the signed-in user from the group. Admins cannot leave their own
 * group.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await leaveGroup(supabase, user.id, groupId);

  if (!result.ok) {
    const status =
      result.kind === "not_member" ? 404
      : result.kind === "is_admin" ? 403
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}