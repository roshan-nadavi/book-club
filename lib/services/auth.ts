"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Send a password reset email (OTP / magic link)
// ---------------------------------------------------------------------------

export type SendResetEmailResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Triggers Supabase to email a password-reset link to the given address.
 * The link will redirect to /auth/callback?next=/reset-password, which
 * exchanges the token and lands the user on the reset-password page.
 *
 * This is a server-side call so the redirectTo URL can reference the origin
 * reliably. The actual email sending is handled entirely by Supabase.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<SendResetEmailResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reset password (used after clicking the email link)
// ---------------------------------------------------------------------------

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Updates the authenticated user's password.
 * Only valid when the user has an active recovery session (i.e. they arrived
 * via the reset-password email link and the token has been exchanged).
 */
export async function resetPassword(
  newPassword: string
): Promise<ResetPasswordResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Change password (authenticated user, requires current password)
// ---------------------------------------------------------------------------

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Re-authenticates the user with their current credentials, then updates
 * their password. This is used from the change-password page where the
 * user is already logged in.
 *
 * Steps:
 *   1. Sign in with email + currentPassword to verify the current credentials.
 *   2. Call updateUser with the new password.
 *
 * Note: signInWithPassword on the browser client (not server) so the session
 * cookie is refreshed properly in the browser context. For the server action
 * path we use the server client which reads cookies from the request.
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
    // Surface a friendlier message for wrong-password errors
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