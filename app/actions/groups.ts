"use server";

import { createClient } from "@/lib/supabase/server";
import { createGroupWithMembership } from "@/lib/services/groups";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createGroup(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    redirect("/?error=" + encodeURIComponent("Group name is required."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const result = await createGroupWithMembership(supabase, user.id, name);

  if (!result.ok) {
    redirect("/?error=" + encodeURIComponent(result.message));
  }

  revalidatePath("/");
  redirect("/");
}
