import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/groups/join
 * Body: { invite_code: string }
 *
 * Call 1: Find the group by invite_code (also fetches existing memberships)
 * Call 2: Insert membership if the group exists and user is not already a member
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { invite_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const invite_code = body.invite_code?.trim().toUpperCase();
  if (!invite_code) {
    return NextResponse.json({ error: "invite_code is required." }, { status: 400 });
  }

  // ── Call 1: Find the group and all its current members in one query ────────
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, memberships(user_id)")
    .eq("invite_code", invite_code)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  if (!group) {
    return NextResponse.json(
      { error: "No group found with that invite code." },
      { status: 404 }
    );
  }

  // Check if the user is already a member using the joined memberships data
  const memberships = (group.memberships ?? []) as { user_id: string }[];
  const alreadyMember = memberships.some((m) => m.user_id === user.id);

  if (alreadyMember) {
    return NextResponse.json(
      { error: "You are already a member of this group." },
      { status: 409 }
    );
  }

  // ── Call 2: Insert the membership ─────────────────────────────────────────
  const { error: insertError } = await supabase
    .from("memberships")
    .insert({ user_id: user.id, group_id: group.id });

  if (insertError) {
    // Handle race condition: another request inserted this membership between our check and insert
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You are already a member of this group." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ groupId: group.id }, { status: 201 });
}