import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getPrivateMessages,
  postPrivateMessage,
} from "@/lib/services/privateChats";

/**
 * GET /api/private-rooms/[id]/messages
 * Returns all messages for a private chat room.
 * The requesting user must be a member of the room.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getPrivateMessages(supabase, user.id, roomId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messages: result.messages });
}

/**
 * POST /api/private-rooms/[id]/messages
 * Post a message to a private chat room.
 * Body: { content: string, spoiler_chapter?: number | null }
 * The requesting user must be a member of the room.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { content?: string; spoiler_chapter?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content = (body?.content as string | undefined)?.trim();
  if (!content) {
    return NextResponse.json(
      { error: "content is required." },
      { status: 400 }
    );
  }

  // Parse optional spoiler_chapter — must be a positive number if provided
  let spoilerChapter: number | null = null;
  if (body?.spoiler_chapter !== undefined && body?.spoiler_chapter !== null) {
    const parsed = Number(body.spoiler_chapter);
    if (!isNaN(parsed) && parsed > 0) {
      spoilerChapter = parsed;
    }
  }

  const result = await postPrivateMessage(
    supabase,
    user.id,
    roomId,
    content,
    spoilerChapter,
  );

  if (!result.ok) {
    const status =
      result.kind === "not_member"
        ? 403
        : result.kind === "empty_content"
        ? 400
        : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}