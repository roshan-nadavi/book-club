import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteBook } from "@/lib/services/books";

/**
 * DELETE /api/groups/[id]/books/[bookId] — remove a book (admin only)
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; bookId: string }> }
) {
  const { id: groupId, bookId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteBook(supabase, user.id, groupId, bookId);

  if (!result.ok) {
    const status =
      result.kind === "not_found" ? 404
      : result.kind === "not_admin" ? 403
      : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}