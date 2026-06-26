import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type BookSummary = {
  id: string;
  group_id: string;
  title: string;
  author: string | null;
  total_chapters: number | null;
  created_at: string;
  spoiler_chapter: number | null
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

// ---------------------------------------------------------------------------
// Fetch all data needed to render the book page
// ---------------------------------------------------------------------------

export type BookDetail = {
  id: string;
  group_id: string;
  title: string;
  author: string | null;
  total_chapters: number | null;
  created_at: string;
};

export type BookProgressEntry = {
  user_id: string;
  username: string;
  current_chapter: number;
  updated_at: string;
};

export type BookMessage = {
  id: string;
  group_id: string;
  book_id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender_username: string;
  spoiler_chapter: number | null
};

export type BookPageData = {
  book: BookDetail;
  groupName: string;
  progress: BookProgressEntry[];
  myCurrentChapter: number | null;
  messages: BookMessage[];
  currentUserUsername: string;
};

export type GetBookPageDataResult =
  | { ok: true; data: BookPageData }
  | { ok: false; kind: "not_found" | "not_member" | "error"; message: string };

/**
 * Fetch all data required by the book page:
 *   - The book itself
 *   - Membership verification
 *   - Group name
 *   - All members' reading progress (with usernames)
 *   - All book-level discussion messages (with usernames)
 *   - The current user's username
 *
 * Queries:
 *   1. Book row.
 *   2. Membership check.
 *   3. Group name + progress rows + book messages + current user profile (parallel).
 *   4. Batch profile lookup for all user IDs referenced in progress and messages.
 */
export async function getBookPageData(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetBookPageDataResult> {
  // 1. Fetch the book
  const { data: book, error: bookError } = await client
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    return { ok: false, kind: "not_found", message: "Book not found." };
  }

  // 2. Verify membership
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

  // 3. Parallel fetch: group name, progress rows, messages, current user profile
  const [
    { data: group, error: groupError },
    { data: progressRows, error: progressError },
    { data: rawMessages, error: msgError },
    { data: currentProfile, error: profileError },
  ] = await Promise.all([
    client.from("groups").select("id, name").eq("id", book.group_id).single(),
    client
      .from("user_book_progress")
      .select("user_id, current_chapter, updated_at")
      .eq("book_id", bookId)
      .order("current_chapter", { ascending: false }),
    client
      .from("discussions")
      .select("id, group_id, book_id, sender_id, content, created_at, spoiler_chapter")
      .eq("book_id", bookId)
      .eq("group_id", book.group_id)
      .order("created_at", { ascending: true }),
    client.from("profiles").select("username").eq("id", userId).single(),
  ]);

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (progressError) {
    return { ok: false, kind: "error", message: progressError.message };
  }
  if (msgError) {
    return { ok: false, kind: "error", message: msgError.message };
  }
  if (profileError) {
    return { ok: false, kind: "error", message: profileError.message };
  }

  // 4. Batch-fetch usernames for all unique user IDs (progress + message senders)
  const progressUserIds = (progressRows ?? []).map((r) => r.user_id);
  const messageSenderIds = (rawMessages ?? [])
    .map((m) => m.sender_id)
    .filter(Boolean) as string[];
  const allUserIds = [...new Set([...progressUserIds, ...messageSenderIds])];

  const { data: profileRows } = allUserIds.length
    ? await client.from("profiles").select("id, username").in("id", allUserIds)
    : { data: [] };

  const usernameMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.username ?? p.id])
  );

  // Build typed arrays
  const progress: BookProgressEntry[] = (progressRows ?? []).map((r) => ({
    user_id: r.user_id,
    username: usernameMap[r.user_id] ?? r.user_id,
    current_chapter: r.current_chapter,
    updated_at: r.updated_at,
  }));

  const messages: BookMessage[] = (rawMessages ?? []).map((m) => ({
    id: m.id,
    group_id: m.group_id,
    book_id: m.book_id ?? bookId,
    sender_id: m.sender_id,
    content: m.content,
    created_at: m.created_at,
    sender_username: m.sender_id
      ? (usernameMap[m.sender_id] ?? m.sender_id)
      : "Unknown",
    spoiler_chapter: m.spoiler_chapter ?? null,
  }));

  const myProgressEntry = progress.find((p) => p.user_id === userId);

  return {
    ok: true,
    data: {
      book,
      groupName: group?.name ?? "Group",
      progress,
      myCurrentChapter: myProgressEntry?.current_chapter ?? null,
      messages,
      currentUserUsername:
        currentProfile?.username ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Delete a book from a group (admin only)
// ---------------------------------------------------------------------------

export type DeleteBookResult =
  | { ok: true }
  | { ok: false; kind: "not_found" | "not_admin" | "error"; message: string };

export async function deleteBook(
  client: SupabaseClient<Database>,
  userId: string,
  groupId: string,
  bookId: string
): Promise<DeleteBookResult> {
  // Confirm the book exists and belongs to this group, and fetch the group's admin
  const { data: book, error: bookError } = await client
    .from("books")
    .select("id, group_id, groups!inner(admin_id)")
    .eq("id", bookId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (bookError) {
    return { ok: false, kind: "error", message: bookError.message };
  }
  if (!book) {
    return { ok: false, kind: "not_found", message: "Book not found in this group." };
  }

  const group = book.groups as unknown as { admin_id: string | null };
  if (group.admin_id !== userId) {
    return { ok: false, kind: "not_admin", message: "Only the group admin can remove books." };
  }

  const { error: deleteError } = await client
    .from("books")
    .delete()
    .eq("id", bookId);

  if (deleteError) {
    return { ok: false, kind: "error", message: deleteError.message };
  }

  return { ok: true };
}