import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type UserBookProgress = {
  user_id: string;
  book_id: string;
  current_chapter: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Update (or initialise) a user's chapter progress for a book
// ---------------------------------------------------------------------------

export type UpdateProgressResult =
  | { ok: true }
  | { ok: false; kind: "not_member" | "invalid_chapter" | "error"; message: string };

/**
 * Upsert the calling user's current chapter for a book.
 * `currentChapter` must be a non-negative integer.
 * The user must be a member of the group that owns the book.
 */
export async function updateBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string,
  currentChapter: number
): Promise<UpdateProgressResult> {
  if (!Number.isInteger(currentChapter) || currentChapter < 0) {
    return {
      ok: false,
      kind: "invalid_chapter",
      message: "Current chapter must be a non-negative integer.",
    };
  }

  // 1. Resolve which group this book belongs to and verify membership
  const { data: book, error: bookError } = await client
    .from("books")
    .select("group_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (!book) {
    return { ok: false, kind: "error", message: "Book not found." };
  }

  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  // 2. Upsert the progress row
  const { error: upsertError } = await client
    .from("user_book_progress")
    .upsert(
      {
        user_id: userId,
        book_id: bookId,
        current_chapter: currentChapter,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" }
    );

  if (upsertError) {
    return { ok: false, kind: "error", message: upsertError.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// View all members' chapter progress for a book
// ---------------------------------------------------------------------------

export type GetBookProgressResult =
  | { ok: true; progress: UserBookProgress[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

/**
 * Return the current chapter progress for every member of the group for a
 * given book, ordered by chapter descending (furthest ahead first).
 * The requesting user must be a member of the group.
 */
export async function getBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetBookProgressResult> {
  // 1. Resolve the group this book belongs to
  const { data: book, error: bookError } = await client
    .from("books")
    .select("group_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (!book) {
    return { ok: false, kind: "error", message: "Book not found." };
  }

  // 2. Verify the requesting user is a member
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  // 3. Fetch all progress rows for this book
  const { data: progress, error: progressError } = await client
    .from("user_book_progress")
    .select("user_id, book_id, current_chapter, updated_at")
    .eq("book_id", bookId)
    .order("current_chapter", { ascending: false });

  if (progressError) {
    return { ok: false, kind: "error", message: progressError.message };
  }

  return { ok: true, progress: (progress ?? []) as UserBookProgress[] };
}