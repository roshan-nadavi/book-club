import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listGroupsForUser } from "@/lib/services/groups";
import LogoutButton from "@/components/auth/LogoutButton";
import CreateGroupForm from "@/components/groups/CreateGroupForm";
import JoinGroupForm from "@/components/groups/JoinGroupForm";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { groups, error } = await listGroupsForUser(supabase, user.id);
  const { error: pageError } = await searchParams;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            📚 Book Club
          </h1>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {pageError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {decodeURIComponent(pageError)}
          </p>
        )}

        {/* Your Groups */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            Your Groups
          </h2>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load groups: {error}
            </p>
          )}
          {!error && groups.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              You haven&apos;t joined any groups yet. Create one or join with an invite code below.
            </p>
          )}
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400 hover:shadow-sm transition dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {group.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {group.invite_code}
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 text-neutral-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <hr className="border-neutral-200 dark:border-neutral-800" />

        {/* Create Group */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            Create a New Group
          </h2>
          <CreateGroupForm />
        </section>

        <hr className="border-neutral-200 dark:border-neutral-800" />

        {/* Join Group */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            Join a Group
          </h2>
          <JoinGroupForm />
        </section>
      </main>
    </div>
  );
}