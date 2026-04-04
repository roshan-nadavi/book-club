import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kickMember } from "@/lib/services/memberships";

/**
 * POST /api/groups/[id]/kick
 * Body: { user_id: string }  ← the member to remove
 */
export async function POST(
  request: Request,
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

  const body = await request.json();
  const targetUserId = (body?.user_id as string | undefined)?.trim();

  if (!targetUserId) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  const result = await kickMember(supabase, user.id, groupId, targetUserId);

  if (!result.ok) {
    const status =
      result.kind === "cannot_kick_self" ? 400
      : result.kind === "not_admin"      ? 403
      : result.kind === "not_member"     ? 404
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}