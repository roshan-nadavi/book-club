import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listPrivateRoomsForBook,
  createPrivateChatRoom,
} from "@/lib/services/privateChats";

/**
 * GET /api/books/[id]/private-rooms
 * Returns all private chat rooms for this book that the signed-in user belongs to.
 * Requires ?group_id=<uuid> as a query parameter.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await context.params;
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");

  if (!groupId) {
    return NextResponse.json(
      { error: "group_id query parameter is required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listPrivateRoomsForBook(
    supabase,
    user.id,
    bookId,
    groupId
  );

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ rooms: result.rooms });
}

/**
 * POST /api/books/[id]/private-rooms
 * Create a new private chat room for a subset of group members.
 * Body: { group_id: string, member_ids: string[], group_name?: string }
 *
 * Validates:
 *  - All supplied member_ids are members of the group.
 *  - No existing room for this book has the exact same member set.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { group_id?: string; member_ids?: string[]; group_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const groupId = (body?.group_id as string | undefined)?.trim();
  if (!groupId) {
    return NextResponse.json(
      { error: "group_id is required." },
      { status: 400 }
    );
  }

  const memberIds = body?.member_ids;
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return NextResponse.json(
      { error: "member_ids must be a non-empty array." },
      { status: 400 }
    );
  }

  const result = await createPrivateChatRoom(
    supabase,
    user.id,
    bookId,
    groupId,
    memberIds,
    body?.group_name ?? null
  );

  if (!result.ok) {
    const status =
      result.kind === "room_exists"
        ? 409
        : result.kind === "not_member" ||
          result.kind === "non_members_included"
        ? 403
        : result.kind === "too_few_members"
        ? 400
        : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ roomId: result.roomId }, { status: 201 });
}