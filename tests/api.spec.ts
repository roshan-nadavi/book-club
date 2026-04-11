import { test, expect, APIRequestContext } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Shared state — populated as tests run in order
// ---------------------------------------------------------------------------

let api: APIRequestContext;
let groupId: string;
let bookId: string;

test.beforeAll(async () => {
  api = await createAuthenticatedContext(
    process.env.TEST_EMAIL!,
    process.env.TEST_PASSWORD!
  );
});

test.afterAll(async () => {
  await api.dispose();
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

test("1. GET /api/groups — lists groups for the authenticated user", async () => {
  const res = await api.get("/api/groups");

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("groups");
  expect(Array.isArray(body.groups)).toBe(true);

  if (body.groups.length > 0) {
    groupId = body.groups[0].id;
    expect(groupId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  }
});

test("2. GET /api/groups/:id — returns a single group the user is a member of", async () => {
  test.skip(!groupId, "No groupId available — run test 1 first with an existing group");

  const res = await api.get(`/api/groups/${groupId}`);

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("group");
  expect(body.group.id).toBe(groupId);
  expect(body.group).toHaveProperty("name");
  expect(body.group).toHaveProperty("invite_code");
});

test("2a. GET /api/groups/:id — returns 404 for a group the user is not a member of", async () => {
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const res = await api.get(`/api/groups/${fakeId}`);

  expect(res.status()).toBe(404);
});

test("3. POST /api/groups/join — returns 409 when already a member", async () => {
  test.skip(!groupId, "No groupId available");

  const groupRes = await api.get(`/api/groups/${groupId}`);
  const { group } = await groupRes.json();

  const res = await api.post("/api/groups/join", {
    data: { invite_code: group.invite_code },
  });

  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error).toMatch(/already a member/i);
});

test("3a. POST /api/groups/join — returns 404 for an invalid invite code", async () => {
  const res = await api.post("/api/groups/join", {
    data: { invite_code: "INVALID0" },
  });

  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error).toMatch(/no group found/i);
});

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

test("4. POST /api/groups/:id/books — adds a book and returns its id", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.post(`/api/groups/${groupId}/books`, {
    data: {
      title: "Dune",
      author: "Frank Herbert",
      total_chapters: 48,
    },
  });

  expect(res.status()).toBe(201);

  const body = await res.json();
  expect(body).toHaveProperty("bookId");
  expect(body.bookId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );

  bookId = body.bookId;
});

test("4a. POST /api/groups/:id/books — returns 400 when title is missing", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.post(`/api/groups/${groupId}/books`, {
    data: { author: "Frank Herbert" },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/title is required/i);
});

test("5. GET /api/groups/:id/books — lists books in the group", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.get(`/api/groups/${groupId}/books`);

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("books");
  expect(Array.isArray(body.books)).toBe(true);

  if (bookId) {
    const found = body.books.find((b: { id: string }) => b.id === bookId);
    expect(found).toBeDefined();
    expect(found.title).toBe("Dune");
  }
});

// ---------------------------------------------------------------------------
// Group-level messages
// ---------------------------------------------------------------------------

test("6. POST /api/groups/:id/messages — posts a group-level message", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.post(`/api/groups/${groupId}/messages`, {
    data: { content: "Welcome everyone to the club!" },
  });

  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("messageId");
});

test("6a. POST /api/groups/:id/messages — returns 400 when content is empty", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.post(`/api/groups/${groupId}/messages`, {
    data: { content: "   " },
  });

  expect(res.status()).toBe(400);
});

test("7. GET /api/groups/:id/messages — returns group-level messages with null book_id", async () => {
  test.skip(!groupId, "No groupId available");

  const res = await api.get(`/api/groups/${groupId}/messages`);

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("messages");
  expect(Array.isArray(body.messages)).toBe(true);

  for (const msg of body.messages) {
    expect(msg.book_id).toBeNull();
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("sender_id");
    expect(msg).toHaveProperty("created_at");
  }

  const found = body.messages.find(
    (m: { content: string }) => m.content === "Welcome everyone to the club!"
  );
  expect(found).toBeDefined();
});

// ---------------------------------------------------------------------------
// Book-level messages
// ---------------------------------------------------------------------------

test("8. POST /api/books/:id/messages — posts a book-specific message", async () => {
  test.skip(!bookId || !groupId, "No bookId or groupId available");

  const res = await api.post(`/api/books/${bookId}/messages`, {
    data: {
      group_id: groupId,
      content: "The first chapter is incredible.",
    },
  });

  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toHaveProperty("messageId");
});

test("8a. POST /api/books/:id/messages — returns 400 when group_id is missing", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.post(`/api/books/${bookId}/messages`, {
    data: { content: "Missing group_id." },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/group_id is required/i);
});

test("9. GET /api/books/:id/messages — returns only messages for this book", async () => {
  test.skip(!bookId || !groupId, "No bookId or groupId available");

  const res = await api.get(`/api/books/${bookId}/messages`, {
    params: { group_id: groupId },
  });

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("messages");
  expect(Array.isArray(body.messages)).toBe(true);

  for (const msg of body.messages) {
    expect(msg.book_id).toBe(bookId);
  }

  const found = body.messages.find(
    (m: { content: string }) => m.content === "The first chapter is incredible."
  );
  expect(found).toBeDefined();
});

test("9a. GET /api/books/:id/messages — returns 400 when group_id param is missing", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.get(`/api/books/${bookId}/messages`);

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/group_id/i);
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

test("10. PUT /api/books/:id/progress — updates chapter progress", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.put(`/api/books/${bookId}/progress`, {
    data: { current_chapter: 5 },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("10a. PUT /api/books/:id/progress — accepts decimal chapters", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.put(`/api/books/${bookId}/progress`, {
    data: { current_chapter: 5.5 },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("10b. PUT /api/books/:id/progress — returns 400 for a negative chapter", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.put(`/api/books/${bookId}/progress`, {
    data: { current_chapter: -1 },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/non-negative/i);
});

test("10c. PUT /api/books/:id/progress — returns 400 when current_chapter is missing", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.put(`/api/books/${bookId}/progress`, {
    data: {},
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/current_chapter is required/i);
});

test("11. GET /api/books/:id/progress — returns all members progress sorted desc", async () => {
  test.skip(!bookId, "No bookId available");

  const res = await api.get(`/api/books/${bookId}/progress`);

  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty("progress");
  expect(Array.isArray(body.progress)).toBe(true);

  const ours = body.progress.find(
    (p: { current_chapter: number }) => p.current_chapter === 5.5
  );
  expect(ours).toBeDefined();

  for (let i = 0; i < body.progress.length - 1; i++) {
    expect(body.progress[i].current_chapter).toBeGreaterThanOrEqual(
      body.progress[i + 1].current_chapter
    );
  }
});