import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";

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
  const { data: book, error } = await supabase
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("id", id)
    .single();

  if (error || !book) {
    notFound();
  }

  // Verify the user is a member of the book's group
  const { data: membership } = await supabase
    .from("memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  // Fetch group name
  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", book.group_id)
    .single();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/groups/${book.group_id}`}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← {group?.name ?? "Group"}
            </Link>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Book header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {book.title}
          </h1>

          <dl className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-8">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Author
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">
                {book.author ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Total Chapters
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">
                {book.total_chapters ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <hr className="border-neutral-200 dark:border-neutral-800 mb-8" />

        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Book discussions and reading progress will live here.
        </p>
      </main>
    </div>
  );
}