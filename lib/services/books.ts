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
 * Add a book to a group.
 * The requesting user must be a member of the group.
 */
export async function addBookToGroup(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  title: string,
  author?: string,
  totalChapters?: number
): Promise<AddBookResult> {
  // 1. Confirm the user is a member of the group
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

  // 2. Insert the book
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
 */
export async function listBooksForGroup(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string
): Promise<ListBooksResult> {
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

  // 2. Fetch books
  const { data: books, error: booksError } = await client
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (booksError) {
    return { ok: false, kind: "error", message: booksError.message };
  }

  return { ok: true, books: (books ?? []) as BookSummary[] };
}