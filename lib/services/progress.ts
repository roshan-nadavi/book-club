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
// Supabase's type inference only follows FK relationships in the direction they
// are declared in Database["public"]["Tables"][T]["Relationships"]. When we
// join in the *reverse* direction (e.g. from `books` into `memberships` or
// `user_book_progress`, whose FK points at `books` — not the other way around)
// the inferred type for `data` won't include the joined columns. We therefore
// cast the raw result to these explicit intermediate types which mirror what
// PostgREST actually returns at runtime.
// ---------------------------------------------------------------------------

type BookWithMembership = {
  group_id: string;
  memberships: { user_id: string }[];
};

type BookWithMembershipAndProgress = {
  group_id: string;
  memberships: { user_id: string }[];
  user_book_progress: UserBookProgress[];
};

// ---------------------------------------------------------------------------
// Update (or initialise) a user's chapter progress for a book
// ---------------------------------------------------------------------------

export type UpdateProgressResult =
  | { ok: true }
  | { ok: false; kind: "not_member" | "invalid_chapter" | "error"; message: string };

/**
 * Upsert the calling user's current chapter for a book.
 * `currentChapter` must be a non-negative number (decimals allowed — the
 * underlying column is DECIMAL(5,1), so 12.5 is valid).
 *
 * Single read query: start from `books`, inner-join `memberships` scoped to
 * this user so we confirm both book existence and membership in one call.
 * The upsert is a separate write (unavoidable).
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

  // Confirm book exists and user is a member of its group — one read.
  // Cast to BookWithMembership because the joined `memberships` columns are
  // not reflected in the inferred type when joining from the FK target side.
  const { data, error: bookError } = await client
    .from("books")
    .select("group_id, memberships!inner(user_id)")
    .eq("id", bookId)
    .eq("memberships.user_id", userId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }

  const book = data as BookWithMembership | null;

  if (!book || book.memberships.length === 0) {
    return {
      ok: false,
      kind: "not_member",
      message: "Book not found or you are not a member of this group.",
    };
  }

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
 * given book, sorted furthest-ahead first.
 *
 * Single query: start from `books`, inner-join `memberships` (scoped to this
 * user for the auth check) and `user_book_progress` (all rows) in the same
 * select so no second round-trip is needed.
 */
export async function getBookProgress(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetBookProgressResult> {
  const { data, error: bookError } = await client
    .from("books")
    .select(
      "group_id, memberships!inner(user_id), user_book_progress(user_id, book_id, current_chapter, updated_at)"
    )
    .eq("id", bookId)
    .eq("memberships.user_id", userId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }

  // Cast to the explicit intermediate type — see note at top of file.
  const book = data as BookWithMembershipAndProgress | null;

  if (!book || book.memberships.length === 0) {
    return {
      ok: false,
      kind: "not_member",
      message: "Book not found or you are not a member of this group.",
    };
  }

  const progress = [...(book.user_book_progress ?? [])].sort(
    (a, b) => b.current_chapter - a.current_chapter
  );

  return { ok: true, progress };
}