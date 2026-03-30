import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type GroupSummary = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type GroupDetail = {
  id: string;
  name: string;
  invite_code: string;
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ---------------------------------------------------------------------------
// List groups for a user
// ---------------------------------------------------------------------------

/**
 * Groups the current user belongs to, newest first.
 *
 * Single query: start from `memberships`, inner-join `groups` so we get
 * the group fields without a second round-trip.
 */
export async function listGroupsForUser(
  client: SupabaseClient<Database>,
  userId: string
): Promise<{ groups: GroupSummary[]; error: string | null }> {
  const { data, error } = await client
    .from("memberships")
    .select("groups!inner(id, name, invite_code, created_at)")
    .eq("user_id", userId);

  if (error) {
    return { groups: [], error: error.message };
  }

  const groups = (data ?? [])
    .map((row) => row.groups as unknown as GroupSummary)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return { groups, error: null };
}

// ---------------------------------------------------------------------------
// Get a single group for a member
// ---------------------------------------------------------------------------

export type GetGroupForMemberResult =
  | { ok: true; group: GroupDetail }
  | { ok: false; kind: "not_member" | "group_missing" }
  | { ok: false; kind: "error"; message: string };

/**
 * Load a group only if the user is a member.
 *
 * Single query: start from `memberships` filtered by both `user_id` and
 * `group_id`, inner-join `groups` to pull the group fields in the same call.
 */
export async function getGroupForMember(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupForMemberResult> {
  const { data, error } = await client
    .from("memberships")
    .select("groups!inner(id, name, invite_code)")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, kind: "not_member" };
  }

  const group = data.groups as unknown as GroupDetail;
  if (!group) {
    return { ok: false, kind: "group_missing" };
  }

  return { ok: true, group };
}

// ---------------------------------------------------------------------------
// Create a group with the creator as a member
// ---------------------------------------------------------------------------

export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; message: string };

/**
 * Create a group and add the user as a member.
 * Two writes are inherently sequential (insert group → insert membership),
 * so two calls are unavoidable here.
 */
export async function createGroupWithMembership(
  client: SupabaseClient<Database>,
  userId: string,
  name: string
): Promise<CreateGroupResult> {
  const invite_code = generateInviteCode();

  const { data: group, error: groupError } = await client
    .from("groups")
    .insert({ name, admin_id: userId, invite_code })
    .select("id")
    .single();

  if (groupError || !group) {
    return {
      ok: false,
      message: groupError?.message ?? "Could not create group.",
    };
  }

  const { error: memberError } = await client
    .from("memberships")
    .insert({ user_id: userId, group_id: group.id });

  if (memberError) {
    return { ok: false, message: memberError.message ?? "Could not join group." };
  }

  return { ok: true, groupId: group.id };
}