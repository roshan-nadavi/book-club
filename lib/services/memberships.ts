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
// Regenerate invite code (internal helper)
// ---------------------------------------------------------------------------

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * Generate a new unique 8-character invite code for a group.
 * Retries up to 5 times on the rare chance of a collision.
 *
 * Returns the new code on success, or an error string.
 */
async function regenerateInviteCode(
  client: SupabaseClient<Database>,
  groupId: string
): Promise<{ ok: true; newCode: string } | { ok: false; message: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const newCode = generateInviteCode();
    const { error } = await client
      .from("groups")
      .update({ invite_code: newCode })
      .eq("id", groupId);

    if (!error) {
      return { ok: true, newCode };
    }

    // 23505 = unique_violation — the generated code already exists, retry
    if (error.code !== "23505") {
      return { ok: false, message: error.message };
    }
  }

  return { ok: false, message: "Could not generate a unique invite code. Please try again." };
}

// ---------------------------------------------------------------------------
// Kick a member (admin only)
// ---------------------------------------------------------------------------

export type KickMemberResult =
  | { ok: true; newInviteCode: string }
  | { ok: false; kind: "not_admin" | "not_member" | "cannot_kick_self" | "invite_regen_failed" | "error"; message: string };

/**
 * Remove `targetUserId` from the group, then regenerate the invite code so
 * the kicked member cannot immediately rejoin with the old code.
 *
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

  // Delete the membership
  const { error: deleteError } = await client
    .from("memberships")
    .delete()
    .eq("user_id", targetUserId)
    .eq("group_id", groupId);

  if (deleteError) {
    return { ok: false, kind: "error", message: deleteError.message };
  }

  // Regenerate the invite code so the kicked member cannot rejoin with the old code
  const regenResult = await regenerateInviteCode(client, groupId);
  if (!regenResult.ok) {
    // Kick succeeded but code regen failed — surface this distinctly so the
    // caller can inform the user and they can manually refresh
    return { ok: false, kind: "invite_regen_failed", message: regenResult.message };
  }

  return { ok: true, newInviteCode: regenResult.newCode };
}

// ---------------------------------------------------------------------------
// Leave a group (self-removal)
// ---------------------------------------------------------------------------

export type LeaveGroupResult =
  | { ok: true }
  | { ok: false; kind: "not_member" | "is_admin" | "error"; message: string };

/**
 * Remove the requesting user from a group they belong to.
 * The group admin cannot leave their own group — there's no transfer-
 * ownership or delete-group flow yet, so we block it with a clear message.
 *
 * Single read query: start from `groups` filtered by id, left-join
 * `memberships` scoped to the requesting user so admin_id + membership
 * existence come back in one call. The delete is a separate write.
 */
export async function leaveGroup(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<LeaveGroupResult> {
  const { data: group, error: groupError } = await client
    .from("groups")
    .select("admin_id, memberships!left(user_id)")
    .eq("id", groupId)
    .eq("memberships.user_id", userId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group) {
    return { ok: false, kind: "not_member", message: "Group not found." };
  }

  const memberships = group.memberships as { user_id: string }[];
  if (memberships.length === 0) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this group.",
    };
  }

  if (group.admin_id === userId) {
    return {
      ok: false,
      kind: "is_admin",
      message:
        "You're the admin of this group, so you can't leave it. Delete the group or transfer admin rights instead.",
    };
  }

  const { error: deleteError } = await client
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .eq("group_id", groupId);

  if (deleteError) {
    return { ok: false, kind: "error", message: deleteError.message };
  }

  return { ok: true };
}