import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinGroupByInviteCode } from "@/lib/services/memberships";

/**
 * POST /api/groups/join
 * Body: { invite_code: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const inviteCode = (body?.invite_code as string | undefined)?.trim();

  if (!inviteCode) {
    return NextResponse.json({ error: "invite_code is required." }, { status: 400 });
  }

  const result = await joinGroupByInviteCode(supabase, user.id, inviteCode);

  if (!result.ok) {
    const status =
      result.kind === "already_member" ? 409
      : result.kind === "invalid_code"  ? 404
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ groupId: result.groupId }, { status: 201 });
}