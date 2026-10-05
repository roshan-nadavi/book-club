"use client";

import { useEffect, useState } from "react";

export default function GuestAccessButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        How to view features without signing up
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-access-title"
            className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="guest-access-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Try it without signing up
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Log in with the guest account to explore the features:
            </p>
            <dl className="mt-4 space-y-2 text-sm text-neutral-900 dark:text-neutral-100">
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Email
                </dt>
                <dd className="font-mono">guestUser@gmail.com</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Password
                </dt>
                <dd className="font-mono">guestUser</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-black transition hover:bg-primary-hover"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
