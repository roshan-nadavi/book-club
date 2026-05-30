import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscussionMessage = {
  id: string;
  group_id: string;
  book_id: string | null;
  sender_id: string | null;
  // Username pulled from profiles via the sender_id → profiles(id) FK.
  sender_username: string | null;
  content: string;
  created_at: string;
  // NULL = no spoiler protection. A number means only users at or past that
  // chapter can see the content; others see a locked placeholder.
  spoiler_chapter: number | null;
};

// Raw shape returned by the Supabase join before we flatten it
type RawDiscussion = {
  id: string;
  group_id: string;
  book_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string;
  spoiler_chapter: number | null;
  profiles: { username: string | null } | null;
};

function flattenMessage(raw: RawDiscussion): DiscussionMessage {
  return {
    id: raw.id,
    group_id: raw.group_id,
    book_id: raw.book_id,
    sender_id: raw.sender_id,
    sender_username: raw.profiles?.username ?? null,
    content: raw.content,
    created_at: raw.created_at,
    spoiler_chapter: raw.spoiler_chapter ?? null,
  };
}

// ---------------------------------------------------------------------------
// Get all group-level messages (book_id IS NULL)
// ---------------------------------------------------------------------------

export type GetGroupMessagesResult =
  | { ok: true; messages: DiscussionMessage[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

export async function getGroupMessages(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<GetGroupMessagesResult> {
  // 1. Confirm membership
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
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  // 2. Fetch group-level messages with sender username
  const { data, error } = await client
    .from("discussions")
    .select("id, group_id, book_id, sender_id, content, created_at, spoiler_chapter, profiles(username)")
    .eq("group_id", groupId)
    .is("book_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }

  const messages = (data ?? []).map((row) => flattenMessage(row as unknown as RawDiscussion));
  return { ok: true, messages };
}

// ---------------------------------------------------------------------------
// Get all messages for a specific book
// ---------------------------------------------------------------------------

export type GetBookMessagesResult =
  | { ok: true; messages: DiscussionMessage[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

export async function getBookMessages(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  bookId: string
): Promise<GetBookMessagesResult> {
  // 1. Confirm membership
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
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  // 2. Fetch book-specific messages with sender username
  const { data, error } = await client
    .from("discussions")
    .select("id, group_id, book_id, sender_id, content, created_at, spoiler_chapter, profiles(username)")
    .eq("group_id", groupId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }

  const messages = (data ?? []).map((row) => flattenMessage(row as unknown as RawDiscussion));
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
 * Pass `spoilerChapter` to lock the message behind a chapter gate; null = no spoiler.
 */
export async function postMessage(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  content: string,
  bookId?: string | null,
  spoilerChapter?: number | null,
): Promise<PostMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, kind: "empty_content", message: "Message content cannot be empty." };
  }

  // Confirm membership
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
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const { data, error } = await client
    .from("discussions")
    .insert({
      group_id: groupId,
      book_id: bookId ?? null,
      sender_id: userId,
      content: trimmed,
      spoiler_chapter: spoilerChapter ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, kind: "error", message: error?.message ?? "Could not post message." };
  }

  return { ok: true, messageId: data.id };
}