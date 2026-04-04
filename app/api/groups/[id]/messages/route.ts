import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGroupMessages, postMessage } from "@/lib/services/discussions";

/**
 * GET /api/groups/[id]/messages — all group-level messages (book_id IS NULL)
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getGroupMessages(supabase, user.id, groupId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messages: result.messages });
}

/**
 * POST /api/groups/[id]/messages — post a group-level message
 * Body: { content: string }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const content = (body?.content as string | undefined)?.trim();

  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  // book_id is null — this is a group-level message
  const result = await postMessage(supabase, user.id, groupId, content, null);

  if (!result.ok) {
    const status =
      result.kind === "not_member"    ? 403
      : result.kind === "empty_content" ? 400
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}