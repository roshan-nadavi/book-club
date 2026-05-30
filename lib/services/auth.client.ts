import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Send a password reset email
// ---------------------------------------------------------------------------

export type SendResetEmailResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Triggers Supabase to email a password-reset link.
 *
 * MUST run in the browser (not a Server Action) because resetPasswordForEmail
 * uses the PKCE flow: it generates a code_verifier, stores it in a browser
 * cookie, and includes the corresponding code_challenge in the email link.
 * When the user clicks the link and hits /auth/callback, the server reads
 * that same cookie to verify the code. If this ran server-side, the
 * code_verifier cookie would never reach the browser and the exchange fails.
 *
 * The redirectTo tells Supabase where to send the user after they click the
 * link. It must be in your Supabase dashboard's Redirect URLs allowlist.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<SendResetEmailResult> {
  const supabase = createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/callback?next=/reset-password`,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reset password after arriving via the email link
// ---------------------------------------------------------------------------

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Updates the user's password after they've clicked the reset link.
 *
 * MUST run in the browser because the recovery session established by
 * /auth/callback lives in the browser's cookie store. The server client
 * reads cookies from the incoming request, but at the time this is called
 * (user is on /reset-password and submits the form), there is no new
 * request — the session is already in the browser. Using the browser client
 * ensures updateUser reads the correct live session.
 */
export async function resetPassword(
  newPassword: string
): Promise<ResetPasswordResult> {
  const supabase = createClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}