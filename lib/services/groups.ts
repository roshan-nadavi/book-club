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

/**
 * Groups the current user belongs to, newest first.
 */
export async function listGroupsForUser(
  client: SupabaseClient<Database>,
  userId: string
): Promise<{ groups: GroupSummary[]; error: string | null }> {
  const { data: membershipRows, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId);

  if (membershipError) {
    return { groups: [], error: membershipError.message };
  }

  const groupIds = (membershipRows ?? []).map((m) => m.group_id);
  if (groupIds.length === 0) {
    return { groups: [], error: null };
  }

  const { data: groupRows, error: groupsError } = await client
    .from("groups")
    .select("id, name, invite_code, created_at")
    .in("id", groupIds);

  if (groupsError) {
    return { groups: [], error: groupsError.message };
  }

  const groups = [...(groupRows ?? [])] as GroupSummary[];
  groups.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { groups, error: null };
}

export type GetGroupForMemberResult =
  | { ok: true; group: GroupDetail }
  | { ok: false; kind: "not_member" | "group_missing" }
  | { ok: false; kind: "error"; message: string };

/**
 * Load a group only if the user is a member.
 */
export async function getGroupForMember(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupForMemberResult> {
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member" };
  }

  const { data: group, error: groupError } = await client
    .from("groups")
    .select("id, name, invite_code")
    .eq("id", groupId)
    .single();

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (!group) {
    return { ok: false, kind: "group_missing" };
  }

  return { ok: true, group };
}

export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; message: string };

/**
 * Create a group and add the user as a member.
 */
export async function createGroupWithMembership(
  client: SupabaseClient<Database>,
  userId: string,
  name: string
): Promise<CreateGroupResult> {
  const invite_code = generateInviteCode();

  const { data: group, error: groupError } = await client
    .from("groups")
    .insert({
      name,
      admin_id: userId,
      invite_code,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return {
      ok: false,
      message: groupError?.message ?? "Could not create group.",
    };
  }

  const { error: memberError } = await client.from("memberships").insert({
    user_id: userId,
    group_id: group.id,
  });

  if (memberError) {
    return {
      ok: false,
      message: memberError.message ?? "Could not join group.",
    };
  }

  return { ok: true, groupId: group.id };
}
