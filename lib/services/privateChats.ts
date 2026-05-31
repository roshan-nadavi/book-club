import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrivateChatMember = {
  user_id: string;
  username: string | null;
};

export type PrivateChatRoom = {
  id: string;
  book_id: string;
  group_name: string | null;
  created_at: string;
  members: PrivateChatMember[];
};

export type PrivateMessage = {
  id: string;
  room_id: string;
  sender_id: string | null;
  sender_username: string | null;
  content: string;
  created_at: string;
  spoiler_chapter: number | null;
};

// ---------------------------------------------------------------------------
// Create a private chat room
// ---------------------------------------------------------------------------

export type CreatePrivateRoomResult =
  | { ok: true; roomId: string }
  | {
      ok: false;
      kind:
        | "not_member"
        | "non_members_included"
        | "room_exists"
        | "too_few_members"
        | "error";
      message: string;
    };

export async function createPrivateChatRoom(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  bookId: string,
  groupId: string,
  memberUserIds: string[],
  groupName?: string | null
): Promise<CreatePrivateRoomResult> {
  const uniqueIds = [...new Set([requestingUserId, ...memberUserIds])];

  if (uniqueIds.length < 2) {
    return {
      ok: false,
      kind: "too_few_members",
      message: "A private group must have at least 2 members.",
    };
  }

  const { data: groupMembers, error: membershipError } = await client
    .from("memberships")
    .select("user_id")
    .eq("group_id", groupId);

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }

  const groupMemberIds = new Set((groupMembers ?? []).map((m) => m.user_id));

  if (!groupMemberIds.has(requestingUserId)) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this group.",
    };
  }

  const nonMembers = uniqueIds.filter((id) => !groupMemberIds.has(id));
  if (nonMembers.length > 0) {
    return {
      ok: false,
      kind: "non_members_included",
      message: "One or more selected users are not members of this group.",
    };
  }

  const { data: existingRooms, error: roomsError } = await client
    .from("private_chat_rooms")
    .select("id, private_chat_members(user_id)")
    .eq("book_id", bookId);

  if (roomsError) {
    return { ok: false, kind: "error", message: roomsError.message };
  }

  const sortedNew = [...uniqueIds].sort();

  for (const room of existingRooms ?? []) {
    const members = (room.private_chat_members as { user_id: string }[]).map(
      (m) => m.user_id
    );
    const sortedExisting = [...members].sort();
    if (
      sortedExisting.length === sortedNew.length &&
      sortedExisting.every((id, i) => id === sortedNew[i])
    ) {
      return {
        ok: false,
        kind: "room_exists",
        message:
          "A private group with exactly these members already exists for this book.",
      };
    }
  }

  const { data: room, error: insertRoomError } = await client
    .from("private_chat_rooms")
    .insert({ book_id: bookId, group_name: groupName ?? null })
    .select("id")
    .single();

  if (insertRoomError || !room) {
    return {
      ok: false,
      kind: "error",
      message: insertRoomError?.message ?? "Could not create private room.",
    };
  }

  const memberRows = uniqueIds.map((uid) => ({
    room_id: room.id,
    user_id: uid,
  }));

  const { error: insertMembersError } = await client
    .from("private_chat_members")
    .insert(memberRows);

  if (insertMembersError) {
    return { ok: false, kind: "error", message: insertMembersError.message };
  }

  return { ok: true, roomId: room.id };
}

// ---------------------------------------------------------------------------
// List private chat rooms for a user on a specific book
// ---------------------------------------------------------------------------

export type ListPrivateRoomsResult =
  | { ok: true; rooms: PrivateChatRoom[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

export async function listPrivateRoomsForBook(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  bookId: string,
  groupId: string
): Promise<ListPrivateRoomsResult> {
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", requestingUserId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this group.",
    };
  }

  const { data: myRoomRows, error: myRoomsError } = await client
    .from("private_chat_members")
    .select("room_id")
    .eq("user_id", requestingUserId);

  if (myRoomsError) {
    return { ok: false, kind: "error", message: myRoomsError.message };
  }

  const myRoomIds = (myRoomRows ?? []).map((r) => r.room_id);

  if (myRoomIds.length === 0) {
    return { ok: true, rooms: [] };
  }

  const { data: rooms, error: roomsError } = await client
    .from("private_chat_rooms")
    .select("id, book_id, group_name, created_at, private_chat_members(user_id)")
    .eq("book_id", bookId)
    .in("id", myRoomIds)
    .order("created_at", { ascending: true });

  if (roomsError) {
    return { ok: false, kind: "error", message: roomsError.message };
  }

  const allUserIds = [
    ...new Set(
      (rooms ?? []).flatMap((r) =>
        (r.private_chat_members as { user_id: string }[]).map((m) => m.user_id)
      )
    ),
  ];

  const { data: profileRows } = allUserIds.length
    ? await client
        .from("profiles")
        .select("id, username")
        .in("id", allUserIds)
    : { data: [] };

  const usernameMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.username ?? null])
  );

  const result: PrivateChatRoom[] = (rooms ?? []).map((room) => ({
    id: room.id,
    book_id: room.book_id,
    group_name: room.group_name,
    created_at: room.created_at,
    members: (room.private_chat_members as { user_id: string }[]).map((m) => ({
      user_id: m.user_id,
      username: usernameMap[m.user_id] ?? null,
    })),
  }));

  return { ok: true, rooms: result };
}

// ---------------------------------------------------------------------------
// Get messages for a private chat room
// ---------------------------------------------------------------------------

export type GetPrivateMessagesResult =
  | { ok: true; messages: PrivateMessage[] }
  | { ok: false; kind: "not_member" | "error"; message: string };

export async function getPrivateMessages(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  roomId: string
): Promise<GetPrivateMessagesResult> {
  const { data: membership, error: membershipError } = await client
    .from("private_chat_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("user_id", requestingUserId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this private group.",
    };
  }

  const { data, error } = await client
    .from("private_messages")
    .select("id, room_id, sender_id, content, created_at, spoiler_chapter")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }

  const senderIds = [
    ...new Set(
      (data ?? []).map((m) => m.sender_id).filter(Boolean) as string[]
    ),
  ];

  const { data: profileRows } = senderIds.length
    ? await client
        .from("profiles")
        .select("id, username")
        .in("id", senderIds)
    : { data: [] };

  const usernameMap = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.username ?? null])
  );

  const messages: PrivateMessage[] = (data ?? []).map((m) => ({
    id: m.id,
    room_id: m.room_id,
    sender_id: m.sender_id,
    sender_username: m.sender_id ? (usernameMap[m.sender_id] ?? null) : null,
    content: m.content,
    created_at: m.created_at,
    spoiler_chapter: m.spoiler_chapter ?? null,
  }));

  return { ok: true, messages };
}

// ---------------------------------------------------------------------------
// Post a message to a private chat room
// ---------------------------------------------------------------------------

export type PostPrivateMessageResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      kind: "not_member" | "empty_content" | "error";
      message: string;
    };

export async function postPrivateMessage(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  roomId: string,
  content: string,
  spoilerChapter?: number | null,
): Promise<PostPrivateMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      ok: false,
      kind: "empty_content",
      message: "Message content cannot be empty.",
    };
  }

  const { data: membership, error: membershipError } = await client
    .from("private_chat_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("user_id", requestingUserId)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this private group.",
    };
  }

  const { data, error } = await client
    .from("private_messages")
    .insert({
      room_id: roomId,
      sender_id: requestingUserId,
      content: trimmed,
      spoiler_chapter: spoilerChapter ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      kind: "error",
      message: error?.message ?? "Could not send message.",
    };
  }

  return { ok: true, messageId: data.id };
}

// ---------------------------------------------------------------------------
// Fetch all data needed to render the private conversations page
// ---------------------------------------------------------------------------

export type GroupMemberSummary = {
  user_id: string;
  username: string;
};

export type PrivateConversationsPageData = {
  book: {
    id: string;
    group_id: string;
    title: string;
    author: string | null;
    total_chapters: number | null;
    created_at: string;
  };
  groupName: string;
  currentUserUsername: string;
  myCurrentChapter: number | null;
  allGroupMembers: GroupMemberSummary[];
  privateRooms: PrivateChatRoom[];
};

export type GetPrivateConversationsPageDataResult =
  | { ok: true; data: PrivateConversationsPageData }
  | { ok: false; kind: "not_found" | "not_member" | "error"; message: string };

export async function getPrivateConversationsPageData(
  client: SupabaseClient<Database>,
  userId: string,
  bookId: string
): Promise<GetPrivateConversationsPageDataResult> {
  // 1. Fetch the book
  const { data: book, error: bookError } = await client
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    return { ok: false, kind: "not_found", message: "Book not found." };
  }

  // 2. Verify membership
  const { data: membership, error: membershipError } = await client
    .from("memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, kind: "not_member", message: "You are not a member of this group." };
  }

  // 3. Parallel: group info, all membership rows, current user profile,
  //    user's room IDs, and current user's reading progress for this book
  const [
    { data: group, error: groupError },
    { data: membershipRows, error: membershipsError },
    { data: currentProfile, error: profileError },
    { data: privateRoomRows, error: privateRoomRowsError },
    { data: myProgressRow, error: progressError },
  ] = await Promise.all([
    client.from("groups").select("id, name").eq("id", book.group_id).single(),
    client.from("memberships").select("user_id").eq("group_id", book.group_id),
    client.from("profiles").select("username").eq("id", userId).single(),
    client.from("private_chat_members").select("room_id").eq("user_id", userId),
    client
      .from("user_book_progress")
      .select("current_chapter")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle(),
  ]);

  if (groupError) {
    return { ok: false, kind: "error", message: groupError.message };
  }
  if (membershipsError) {
    return { ok: false, kind: "error", message: membershipsError.message };
  }
  if (profileError) {
    return { ok: false, kind: "error", message: profileError.message };
  }
  if (privateRoomRowsError) {
    return { ok: false, kind: "error", message: privateRoomRowsError.message };
  }
  if (progressError) {
    return { ok: false, kind: "error", message: progressError.message };
  }

  // 4. Batch-fetch all group member profiles (needed for the create-room form)
  const memberUserIds = (membershipRows ?? []).map((m) => m.user_id);

  const { data: memberProfiles, error: memberProfilesError } = memberUserIds.length
    ? await client.from("profiles").select("id, username").in("id", memberUserIds)
    : { data: [], error: null };

  if (memberProfilesError) {
    return { ok: false, kind: "error", message: memberProfilesError.message };
  }

  const allGroupMembers: GroupMemberSummary[] = (memberProfiles ?? []).map((p) => ({
    user_id: p.id,
    username: p.username ?? p.id,
  }));

  // 5. Fetch private rooms the user belongs to for this book
  const myRoomIds = (privateRoomRows ?? []).map((r) => r.room_id);

  let privateRooms: PrivateChatRoom[] = [];

  if (myRoomIds.length > 0) {
    const { data: rooms, error: roomsError } = await client
      .from("private_chat_rooms")
      .select("id, book_id, group_name, created_at, private_chat_members(user_id)")
      .eq("book_id", bookId)
      .in("id", myRoomIds)
      .order("created_at", { ascending: true });

    if (roomsError) {
      return { ok: false, kind: "error", message: roomsError.message };
    }

    if (rooms && rooms.length > 0) {
      const allMemberIds = [
        ...new Set(
          rooms.flatMap((r) =>
            (r.private_chat_members as { user_id: string }[]).map((m) => m.user_id)
          )
        ),
      ];

      const { data: roomProfileRows, error: roomProfilesError } = allMemberIds.length
        ? await client.from("profiles").select("id, username").in("id", allMemberIds)
        : { data: [], error: null };

      if (roomProfilesError) {
        return { ok: false, kind: "error", message: roomProfilesError.message };
      }

      const usernameMap = Object.fromEntries(
        (roomProfileRows ?? []).map((p) => [p.id, p.username ?? null])
      );

      privateRooms = rooms.map((room) => ({
        id: room.id,
        book_id: room.book_id,
        group_name: room.group_name,
        created_at: room.created_at,
        members: (room.private_chat_members as { user_id: string }[]).map((m) => ({
          user_id: m.user_id,
          username: usernameMap[m.user_id] ?? null,
        })),
      }));
    }
  }

  return {
    ok: true,
    data: {
      book,
      groupName: group?.name ?? "Group",
      currentUserUsername: currentProfile?.username ?? userId,
      myCurrentChapter: myProgressRow?.current_chapter ?? null,
      allGroupMembers,
      privateRooms,
    },
  };
}