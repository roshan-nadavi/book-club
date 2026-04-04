import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBookProgress, updateBookProgress } from "@/lib/services/progress";

/**
 * GET /api/books/[id]/progress — all members' chapter progress for a book
 */
export async function GET(
  _request: Request,
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

  const result = await getBookProgress(supabase, user.id, bookId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ progress: result.progress });
}

/**
 * PUT /api/books/[id]/progress — update the signed-in user's chapter progress
 * Body: { current_chapter: number }
 */
export async function PUT(
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

  if (body?.current_chapter === undefined || body?.current_chapter === null) {
    return NextResponse.json({ error: "current_chapter is required." }, { status: 400 });
  }

  const result = await updateBookProgress(supabase, user.id, bookId, body.current_chapter);

  if (!result.ok) {
    const status =
      result.kind === "invalid_chapter" ? 400
      : result.kind === "not_member"    ? 403
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}