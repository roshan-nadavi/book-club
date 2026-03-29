import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGroupForMember } from "@/lib/services/groups";

/**
 * GET /api/groups/[id] — group details if the signed-in user is a member.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getGroupForMember(supabase, user.id, id);

  if (!result.ok) {
    if (result.kind === "error") {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ group: result.group });
}
