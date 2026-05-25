"use server";

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Change password (authenticated user, requires current password)
// ---------------------------------------------------------------------------

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Re-authenticates the user with their current credentials server-side,
 * then updates their password.
 *
 * Uses the server client so it can read the existing session cookie.
 * signInWithPassword refreshes the session before updateUser is called.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  // Step 1 — verify current credentials
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  });

  if (signInError) {
    if (
      signInError.message.toLowerCase().includes("invalid") ||
      signInError.message.toLowerCase().includes("credentials")
    ) {
      return { ok: false, message: "Current password is incorrect." };
    }
    return { ok: false, message: signInError.message };
  }

  // Step 2 — update to new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  return { ok: true };
}