import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type BookSummary = {
  id: string;
  group_id: string;
  title: string;
  author: string | null;
  total_chapters: number | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Add a book to a group
// ---------------------------------------------------------------------------

export type AddBookResult =
  | { ok: true; bookId: string }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Add a book to a group. The requesting user must be a member.
 *
 * Single read query: join `memberships` onto `groups` scoped to this user so
 * membership is confirmed without a separate call.  The insert is a separate
 * write (unavoidable).
 */
export async function addBookToGroup(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  title: string,
  author?: string,
  totalChapters?: number
): Promise<AddBookResult> {
  // Confirm membership via a join — one read
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id, groups!inner(id)")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const { data: book, error: bookError } = await client
    .from("books")
    .insert({
      group_id: groupId,
      title: title.trim(),
      author: author?.trim() ?? null,
      total_chapters: totalChapters ?? null,
    })
    .select("id")
    .single();

  if (bookError || !book) {
    return { ok: false, kind: "error", message: bookError?.message ?? "Could not add book." };
  }

  return { ok: true, bookId: book.id };
}

// ---------------------------------------------------------------------------
// List books for a group
// ---------------------------------------------------------------------------

export type ListBooksResult =
  | { ok: true; books: BookSummary[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Return all books belonging to a group, newest first.
 * The requesting user must be a member.
 *
 * Single query: start from `memberships` (confirming membership) and
 * inner-join `groups` → `books` to pull all books in the same call.
 */
export async function listBooksForGroup(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<ListBooksResult> {
  const { data, error } = await client
    .from("memberships")
    .select("groups!inner(books(id, group_id, title, author, total_chapters, created_at))")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  const group = data.groups as unknown as { books: BookSummary[] };
  const books = [...(group?.books ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { ok: true, books };
}