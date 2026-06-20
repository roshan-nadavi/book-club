import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type GroupSummary = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  admin_id: string | null;
};

export type GroupDetail = {
  id: string;
  name: string;
  invite_code: string;
  admin_id: string | null;
  admin_username: string | null;
};

export type GroupMember = {
  user_id: string;
  username: string | null;
};

export type GroupBook = {
  id: string;
  group_id: string;
  title: string;
  author: string | null;
  total_chapters: number | null;
  created_at: string;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  book_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender_username: string;
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
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
    .select("groups!inner(id, name, invite_code, created_at, admin_id)")
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
 * Also resolves the admin's username via a parallel profile lookup.
 *
 * Queries:
 *   1. Membership check + group fields (including admin_id) via inner join.
 *   2. Admin username lookup from profiles (only if admin_id is set).
 */
export async function getGroupForMember(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupForMemberResult> {
  // 1. Membership check + group core fields
  const { data, error } = await client
    .from("memberships")
    .select("groups!inner(id, name, invite_code, admin_id)")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, kind: "not_member" };
  }

  const rawGroup = data.groups as unknown as {
    id: string;
    name: string;
    invite_code: string;
    admin_id: string | null;
  };

  if (!rawGroup) {
    return { ok: false, kind: "group_missing" };
  }

  // 2. Fetch admin username if admin_id is present
  const adminProfileResult = rawGroup.admin_id
    ? await client
        .from("profiles")
        .select("username")
        .eq("id", rawGroup.admin_id)
        .single()
    : { data: null, error: null };

  const group: GroupDetail = {
    id: rawGroup.id,
    name: rawGroup.name,
    invite_code: rawGroup.invite_code,
    admin_id: rawGroup.admin_id,
    admin_username:
      (adminProfileResult.data as { username: string | null } | null)
        ?.username ?? null,
  };

  return { ok: true, group };
}

// ---------------------------------------------------------------------------
// Get all members of a group (fetched lazily on demand, not on page load)
// ---------------------------------------------------------------------------

export type GetGroupMembersResult =
  | { ok: true; members: GroupMember[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Return all members of a group with their usernames.
 * Verifies the requesting user is a member before returning data.
 *
 * Queries:
 *   1. Membership check.
 *   2. All user_ids in the group.
 *   3. Batch profile lookup for usernames.
 */
export async function getGroupMembers(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupMembersResult> {
  // 1. Confirm the requesting user is a member
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
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this group.",
    };
  }

  // 2. Fetch all member user_ids
  const { data: membershipRows, error: membersError } = await client
    .from("memberships")
    .select("user_id")
    .eq("group_id", groupId);

  if (membersError) {
    return { ok: false, kind: "error", message: membersError.message };
  }

  const memberUserIds = (membershipRows ?? []).map((m) => m.user_id);

  // 3. Batch-fetch usernames
  const { data: profileRows, error: profilesError } = memberUserIds.length
    ? await client
        .from("profiles")
        .select("id, username")
        .in("id", memberUserIds)
    : { data: [], error: null };

  if (profilesError) {
    return { ok: false, kind: "error", message: profilesError.message };
  }

  const members: GroupMember[] = (profileRows ?? []).map((p) => ({
    user_id: p.id,
    username: p.username ?? null,
  }));

  return { ok: true, members };
}

export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; message: string };

/**
 * Create a group and add the user as a member.
 *
 * Idempotency: `idempotencyKey` is a UUID the caller generates once per
 * form render. `groups.idempotency_key` has a UNIQUE constraint, so a
 * duplicate submission (e.g. a double-click before the page redirects)
 * fails the insert with a 23505 unique-violation. Instead of surfacing
 * that as an error, we fetch the group the first request already created
 * and return it — so no matter how many times the user clicked, they end
 * up with exactly one group.
 *
 * Two writes are inherently sequential (insert group → insert membership),
 * so two calls are unavoidable here.
 */
export async function createGroupWithMembership(
  client: SupabaseClient<Database>,
  userId: string,
  name: string,
  idempotencyKey?: string | null
): Promise<CreateGroupResult> {
  const trimmedName = name.trim();
  const invite_code = generateInviteCode();

  const { data: group, error: groupError } = await client
    .from("groups")
    .insert({
      name: trimmedName,
      admin_id: userId,
      invite_code,
      idempotency_key: idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    if (groupError?.code === "23505" && idempotencyKey) {
      // Same form submission landed twice — return the group the original
      // request created instead of erroring or duplicating it.
      const { data: existing, error: existingError } = await client
        .from("groups")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingError || !existing) {
        return {
          ok: false,
          message: existingError?.message ?? "Could not create group.",
        };
      }

      // The original request should have already created this membership;
      // insert defensively in case this request raced ahead of it. A
      // duplicate-membership conflict (23505) just means we're already in.
      const { error: memberError } = await client
        .from("memberships")
        .insert({ user_id: userId, group_id: existing.id });

      if (memberError && memberError.code !== "23505") {
        return { ok: false, message: memberError.message };
      }

      return { ok: true, groupId: existing.id };
    }

    return {
      ok: false,
      message: groupError?.message ?? "Could not create group.",
    };
  }

  const { error: memberError } = await client
    .from("memberships")
    .insert({ user_id: userId, group_id: group.id });

  if (memberError) {
    return {
      ok: false,
      message: memberError.message ?? "Could not join group.",
    };
  }

  return { ok: true, groupId: group.id };
}


// ---------------------------------------------------------------------------
// Fetch all data needed to render the group page
// ---------------------------------------------------------------------------

export type GroupPageData = {
  books: GroupBook[];
  messages: GroupMessage[];
  currentUserUsername: string;
};

export type GetGroupPageDataResult =
  | { ok: true; data: GroupPageData }
  | { ok: false; kind: "error"; message: string };

/**
 * Fetch books, group-level messages (book_id IS NULL), and resolve all
 * sender usernames for the group page in as few round-trips as possible.
 *
 * Queries:
 *   1. Books + messages + current user profile (parallel).
 *   2. Batch profile lookup for all message senders.
 */
export async function getGroupPageData(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupPageDataResult> {
  const [
    { data: bookRows, error: bookError },
    { data: rawMessages, error: msgError },
    { data: currentProfile, error: profileError },
  ] = await Promise.all([
    client
      .from("books")
      .select("id, group_id, title, author, total_chapters, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
    client
      .from("discussions")
      .select("id, group_id, book_id, sender_id, content, created_at")
      .eq("group_id", groupId)
      .is("book_id", null)
      .order("created_at", { ascending: true }),
    client.from("profiles").select("username").eq("id", userId).single(),
  ]);

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (msgError) {
    return { ok: false, kind: "error", message: msgError.message };
  }
  if (profileError) {
    return { ok: false, kind: "error", message: profileError.message };
  }

  const messagesRaw = rawMessages ?? [];

  // Batch-fetch usernames for all unique sender IDs
  const senderIds = [
    ...new Set(messagesRaw.map((m) => m.sender_id).filter(Boolean)),
  ] as string[];

  const { data: profileRows } = senderIds.length
    ? await client
        .from("profiles")
        .select("id, username")
        .in("id", senderIds)
    : { data: [] };

  const usernameMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.username ?? p.id])
  );

  const messages: GroupMessage[] = messagesRaw.map((m) => ({
    ...m,
    sender_username: m.sender_id
      ? (usernameMap[m.sender_id] ?? m.sender_id)
      : "Unknown",
  }));

  return {
    ok: true,
    data: {
      books: bookRows ?? [],
      messages,
      currentUserUsername: currentProfile?.username ?? "",
    },
  };
}