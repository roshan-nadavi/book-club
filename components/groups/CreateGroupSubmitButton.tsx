"use client";

import { useFormStatus } from "react-dom";

export default function CreateGroupSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-black transition hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Creating…" : "Create group"}
    </button>
  );
}