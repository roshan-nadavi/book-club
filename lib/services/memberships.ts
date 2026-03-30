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
 *
 * Single read query: start from `groups` filtered by invite_code, left-join
 * `memberships` filtered to this user so we can detect an existing membership
 * in the same call.  The write (insert) is inherently a separate call.
 */
export async function joinGroupByInviteCode(
  client: SupabaseClient<Database>,
  userId: string,
  inviteCode: string
): Promise<JoinGroupResult> {
  const { data: group, error: groupError } = await client
    .from("groups")
    .select("id, memberships!left(user_id)")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .eq("memberships.user_id", userId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group) {
    return { ok: false, kind: "invalid_code", message: "No group found with that invite code." };
  }

  // memberships is an array — if any row came back the user is already a member
  const memberships = group.memberships as { user_id: string }[];
  if (memberships.length > 0) {
    return { ok: false, kind: "already_member", message: "You are already a member of this group." };
  }

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
 *
 * Single read query: start from `groups` filtered by id, left-join
 * `memberships` scoped to the target user.  One call returns both `admin_id`
 * and whether the target membership row exists.
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

  const { data: group, error: groupError } = await client
    .from("groups")
    .select("admin_id, memberships!left(user_id)")
    .eq("id", groupId)
    .eq("memberships.user_id", targetUserId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group || group.admin_id !== requestingUserId) {
    return { ok: false, kind: "not_admin", message: "Only the group admin can remove members." };
  }

  const memberships = group.memberships as { user_id: string }[];
  if (memberships.length === 0) {
    return { ok: false, kind: "not_member", message: "That user is not a member of this group." };
  }

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