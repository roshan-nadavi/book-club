import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type DiscussionMessage = {
  id: string;
  group_id: string;
  book_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Get all group-level messages (book_id IS NULL)
// ---------------------------------------------------------------------------

export type GetGroupMessagesResult =
  | { ok: true; messages: DiscussionMessage[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Return all group-level discussion messages (not tied to a book), oldest first.
 *
 * Single query: start from `memberships` (membership check), inner-join
 * `groups` → `discussions` filtering book_id IS NULL in the nested select.
 */
export async function getGroupMessages(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupMessagesResult> {
  const { data, error } = await client
    .from("memberships")
    .select(
      "groups!inner(discussions(id, group_id, book_id, sender_id, content, created_at))"
    )
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .is("groups.discussions.book_id", null)
    .maybeSingle();

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const group = data.groups as unknown as { discussions: DiscussionMessage[] };
  const messages = [...(group?.discussions ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { ok: true, messages };
}

// ---------------------------------------------------------------------------
// Get all messages for a specific book
// ---------------------------------------------------------------------------

export type GetBookMessagesResult =
  | { ok: true; messages: DiscussionMessage[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Return all discussion messages tied to a specific book, oldest first.
 *
 * Single query: start from `memberships` (membership check), inner-join
 * `groups` → `discussions` scoped to the given book_id.
 */
export async function getBookMessages(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  bookId: string
): Promise<GetBookMessagesResult> {
  const { data, error } = await client
    .from("memberships")
    .select(
      "groups!inner(discussions(id, group_id, book_id, sender_id, content, created_at))"
    )
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("groups.discussions.book_id", bookId)
    .maybeSingle();

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const group = data.groups as unknown as { discussions: DiscussionMessage[] };
  const messages = [...(group?.discussions ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { ok: true, messages };
}

// ---------------------------------------------------------------------------
// Post a message
// ---------------------------------------------------------------------------

export type PostMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; kind: "not_member" | "empty_content" | "error"; message: string };

/**
 * Post a discussion message.
 * Pass `bookId` to attach the message to a book; omit/null for a group-level message.
 *
 * Single read query: confirm membership via an inner-join on `groups`, then a
 * separate insert (write cannot be combined with a join read).
 */
export async function postMessage(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  content: string,
  bookId?: string | null
): Promise<PostMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, kind: "empty_content", message: "Message content cannot be empty." };
  }

  // Confirm membership in one read
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("groups!inner(id)")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const { data, error } = await client
    .from("discussions")
    .insert({
      group_id: groupId,
      book_id: bookId ?? null,
      sender_id: userId,
      content: trimmed,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, kind: "error", message: error?.message ?? "Could not post message." };
  }

  return { ok: true, messageId: data.id };
}