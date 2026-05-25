"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "@/lib/services/auth";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await sendPasswordResetEmail(email);

    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary">
            <svg
              className="h-7 w-7 text-neutral-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-black">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          We sent a password reset link to{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {email}
          </span>
          . Click the link in the email to reset your password.
        </p>
        <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
          Didn&apos;t receive it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => { setSubmitted(false); setEmail(""); }}
            className="underline underline-offset-4 hover:text-neutral-600 transition"
          >
            try again
          </button>
          .
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="text-sm font-medium text-black underline underline-offset-4 hover:text-neutral-600 transition"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black">
          Forgot password?
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 transition"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary text-black text-sm font-medium py-2.5 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <Link
          href="/login"
          className="font-medium text-black underline underline-offset-4 hover:text-neutral-600 transition"
        >
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}