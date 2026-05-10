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

/**
 * Create a private chat room for a subset of group members for a specific book.
 *
 * Validates:
 *  1. The requesting user is a member of the group.
 *  2. All supplied user IDs are members of the group.
 *  3. No existing private_chat_room for this book has the exact same member set.
 *
 * Writes:
 *  1. Insert into private_chat_rooms.
 *  2. Bulk insert into private_chat_members.
 */
export async function createPrivateChatRoom(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  bookId: string,
  groupId: string,
  memberUserIds: string[],
  groupName?: string | null
): Promise<CreatePrivateRoomResult> {
  // Deduplicate and ensure the requesting user is included
  const uniqueIds = [...new Set([requestingUserId, ...memberUserIds])];

  if (uniqueIds.length < 2) {
    return {
      ok: false,
      kind: "too_few_members",
      message: "A private group must have at least 2 members.",
    };
  }

  // 1. Fetch all members of the group
  const { data: groupMembers, error: membershipError } = await client
    .from("memberships")
    .select("user_id")
    .eq("group_id", groupId);

  if (membershipError) {
    return { ok: false, kind: "error", message: membershipError.message };
  }

  const groupMemberIds = new Set((groupMembers ?? []).map((m) => m.user_id));

  // Verify requesting user is a group member
  if (!groupMemberIds.has(requestingUserId)) {
    return {
      ok: false,
      kind: "not_member",
      message: "You are not a member of this group.",
    };
  }

  // Verify all supplied IDs are group members
  const nonMembers = uniqueIds.filter((id) => !groupMemberIds.has(id));
  if (nonMembers.length > 0) {
    return {
      ok: false,
      kind: "non_members_included",
      message: "One or more selected users are not members of this group.",
    };
  }

  // 2. Check for duplicate room: fetch all rooms for this book with their members
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

  // 3. Insert the room
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

  // 4. Insert members
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

/**
 * Return all private chat rooms for a given book that the requesting user belongs to,
 * including each room's members with usernames.
 */
export async function listPrivateRoomsForBook(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  bookId: string,
  groupId: string
): Promise<ListPrivateRoomsResult> {
  // Confirm group membership
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

  // Get the rooms this user belongs to for this book
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

  // Fetch the rooms with all their members
  const { data: rooms, error: roomsError } = await client
    .from("private_chat_rooms")
    .select("id, book_id, group_name, created_at, private_chat_members(user_id)")
    .eq("book_id", bookId)
    .in("id", myRoomIds)
    .order("created_at", { ascending: true });

  if (roomsError) {
    return { ok: false, kind: "error", message: roomsError.message };
  }

  // Batch-fetch usernames for all members
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

/**
 * Return all messages for a private chat room, oldest first.
 * Validates that the requesting user is a member of the room.
 */
export async function getPrivateMessages(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  roomId: string
): Promise<GetPrivateMessagesResult> {
  // Verify room membership
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
    .select("id, room_id, sender_id, content, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, kind: "error", message: error.message };
  }

  // Batch-fetch sender usernames
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

/**
 * Post a message to a private chat room.
 * Validates that the requesting user is a member of the room.
 */
export async function postPrivateMessage(
  client: SupabaseClient<Database>,
  requestingUserId: string,
  roomId: string,
  content: string
): Promise<PostPrivateMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      ok: false,
      kind: "empty_content",
      message: "Message content cannot be empty.",
    };
  }

  // Verify room membership
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
    .insert({ room_id: roomId, sender_id: requestingUserId, content: trimmed })
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