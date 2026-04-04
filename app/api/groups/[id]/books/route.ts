import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listBooksForGroup, addBookToGroup } from "@/lib/services/books";

/**
 * GET /api/groups/[id]/books — list all books in the group
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

  const result = await listBooksForGroup(supabase, user.id, groupId);

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ books: result.books });
}

/**
 * POST /api/groups/[id]/books — add a book to the group
 * Body: { title: string, author?: string, total_chapters?: number }
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
  const title = (body?.title as string | undefined)?.trim();

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  const result = await addBookToGroup(
    supabase,
    user.id,
    groupId,
    title,
    body?.author,
    body?.total_chapters
  );

  if (!result.ok) {
    const status = result.kind === "not_member" ? 403 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ bookId: result.bookId }, { status: 201 });
}