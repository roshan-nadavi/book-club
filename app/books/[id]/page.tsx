import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import BookSplitView from "@/components/books/BookSplitView";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the book
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("id", id)
    .single();

  if (bookError || !book) {
    notFound();
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  // Fetch group name, all progress for this book, book messages, and current user profile in parallel
  const [
    { data: group },
    { data: progressRows },
    { data: rawMessages },
    { data: currentProfile },
  ] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", book.group_id).single(),
    supabase
      .from("user_book_progress")
      .select("user_id, current_chapter, updated_at")
      .eq("book_id", id)
      .order("current_chapter", { ascending: false }),
    supabase
      .from("discussions")
      .select("id, group_id, book_id, sender_id, content, created_at")
      .eq("book_id", id)
      .eq("group_id", book.group_id)
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("username").eq("id", user.id).single(),
  ]);

  // Collect all user IDs we need usernames for (progress + message senders)
  const progressUserIds = (progressRows ?? []).map((r) => r.user_id);
  const messageSenderIds = (rawMessages ?? [])
    .map((m) => m.sender_id)
    .filter(Boolean) as string[];
  const allUserIds = [...new Set([...progressUserIds, ...messageSenderIds])];

  const { data: profileRows } = allUserIds.length
    ? await supabase.from("profiles").select("id, username").in("id", allUserIds)
    : { data: [] };

  const usernameMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.username ?? p.id])
  );

  // Build typed arrays
  const progress = (progressRows ?? []).map((r) => ({
    user_id: r.user_id,
    username: usernameMap[r.user_id] ?? r.user_id,
    current_chapter: r.current_chapter,
    updated_at: r.updated_at,
  }));

  const messages = (rawMessages ?? []).map((m) => ({
    ...m,
    book_id: m.book_id ?? id,
    sender_username: m.sender_id ? (usernameMap[m.sender_id] ?? m.sender_id) : "Unknown",
  }));

  const myProgressEntry = progress.find((p) => p.user_id === user.id);
  const myCurrentChapter = myProgressEntry?.current_chapter ?? null;
  const currentUserUsername = currentProfile?.username ?? user.email ?? user.id;

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/groups/${book.group_id}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← {group?.name ?? "Group"}
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {book.title}
            </h1>
            {book.author && (
              <>
                <span className="hidden sm:inline text-neutral-300 dark:text-neutral-700">·</span>
                <span className="hidden sm:inline text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {book.author}
                </span>
              </>
            )}
            {book.total_chapters && (
              <span className="hidden sm:inline text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded shrink-0">
                {book.total_chapters} ch.
              </span>
            )}
          </div>
          <LogoutButton />
        </div>
      </header>

      <BookSplitView
        bookId={id}
        groupId={book.group_id}
        totalChapters={book.total_chapters}
        currentUserId={user.id}
        currentUserUsername={currentUserUsername}
        initialProgress={progress}
        myCurrentChapter={myCurrentChapter}
        initialMessages={messages}
      />
    </div>
  );
}