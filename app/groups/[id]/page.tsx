import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import { getGroupForMember } from "@/lib/services/groups";

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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              ← All groups
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{group.name}</h1>
            <p className="mt-1 font-mono text-sm text-neutral-500">Invite code: {group.invite_code}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Group home — books and discussions can live here next.
        </p>
      </main>
    </div>
  );
}
