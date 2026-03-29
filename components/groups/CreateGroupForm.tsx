import { createGroup } from "@/app/actions/groups";

export default function CreateGroupForm() {
  return (
    <form action={createGroup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label
          htmlFor="group-name"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          New group name
        </label>
        <input
          id="group-name"
          name="name"
          type="text"
          required
          maxLength={120}
          placeholder="e.g. Tuesday Sci‑Fi Club"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-neutral-100"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Create group
      </button>
    </form>
  );
}
