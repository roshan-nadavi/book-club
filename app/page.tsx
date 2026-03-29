import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateGroupForm from "@/components/groups/CreateGroupForm";
import LogoutButton from "@/components/auth/LogoutButton";
import { listGroupsForUser } from "@/lib/services/groups";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { groups, error: listError } = await listGroupsForUser(supabase, user.id);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Your book clubs
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Create a group or open one you belong to. Use{" "}
              <strong className="font-medium text-neutral-700 dark:text-neutral-300">Log out</strong>{" "}
              to return to the sign-in page.
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {params.error && (
          <p
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            role="alert"
          >
            {params.error}
          </p>
        )}

        {listError && (
          <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Could not load groups: {listError}
          </p>
        )}

        <section className="mb-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Create a group
          </h2>
          <CreateGroupForm />
        </section>

        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Your groups
          </h2>
          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-100/80 px-4 py-8 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
              You are not in any groups yet. Create one above to get started.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="flex flex-col rounded-lg border border-neutral-200 bg-white px-4 py-4 transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {g.name}
                    </span>
                    <span className="mt-2 font-mono text-xs text-neutral-500 sm:mt-0">
                      Invite: {g.invite_code}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
