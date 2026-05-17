import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import BookSplitView from "@/components/books/BookSplitView";
import { getBookPageData } from "@/lib/services/books";

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

  const result = await getBookPageData(supabase, user.id, id);

  if (!result.ok) {
    if (result.kind === "not_found" || result.kind === "not_member") {
      notFound();
    }
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Could not load book: {result.message}
        </div>
      </div>
    );
  }

  const {
    book,
    groupName,
    progress,
    myCurrentChapter,
    messages,
    currentUserUsername,
  } = result.data;

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/groups/${book.group_id}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← {groupName}
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
        currentUserUsername={currentUserUsername || user.email || user.id}
        initialProgress={progress}
        myCurrentChapter={myCurrentChapter}
        initialMessages={messages}
      />
    </div>
  );
}