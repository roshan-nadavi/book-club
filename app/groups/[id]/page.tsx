import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import { getGroupForMember } from "@/lib/services/groups";
import GroupSplitView from "@/components/groups/GroupSplitView";

export default async function GroupPage({
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

  const result = await getGroupForMember(supabase, user.id, id);

  if (!result.ok) {
    if (result.kind === "error") {
      return (
        <div className="min-h-screen bg-neutral-50 px-4 py-16 dark:bg-neutral-950">
          <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Could not load this group: {result.message}
          </div>
        </div>
      );
    }
    notFound();
  }

  const { group } = result;

  // Fetch books and group-level messages directly via Supabase
  const [{ data: bookRows }, { data: messageRows }] = await Promise.all([
    supabase
      .from("books")
      .select("id, group_id, title, author, total_chapters, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("discussions")
      .select("id, group_id, book_id, sender_id, content, created_at")
      .eq("group_id", id)
      .is("book_id", null)
      .order("created_at", { ascending: true }),
  ]);

  const books = bookRows ?? [];
  const messages = messageRows ?? [];

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← Groups
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {group.name}
            </h1>
            <span className="hidden sm:inline font-mono text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
              {group.invite_code}
            </span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <GroupSplitView
        groupId={id}
        currentUserId={user.id}
        currentUserEmail={user.email ?? ""}
        initialBooks={books}
        initialMessages={messages}
      />
    </div>
  );
}