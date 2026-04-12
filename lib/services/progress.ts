import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type UserBookProgress = {
  user_id: string;
  book_id: string;
  current_chapter: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Intermediate shapes for joined query results
//
// The books → memberships join is not possible directly because there is no
// FK between those two tables. Both relate to groups, but PostgREST requires
// a direct FK to perform a join. Instead we read the book's group_id first
// (joined with user_book_progress in one call for getBookProgress), then
// check membership separately. This keeps it to two queries maximum while
// staying within what PostgREST can actually resolve.
// ---------------------------------------------------------------------------

type BookWithProgress = {
  group_id: string;
  user_book_progress: UserBookProgress[];
};

// ---------------------------------------------------------------------------
// Update (or initialise) a user's chapter progress for a book
// ---------------------------------------------------------------------------

export type UpdateProgressResult =
  | { ok: true }
  | { ok: false; kind: "not_member" | "invalid_chapter" | "book_not_found" | "error"; message: string };

/**
 * Upsert the calling user's current chapter for a book.
 * `currentChapter` must be a non-negative number (decimals allowed —
 * the underlying column is DECIMAL(5,1), so 12.5 is valid).
 *
 * Two queries:
 *   1. Read the book to get its group_id, then check membership via
 *      the memberships table using that group_id.
 *   2. Upsert the progress row.
 *
 * The books → memberships join was removed because there is no direct FK
 * between those tables — PostgREST requires one to perform a join.
 */
export async function updateBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string,
  currentChapter: number
): Promise<UpdateProgressResult> {
  if (typeof currentChapter !== "number" || currentChapter < 0 || !isFinite(currentChapter)) {
    return {
      ok: false,
      kind: "invalid_chapter",
      message: "Current chapter must be a non-negative number.",
    };
  }

  // 1a. Fetch the book to get its group_id
  const { data: book, error: bookError } = await client
    .from("books")
    .select("group_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (!book) {
    return { ok: false, kind: "book_not_found", message: "Book not found." };
  }

  // 1b. Confirm the user is a member of the group that owns this book
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
  | { ok: false; kind: "not_member" | "book_not_found" | "error"; message: string };

/**
 * Return the current chapter progress for every member of the group for a
 * given book, sorted furthest-ahead first.
 *
 * Two queries:
 *   1. Read the book joined with user_book_progress (direct FK exists), then
 *      check membership using the book's group_id.
 *   2. Membership check via memberships table.
 *
 * user_book_progress joins books directly (book_id FK), so that join is valid.
 * The memberships check must be separate for the same reason as above.
 */
export async function getBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetBookProgressResult> {
  // 1a. Fetch the book and all progress rows in one query —
  //     user_book_progress.book_id → books.id is a direct FK so this join is valid
  const { data: book, error: bookError } = await client
    .from("books")
    .select("group_id, user_book_progress(user_id, book_id, current_chapter, updated_at)")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (!book) {
    return { ok: false, kind: "book_not_found", message: "Book not found." };
  }

  // 1b. Confirm the user is a member of the group that owns this book
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

  const typedBook = book as unknown as BookWithProgress;
  const progress = [...(typedBook.user_book_progress ?? [])].sort(
    (a, b) => b.current_chapter - a.current_chapter
  );

  return { ok: true, progress };
}