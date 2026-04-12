import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserBookProgress = {
  user_id: string;
  book_id: string;
  current_chapter: number;
  updated_at: string;
  // Username pulled from profiles via the user_id → profiles(id) FK.
  username: string | null;
};

// Raw shape returned by Supabase before flattening the nested profiles object
type RawProgress = {
  user_id: string;
  book_id: string;
  current_chapter: number;
  updated_at: string;
  profiles: { username: string | null } | null;
};

type BookWithRawProgress = {
  group_id: string;
  user_book_progress: RawProgress[];
};

function flattenProgress(raw: RawProgress): UserBookProgress {
  return {
    user_id: raw.user_id,
    book_id: raw.book_id,
    current_chapter: raw.current_chapter,
    updated_at: raw.updated_at,
    username: raw.profiles?.username ?? null,
  };
}

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
 *   1. Read the book's group_id, then verify membership.
 *   2. Upsert the progress row.
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

  // 1a. Get the book's group_id
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
 * Each row includes the member's username via a join on profiles.
 *
 * Two queries:
 *   1. Read the book joined with user_book_progress → profiles in one call.
 *      Both joins are valid: user_book_progress.book_id → books.id (direct FK),
 *      and user_book_progress.user_id → profiles.id (direct FK).
 *   2. Membership check using the book's group_id.
 */
export async function getBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetBookProgressResult> {
  // 1a. Fetch the book, all progress rows, and each member's username
  const { data: book, error: bookError } = await client
    .from("books")
    .select(
      "group_id, user_book_progress(user_id, book_id, current_chapter, updated_at, profiles(username))"
    )
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

  const typedBook = book as unknown as BookWithRawProgress;
  const progress = (typedBook.user_book_progress ?? [])
    .map(flattenProgress)
    .sort((a, b) => b.current_chapter - a.current_chapter);

  return { ok: true, progress };
}