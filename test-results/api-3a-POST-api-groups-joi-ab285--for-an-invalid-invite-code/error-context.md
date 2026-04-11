# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api.spec.ts >> 3a. POST /api/groups/join — returns 404 for an invalid invite code
- Location: tests\api.spec.ts:80:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 404
Received: 200
```

# Test source

```ts
  1   | import { test, expect, APIRequestContext } from "@playwright/test";
  2   | import { createAuthenticatedContext } from "./helpers/auth";
  3   | 
  4   | // ---------------------------------------------------------------------------
  5   | // Shared state — populated as tests run in order
  6   | // ---------------------------------------------------------------------------
  7   | 
  8   | let api: APIRequestContext;
  9   | let groupId: string;
  10  | let bookId: string;
  11  | 
  12  | test.beforeAll(async () => {
  13  |   api = await createAuthenticatedContext(
  14  |     process.env.TEST_EMAIL!,
  15  |     process.env.TEST_PASSWORD!
  16  |   );
  17  | });
  18  | 
  19  | test.afterAll(async () => {
  20  |   await api.dispose();
  21  | });
  22  | 
  23  | // ---------------------------------------------------------------------------
  24  | // Groups
  25  | // ---------------------------------------------------------------------------
  26  | 
  27  | test("1. GET /api/groups — lists groups for the authenticated user", async () => {
  28  |   const res = await api.get("/api/groups");
  29  | 
  30  |   expect(res.status()).toBe(200);
  31  | 
  32  |   const body = await res.json();
  33  |   expect(body).toHaveProperty("groups");
  34  |   expect(Array.isArray(body.groups)).toBe(true);
  35  | 
  36  |   if (body.groups.length > 0) {
  37  |     groupId = body.groups[0].id;
  38  |     expect(groupId).toMatch(
  39  |       /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  40  |     );
  41  |   }
  42  | });
  43  | 
  44  | test("2. GET /api/groups/:id — returns a single group the user is a member of", async () => {
  45  |   test.skip(!groupId, "No groupId available — run test 1 first with an existing group");
  46  | 
  47  |   const res = await api.get(`/api/groups/${groupId}`);
  48  | 
  49  |   expect(res.status()).toBe(200);
  50  | 
  51  |   const body = await res.json();
  52  |   expect(body).toHaveProperty("group");
  53  |   expect(body.group.id).toBe(groupId);
  54  |   expect(body.group).toHaveProperty("name");
  55  |   expect(body.group).toHaveProperty("invite_code");
  56  | });
  57  | 
  58  | test("2a. GET /api/groups/:id — returns 404 for a group the user is not a member of", async () => {
  59  |   const fakeId = "00000000-0000-0000-0000-000000000000";
  60  |   const res = await api.get(`/api/groups/${fakeId}`);
  61  | 
  62  |   expect(res.status()).toBe(404);
  63  | });
  64  | 
  65  | test("3. POST /api/groups/join — returns 409 when already a member", async () => {
  66  |   test.skip(!groupId, "No groupId available");
  67  | 
  68  |   const groupRes = await api.get(`/api/groups/${groupId}`);
  69  |   const { group } = await groupRes.json();
  70  | 
  71  |   const res = await api.post("/api/groups/join", {
  72  |     data: { invite_code: group.invite_code },
  73  |   });
  74  | 
  75  |   expect(res.status()).toBe(409);
  76  |   const body = await res.json();
  77  |   expect(body.error).toMatch(/already a member/i);
  78  | });
  79  | 
  80  | test("3a. POST /api/groups/join — returns 404 for an invalid invite code", async () => {
  81  |   const res = await api.post("/api/groups/join", {
  82  |     data: { invite_code: "INVALID0" },
  83  |   });
  84  | 
> 85  |   expect(res.status()).toBe(404);
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
  86  |   const body = await res.json();
  87  |   expect(body.error).toMatch(/no group found/i);
  88  | });
  89  | 
  90  | // ---------------------------------------------------------------------------
  91  | // Books
  92  | // ---------------------------------------------------------------------------
  93  | 
  94  | test("4. POST /api/groups/:id/books — adds a book and returns its id", async () => {
  95  |   test.skip(!groupId, "No groupId available");
  96  | 
  97  |   const res = await api.post(`/api/groups/${groupId}/books`, {
  98  |     data: {
  99  |       title: "Dune",
  100 |       author: "Frank Herbert",
  101 |       total_chapters: 48,
  102 |     },
  103 |   });
  104 | 
  105 |   expect(res.status()).toBe(201);
  106 | 
  107 |   const body = await res.json();
  108 |   expect(body).toHaveProperty("bookId");
  109 |   expect(body.bookId).toMatch(
  110 |     /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  111 |   );
  112 | 
  113 |   bookId = body.bookId;
  114 | });
  115 | 
  116 | test("4a. POST /api/groups/:id/books — returns 400 when title is missing", async () => {
  117 |   test.skip(!groupId, "No groupId available");
  118 | 
  119 |   const res = await api.post(`/api/groups/${groupId}/books`, {
  120 |     data: { author: "Frank Herbert" },
  121 |   });
  122 | 
  123 |   expect(res.status()).toBe(400);
  124 |   const body = await res.json();
  125 |   expect(body.error).toMatch(/title is required/i);
  126 | });
  127 | 
  128 | test("5. GET /api/groups/:id/books — lists books in the group", async () => {
  129 |   test.skip(!groupId, "No groupId available");
  130 | 
  131 |   const res = await api.get(`/api/groups/${groupId}/books`);
  132 | 
  133 |   expect(res.status()).toBe(200);
  134 | 
  135 |   const body = await res.json();
  136 |   expect(body).toHaveProperty("books");
  137 |   expect(Array.isArray(body.books)).toBe(true);
  138 | 
  139 |   if (bookId) {
  140 |     const found = body.books.find((b: { id: string }) => b.id === bookId);
  141 |     expect(found).toBeDefined();
  142 |     expect(found.title).toBe("Dune");
  143 |   }
  144 | });
  145 | 
  146 | // ---------------------------------------------------------------------------
  147 | // Group-level messages
  148 | // ---------------------------------------------------------------------------
  149 | 
  150 | test("6. POST /api/groups/:id/messages — posts a group-level message", async () => {
  151 |   test.skip(!groupId, "No groupId available");
  152 | 
  153 |   const res = await api.post(`/api/groups/${groupId}/messages`, {
  154 |     data: { content: "Welcome everyone to the club!" },
  155 |   });
  156 | 
  157 |   expect(res.status()).toBe(201);
  158 |   const body = await res.json();
  159 |   expect(body).toHaveProperty("messageId");
  160 | });
  161 | 
  162 | test("6a. POST /api/groups/:id/messages — returns 400 when content is empty", async () => {
  163 |   test.skip(!groupId, "No groupId available");
  164 | 
  165 |   const res = await api.post(`/api/groups/${groupId}/messages`, {
  166 |     data: { content: "   " },
  167 |   });
  168 | 
  169 |   expect(res.status()).toBe(400);
  170 | });
  171 | 
  172 | test("7. GET /api/groups/:id/messages — returns group-level messages with null book_id", async () => {
  173 |   test.skip(!groupId, "No groupId available");
  174 | 
  175 |   const res = await api.get(`/api/groups/${groupId}/messages`);
  176 | 
  177 |   expect(res.status()).toBe(200);
  178 | 
  179 |   const body = await res.json();
  180 |   expect(body).toHaveProperty("messages");
  181 |   expect(Array.isArray(body.messages)).toBe(true);
  182 | 
  183 |   for (const msg of body.messages) {
  184 |     expect(msg.book_id).toBeNull();
  185 |     expect(msg).toHaveProperty("content");
```