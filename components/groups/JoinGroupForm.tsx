"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinGroupForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: inviteCode.trim().toUpperCase() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    router.push(`/groups/${data.groupId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleJoin} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label
          htmlFor="invite-code"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Invite code
        </label>
        <input
          id="invite-code"
          type="text"
          required
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          maxLength={20}
          placeholder="e.g. ABCD1234"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-mono text-neutral-900 uppercase placeholder:text-neutral-400 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-neutral-100"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {loading ? "Joining…" : "Join group"}
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>
      )}
    </form>
  );
}