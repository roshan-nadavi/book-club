import { request, APIRequestContext } from "@playwright/test";

/**
 * Creates an authenticated Playwright request context for a given user.
 * The session cookie is stored inside the context and forwarded automatically
 * on every subsequent request — no manual header management needed.
 */
export async function createAuthenticatedContext(
  email: string,
  password: string
): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: "http://localhost:3000",
  });

  const response = await ctx.post("/api/auth/login", {
    data: { email, password },
  });

  if (response.status() >= 400) {
    throw new Error(
      `Login failed for ${email}: ${response.status()} ${await response.text()}`
    );
  }

  return ctx;
}