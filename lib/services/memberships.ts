import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Join a group via invite code
// ---------------------------------------------------------------------------

export type JoinGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; kind: "invalid_code" | "already_member" | "error"; message: string };

/**
 * Look up a group by invite code and add the user as a member.
 * Returns `already_member` without error if the user is already in the group.
 */
export async function joinGroupByInviteCode(
  client: SupabaseClient<Database>,
  userId: string,
  inviteCode: string
): Promise<JoinGroupResult> {
  // 1. Resolve the group from the invite code
  const { data: group, error: groupError } = await client
    .from("groups")
    .select("id")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .maybeSingle();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group) {
    return { ok: false, kind: "invalid_code", message: "No group found with that invite code." };
  }

  // 2. Check for an existing membership
  const { data: existing, error: membershipCheckError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (membershipCheckError) {
    return { ok: false, kind: "error", message: membershipCheckError.message };
  }
  if (existing) {
    return { ok: false, kind: "already_member", message: "You are already a member of this group." };
  }

  // 3. Insert the membership
  const { error: insertError } = await client
    .from("memberships")
    .insert({ user_id: userId, group_id: group.id });

  if (insertError) {
    return { ok: false, kind: "error", message: insertError.message };
  }

  return { ok: true, groupId: group.id };
}

// ---------------------------------------------------------------------------
// Kick a member (admin only)
// ---------------------------------------------------------------------------

export type KickMemberResult =
  | { ok: true }
  | { ok: false; kind: "not_admin" | "not_member" | "cannot_kick_self" | "error"; message: string };

/**
 * Remove `targetUserId` from the group.
 * Only the group admin may do this, and admins cannot kick themselves.
 */
export async function kickMember(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  groupId: string,
  targetUserId: string
): Promise<KickMemberResult> {
  if (requestingUserId === targetUserId) {
    return { ok: false, kind: "cannot_kick_self", message: "You cannot kick yourself from the group." };
  }

  // 1. Verify the requesting user is the group admin
  const { data: group, error: groupError } = await client
    .from("groups")
    .select("admin_id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group || group.admin_id !== requestingUserId) {
    return { ok: false, kind: "not_admin", message: "Only the group admin can remove members." };
  }

  // 2. Verify the target is actually a member
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", targetUserId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "That user is not a member of this group." };
  }

  // 3. Delete the membership
  const { error: deleteError } = await client
    .from("memberships")
    .delete()
    .eq("user_id", targetUserId)
    .eq("group_id", groupId);

  if (deleteError) {
    return { ok: false, kind: "error", message: deleteError.message };
  }

  return { ok: true };
}