import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGroupMembers } from "@/lib/services/groups";

/**
 * GET /api/groups/[id]/members
 * Returns all members of a group with their usernames.
 * Called lazily by the client when the member list modal is opened.
 */
export async function GET(
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

  const result = await getGroupMembers(supabase, user.id, groupId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ members: result.members });
}