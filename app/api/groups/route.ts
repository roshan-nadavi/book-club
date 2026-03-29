import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listGroupsForUser } from "@/lib/services/groups";

/**
 * GET /api/groups — groups the signed-in user belongs to.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groups, error } = await listGroupsForUser(supabase, user.id);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ groups });
}
