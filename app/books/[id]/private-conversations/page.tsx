import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import PrivateConversationsView from "@/components/books/PrivateConversationsView";
import { getPrivateConversationsPageData } from "@/lib/services/privateChats";

export default async function PrivateConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getPrivateConversationsPageData(supabase, user.id, bookId);

  if (!result.ok) {
    if (result.kind === "not_found" || result.kind === "not_member") {
      notFound();
    }
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Could not load private conversations: {result.message}
        </div>
      </div>
    );
  }

  const {
    book,
    groupName,
    currentUserUsername,
    myCurrentChapter,
    allGroupMembers,
    privateRooms,
  } = result.data;

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="shrink-0 border-b border-neutral-300 bg-header">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/groups/${book.group_id}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← {groupName}
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link
              href={`/books/${bookId}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition truncate"
            >
              {book.title}
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <h1 className="text-sm font-semibold text-black truncate">
              Private Conversations
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <PrivateConversationsView
        bookId={bookId}
        groupId={book.group_id}
        currentUserId={user.id}
        currentUserUsername={currentUserUsername}
        myCurrentChapter={myCurrentChapter}
        totalChapters={book.total_chapters}
        initialRooms={privateRooms}
        allGroupMembers={allGroupMembers}
      />
    </div>
  );
}