import { test, expect, APIRequestContext } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Kick tests require two accounts:
//
//   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
//     — the group admin (the account that created the group)
//
//   TEST_MEMBER_EMAIL / TEST_MEMBER_PASSWORD
//     — a regular member who will be kicked
//
// Both accounts must already exist in Supabase (Authentication → Users).
// Add them to .env.test before running this file.
//
// The admin account must own (be admin_id of) at least one group.
// The member account must be a member of that same group.
// The easiest way to set this up the first time is:
//   1. Log in as admin in your browser, create a group, copy its invite code
//   2. Log in as member in your browser, join using that invite code
//   3. Paste the group ID into TEST_KICK_GROUP_ID in .env.test
// ---------------------------------------------------------------------------

let adminApi: APIRequestContext;
let memberApi: APIRequestContext;

// The group the kick tests run against — provided via env so this file does
// not depend on api.spec.ts having run first.
const groupId = process.env.TEST_KICK_GROUP_ID!;

test.beforeAll(async () => {
  // Both contexts log in independently and hold their own session cookies
  [adminApi, memberApi] = await Promise.all([
    createAuthenticatedContext(
      process.env.TEST_ADMIN_EMAIL!,
      process.env.TEST_ADMIN_PASSWORD!
    ),
    createAuthenticatedContext(
      process.env.TEST_MEMBER_EMAIL!,
      process.env.TEST_MEMBER_PASSWORD!
    ),
  ]);
});

test.afterAll(async () => {
  // Re-add the member after tests so the group is in a clean state for the
  // next run. If this fails (e.g. member was already removed), that's fine.
  if (groupId) {
    const groupRes = await adminApi.get(`/api/groups/${groupId}`);
    if (groupRes.ok()) {
      const { group } = await groupRes.json();
      await memberApi.post("/api/groups/join", {
        data: { invite_code: group.invite_code },
      });
    }
  }

  await Promise.all([adminApi.dispose(), memberApi.dispose()]);
});

// ---------------------------------------------------------------------------
// Validation errors — no membership changes, safe to run first
// ---------------------------------------------------------------------------

test("K1. POST /api/groups/:id/kick — returns 400 when user_id is missing", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  const res = await adminApi.post(`/api/groups/${groupId}/kick`, {
    data: {},
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/user_id is required/i);
});

test("K2. POST /api/groups/:id/kick — returns 400 when admin tries to kick themselves", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  // Get the admin's own user id from their progress or group data
  const groupRes = await adminApi.get(`/api/groups/${groupId}`);
  expect(groupRes.status()).toBe(200);

  // We need the admin's user id — fetch it from the memberships via progress.
  // The simplest way without a /me endpoint is to post a message and read
  // sender_id back, since sender_id is set server-side from the session.
  const msgRes = await adminApi.post(`/api/groups/${groupId}/messages`, {
    data: { content: "__admin_id_probe__" },
  });
  expect(msgRes.status()).toBe(201);

  const msgsRes = await adminApi.get(`/api/groups/${groupId}/messages`);
  const { messages } = await msgsRes.json();
  const probe = messages.find(
    (m: { content: string }) => m.content === "__admin_id_probe__"
  );
  expect(probe).toBeDefined();

  const adminUserId = probe.sender_id;

  const res = await adminApi.post(`/api/groups/${groupId}/kick`, {
    data: { user_id: adminUserId },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/cannot kick yourself/i);
});

test("K3. POST /api/groups/:id/kick — returns 403 when a non-admin tries to kick", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  // Get admin's user id the same way as K2
  const msgsRes = await adminApi.get(`/api/groups/${groupId}/messages`);
  const { messages } = await msgsRes.json();
  const probe = messages.find(
    (m: { content: string }) => m.content === "__admin_id_probe__"
  );
  expect(probe).toBeDefined();

  const adminUserId = probe.sender_id;

  // Member attempts to kick the admin — should be rejected
  const res = await memberApi.post(`/api/groups/${groupId}/kick`, {
    data: { user_id: adminUserId },
  });

  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error).toMatch(/only the group admin/i);
});

test("K4. POST /api/groups/:id/kick — returns 404 for a user not in the group", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  const fakeUserId = "00000000-0000-0000-0000-000000000000";

  const res = await adminApi.post(`/api/groups/${groupId}/kick`, {
    data: { user_id: fakeUserId },
  });

  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error).toMatch(/not a member/i);
});

test("K5. POST /api/groups/:id/kick — admin successfully kicks a member", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  // Get the member's user id by having them post a probe message
  const probeMsgRes = await memberApi.post(`/api/groups/${groupId}/messages`, {
    data: { content: "__member_id_probe__" },
  });
  expect(probeMsgRes.status()).toBe(201);

  const msgsRes = await adminApi.get(`/api/groups/${groupId}/messages`);
  const { messages } = await msgsRes.json();
  const probe = messages.find(
    (m: { content: string }) => m.content === "__member_id_probe__"
  );
  expect(probe).toBeDefined();

  const memberUserId = probe.sender_id;

  // Admin kicks the member
  const kickRes = await adminApi.post(`/api/groups/${groupId}/kick`, {
    data: { user_id: memberUserId },
  });

  expect(kickRes.status()).toBe(200);
  const kickBody = await kickRes.json();
  expect(kickBody.ok).toBe(true);

  // Verify the member can no longer access the group
  const verifyRes = await memberApi.get(`/api/groups/${groupId}`);
  expect(verifyRes.status()).toBe(404);
});

test("K6. POST /api/groups/:id/kick — returns 404 when kicking an already-removed member", async () => {
  test.skip(!groupId, "TEST_KICK_GROUP_ID not set in .env.test");

  // The member was kicked in K5. Trying to kick them again should return 404.
  // We need their user id — re-read from the probe message posted in K5.
  const msgsRes = await adminApi.get(`/api/groups/${groupId}/messages`);
  const { messages } = await msgsRes.json();
  const probe = messages.find(
    (m: { content: string }) => m.content === "__member_id_probe__"
  );
  expect(probe).toBeDefined();

  const memberUserId = probe.sender_id;

  const res = await adminApi.post(`/api/groups/${groupId}/kick`, {
    data: { user_id: memberUserId },
  });

  expect(res.status()).toBe(404);
});