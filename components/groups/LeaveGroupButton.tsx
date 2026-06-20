"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  groupId: string;
  groupName: string;
  isAdmin: boolean;
}

function DoorIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3v18M9 3h7a2 2 0 012 2v14a2 2 0 01-2 2H9M9 3H6a2 2 0 00-2 2v14a2 2 0 002 2h3M15 12h.01"
      />
    </svg>
  );
}

export default function LeaveGroupButton({ groupId, groupName, isAdmin }: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAdmin) {
    return (
      <button
        type="button"
        disabled
        title="You're the admin of this group — leaving isn't available yet."
        aria-label="Cannot leave: you are the admin"
        className="inline-flex shrink-0 items-center justify-center w-7 h-7 rounded-full text-red-200 dark:text-red-900 cursor-not-allowed"
      >
        <DoorIcon />
      </button>
    );
  }

  async function handleLeave() {
    setLeaving(true);
    setError(null);
    const res = await fetch(`/api/groups/${groupId}/leave`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Failed to leave group.");
      setLeaving(false);
      return;
    }

    setLeaving(false);
    setShowConfirm(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setShowConfirm(true); }}
        aria-label={`Leave ${groupName}`}
        title="Leave group"
        className="inline-flex shrink-0 items-center justify-center w-7 h-7 rounded-full text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300 transition-colors"
      >
        <DoorIcon />
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !leaving) setShowConfirm(false); }}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs p-6 flex flex-col gap-4">
            <p className="text-sm text-neutral-800 dark:text-neutral-200 text-center leading-relaxed">
              Are you sure you want to leave <span className="font-semibold">{groupName}</span>?
            </p>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 text-center">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={leaving}
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {leaving ? "Leaving…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}