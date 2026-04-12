import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBookMessages, postMessage } from "@/lib/services/discussions";

/**
 * GET /api/books/[id]/messages
 * Returns all messages for a specific book.
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

  const result = await getBookMessages(supabase, user.id, groupId, bookId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messages: result.messages });
}

/**
 * POST /api/books/[id]/messages
 * Posts a message on a specific book.
 * Body: { group_id: string, content: string }
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

  const body = await request.json();
  const groupId = (body?.group_id as string | undefined)?.trim();
  const content = (body?.content as string | undefined)?.trim();

  if (!groupId) {
    return NextResponse.json({ error: "group_id is required." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const result = await postMessage(supabase, user.id, groupId, content, bookId);

  if (!result.ok) {
    const status =
      result.kind === "not_member"      ? 403
      : result.kind === "empty_content" ? 400
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}