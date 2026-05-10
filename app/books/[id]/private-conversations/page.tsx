import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/auth/LogoutButton";
import PrivateConversationsView from "@/components/books/PrivateConversationsView";

export default async function PrivateConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the book
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, group_id, title, author, total_chapters, created_at")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    notFound();
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("group_id", book.group_id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  // Fetch group info, all group members, current user profile, and private rooms in parallel
  const [
    { data: group },
    { data: membershipRows },
    { data: currentProfile },
    { data: privateRoomRows },
  ] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", book.group_id)
      .single(),
    supabase
      .from("memberships")
      .select("user_id")
      .eq("group_id", book.group_id),
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single(),
    // Fetch private rooms for this book that the user belongs to
    supabase
      .from("private_chat_members")
      .select("room_id")
      .eq("user_id", user.id),
  ]);

  // Fetch all group member profiles for the "create group" form
  const memberUserIds = (membershipRows ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, username")
        .in("id", memberUserIds)
    : { data: [] };

  const allGroupMembers = (memberProfiles ?? []).map((p) => ({
    user_id: p.id,
    username: p.username ?? p.id,
  }));

  // Fetch private rooms for this book
  const myRoomIds = (privateRoomRows ?? []).map((r) => r.room_id);

  let privateRooms: {
    id: string;
    book_id: string;
    group_name: string | null;
    created_at: string;
    members: { user_id: string; username: string | null }[];
  }[] = [];

  if (myRoomIds.length > 0) {
    const { data: rooms } = await supabase
      .from("private_chat_rooms")
      .select("id, book_id, group_name, created_at, private_chat_members(user_id)")
      .eq("book_id", bookId)
      .in("id", myRoomIds)
      .order("created_at", { ascending: true });

    if (rooms && rooms.length > 0) {
      // Batch-fetch usernames
      const allMemberIds = [
        ...new Set(
          rooms.flatMap((r) =>
            (r.private_chat_members as { user_id: string }[]).map(
              (m) => m.user_id
            )
          )
        ),
      ];

      const { data: profileRows } = allMemberIds.length
        ? await supabase
            .from("profiles")
            .select("id, username")
            .in("id", allMemberIds)
        : { data: [] };

      const usernameMap = Object.fromEntries(
        (profileRows ?? []).map((p) => [p.id, p.username ?? null])
      );

      privateRooms = rooms.map((room) => ({
        id: room.id,
        book_id: room.book_id,
        group_name: room.group_name,
        created_at: room.created_at,
        members: (room.private_chat_members as { user_id: string }[]).map(
          (m) => ({
            user_id: m.user_id,
            username: usernameMap[m.user_id] ?? null,
          })
        ),
      }));
    }
  }

  const currentUserUsername =
    currentProfile?.username ?? user.email ?? user.id;

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/groups/${book.group_id}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition"
            >
              ← {group?.name ?? "Group"}
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <Link
              href={`/books/${bookId}`}
              className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition truncate"
            >
              {book.title}
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Private Conversations
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <PrivateConversationsView
        bookId={bookId}
        groupId={book.group_id}
        currentUserId={user.id}
        currentUserUsername={currentUserUsername}
        initialRooms={privateRooms}
        allGroupMembers={allGroupMembers}
      />
    </div>
  );
}