"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Member = {
  user_id: string;
  username: string | null;
};

type PrivateRoom = {
  id: string;
  book_id: string;
  group_name: string | null;
  created_at: string;
  members: Member[];
};

type PrivateMessage = {
  id: string;
  room_id: string;
  sender_id: string | null;
  sender_username: string | null;
  content: string;
  created_at: string;
  spoiler_chapter: number | null;
};

interface Props {
  bookId: string;
  groupId: string;
  currentUserId: string;
  currentUserUsername: string;
  myCurrentChapter: number | null;
  totalChapters: number | null;
  initialRooms: PrivateRoom[];
  allGroupMembers: { user_id: string; username: string }[];
}

// ---------------------------------------------------------------------------
// Helper: member preview text
// ---------------------------------------------------------------------------

function memberPreview(members: Member[], max = 5): string {
  const names = members.map((m) => m.username ?? "Unknown").slice(0, max).join(", ");
  const extra = members.length - max;
  if (extra > 0) return `${names} +${extra} more`;
  return names;
}

// ---------------------------------------------------------------------------
// SpoilerMessage
// ---------------------------------------------------------------------------

function SpoilerMessage({
  msg,
  isOwn,
  myCurrentChapter,
  senderLabel,
  formattedTime,
}: {
  msg: PrivateMessage;
  isOwn: boolean;
  myCurrentChapter: number | null;
  senderLabel: string;
  formattedTime: string;
}) {
  const isLocked =
    msg.spoiler_chapter !== null &&
    (myCurrentChapter === null || myCurrentChapter < msg.spoiler_chapter);

  return (
    <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium truncate max-w-[180px]">
          {senderLabel}
        </span>
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          {formattedTime}
        </span>
        {msg.spoiler_chapter !== null && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              isLocked
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            }`}
          >
            Ch.{msg.spoiler_chapter}+
          </span>
        )}
      </div>

      {isLocked ? (
        <div
          className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed flex items-center gap-2 select-none ${
            isOwn ? "rounded-tr-sm" : "rounded-tl-sm"
          } bg-neutral-100 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-600`}
        >
          <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span className="text-neutral-400 dark:text-neutral-500 italic text-xs">
            Locked until chapter {msg.spoiler_chapter}
          </span>
        </div>
      ) : (
        <div
          className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isOwn
              ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 rounded-tr-sm"
              : "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700 rounded-tl-sm"
          }`}
        >
          {msg.content}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 4000;

export default function PrivateConversationsView({
  bookId,
  groupId,
  currentUserId,
  currentUserUsername,
  myCurrentChapter,
  totalChapters,
  initialRooms,
  allGroupMembers,
}: Props) {
  // ── Split panel ───────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState(32);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Rooms & messages ──────────────────────────────────────
  const [rooms, setRooms] = useState<PrivateRoom[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll tracking
  const isAtBottomRef = useRef(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Stable ref to latest message ID for polling — keyed by room ID
  const latestMessageIdRef = useRef<string | null>(null);

  // ── Spoiler compose state ─────────────────────────────────
  const [spoilerEnabled, setSpoilerEnabled] = useState(false);
  const [spoilerChapter, setSpoilerChapter] = useState<string>("");

  // ── Modals ────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);

  // ── Create group form state ───────────────────────────────
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Auto-scroll ───────────────────────────────────────────
  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scrollToBottomIfNeeded() {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages]);

  // ── Polling — restarts whenever the selected room changes ─

  useEffect(() => {
    if (!selectedRoomId) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/private-rooms/${selectedRoomId}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        const fetched: PrivateMessage[] = data.messages ?? [];
        if (fetched.length === 0) return;

        const newestId = fetched[fetched.length - 1].id;
        if (newestId !== latestMessageIdRef.current) {
          latestMessageIdRef.current = newestId;
          setMessages(fetched);
        }
      } catch {
        // Network blip — silently ignore
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [selectedRoomId]);

  // ── Resizable divider ─────────────────────────────────────
  const onMouseDown = useCallback(() => setIsDragging(true), []);
  const onTouchStart = useCallback(() => setIsDragging(true), []);

  useEffect(() => {
    if (!isDragging) return;
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, 20), 60));
    }
    function onMouseUp() { setIsDragging(false); }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [isDragging]);

  useEffect(() => {
    if (!isDragging) return;
    function onTouchMove(e: TouchEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, 20), 60));
    }
    function onTouchEnd() { setIsDragging(false); }
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => { window.removeEventListener("touchmove", onTouchMove); window.removeEventListener("touchend", onTouchEnd); };
  }, [isDragging]);

  // ── Select room & load messages ───────────────────────────
  async function selectRoom(roomId: string) {
    if (roomId === selectedRoomId) return;
    setSelectedRoomId(roomId);
    setMessages([]);
    latestMessageIdRef.current = null;
    setLoadingMessages(true);
    setSpoilerEnabled(false);
    setSpoilerChapter("");

    const res = await fetch(`/api/private-rooms/${roomId}/messages`);
    if (res.ok) {
      const data = await res.json();
      const fetched: PrivateMessage[] = data.messages ?? [];
      setMessages(fetched);
      if (fetched.length > 0) {
        latestMessageIdRef.current = fetched[fetched.length - 1].id;
      }
    }
    setLoadingMessages(false);
  }

  // ── Send message ──────────────────────────────────────────
  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = messageContent.trim();
    if (!content || !selectedRoomId) return;
    setSending(true);

    const spoilerChapterValue =
      spoilerEnabled && spoilerChapter !== "" ? Number(spoilerChapter) : null;

    const res = await fetch(`/api/private-rooms/${selectedRoomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, spoiler_chapter: spoilerChapterValue }),
    });

    if (res.ok) {
      const data = await res.json();
      const newMsg: PrivateMessage = {
        id: data.messageId,
        room_id: selectedRoomId,
        sender_id: currentUserId,
        sender_username: currentUserUsername,
        content,
        created_at: new Date().toISOString(),
        spoiler_chapter: spoilerChapterValue,
      };
      setMessages((prev) => {
        const updated = [...prev, newMsg];
        latestMessageIdRef.current = data.messageId;
        return updated;
      });
      isAtBottomRef.current = true;
      setMessageContent("");
      setSpoilerEnabled(false);
      setSpoilerChapter("");
    }

    setSending(false);
  }

  // ── Create private group ──────────────────────────────────
  function openCreateModal() {
    setNewGroupName("");
    setSelectedMemberIds(new Set([currentUserId]));
    setCreateError(null);
    setShowCreateModal(true);
  }

  function toggleMember(userId: string) {
    if (userId === currentUserId) return;
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    const res = await fetch(`/api/books/${bookId}/private-rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: groupId,
        member_ids: [...selectedMemberIds],
        group_name: newGroupName.trim() || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setCreateError(data.error ?? "Failed to create group.");
      setCreating(false);
      return;
    }

    const newMembers: Member[] = [...selectedMemberIds].map((uid) => {
      const found = allGroupMembers.find((m) => m.user_id === uid);
      return { user_id: uid, username: found?.username ?? null };
    });

    const newRoom: PrivateRoom = {
      id: data.roomId,
      book_id: bookId,
      group_name: newGroupName.trim() || null,
      created_at: new Date().toISOString(),
      members: newMembers,
    };

    setRooms((prev) => [...prev, newRoom]);
    setCreating(false);
    setShowCreateModal(false);
    await selectRoom(data.roomId);
  }

  // ── Derived ───────────────────────────────────────────────
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  const maxChapter = totalChapters ?? 100;
  const chapterOptions = Array.from({ length: maxChapter }, (_, i) => i + 1);

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden"
        style={{ userSelect: isDragging ? "none" : undefined }}
      >
        {/* ── LEFT PANEL — Room List ─────────────────────── */}
        <div
          className="flex flex-col overflow-hidden border-r border-neutral-200 bg-background"
          style={{ width: `${leftWidth}%` }}
        >
          <div className="shrink-0 px-3 py-3 border-b border-neutral-200 bg-surface flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Private Groups
            </h2>
            <button
              onClick={openCreateModal}
              className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition whitespace-nowrap"
            >
              + Create New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rooms.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-neutral-400 dark:text-neutral-500">No private groups yet.</p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-600">Create one to start a private conversation.</p>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rooms.map((room) => {
                  const isSelected = room.id === selectedRoomId;
                  const title = room.group_name ?? memberPreview(room.members.filter((m) => m.user_id !== currentUserId), 2);
                  return (
                    <li key={room.id}>
                      <button
                        onClick={() => selectRoom(room.id)}
                        className={`w-full text-left px-4 py-3 transition flex flex-col gap-1.5 ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-500"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800 border-l-2 border-transparent"
                        }`}
                      >
                        <span className="text-sm font-semibold leading-snug truncate block text-black">{title}</span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 leading-snug line-clamp-2">
                          {memberPreview(room.members, 5)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── DIVIDER ───────────────────────────────────── */}
        <div
          className={`relative shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group ${
            isDragging
              ? "bg-neutral-400 dark:bg-neutral-500"
              : "bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          } transition-colors`}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="flex flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-0.5 h-4 rounded-full bg-neutral-400 dark:bg-neutral-600 group-hover:bg-neutral-500 dark:group-hover:bg-neutral-500 transition-colors" />
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL — Messages ────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden bg-background">
          {selectedRoom ? (
            <>
              <div className="shrink-0 px-4 py-3 border-b border-neutral-200 bg-surface flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Discussion</h2>
                  {selectedRoom.group_name && (
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate mt-0.5">{selectedRoom.group_name}</p>
                  )}
                </div>
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="shrink-0 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
                >
                  View all members
                </button>
              </div>

              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              >
                {loadingMessages && (
                  <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">Loading…</p>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">No messages yet. Say something!</p>
                )}
                {messages.map((msg) => {
                  const isOwn = msg.sender_id === currentUserId;
                  const senderLabel = isOwn ? currentUserUsername : (msg.sender_username ?? "Unknown");
                  return (
                    <SpoilerMessage
                      key={msg.id}
                      msg={msg}
                      isOwn={isOwn}
                      myCurrentChapter={myCurrentChapter}
                      senderLabel={senderLabel}
                      formattedTime={formatTime(msg.created_at)}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Compose area ─────────────────────────── */}
              <div className="shrink-0 border-t border-neutral-200 bg-background px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { const next = !spoilerEnabled; setSpoilerEnabled(next); if (!next) setSpoilerChapter(""); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                      spoilerEnabled
                        ? "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300"
                        : "bg-white border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      {spoilerEnabled ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      )}
                    </svg>
                    Spoiler
                  </button>

                  {spoilerEnabled && (
                    <>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">lock until ch.</span>
                      <select
                        value={spoilerChapter}
                        onChange={(e) => setSpoilerChapter(e.target.value)}
                        className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="">pick chapter…</option>
                        {chapterOptions.map((ch) => (
                          <option key={ch} value={ch}>{ch}</option>
                        ))}
                      </select>
                      {spoilerChapter !== "" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          Ch.{spoilerChapter}+
                        </span>
                      )}
                    </>
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder={spoilerEnabled && spoilerChapter !== "" ? `Spoiler message (ch. ${spoilerChapter}+)…` : "Write a message…"}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 transition dark:text-neutral-100 ${
                      spoilerEnabled && spoilerChapter !== ""
                        ? "border-amber-300 bg-amber-50 focus:ring-amber-400 dark:border-amber-700 dark:bg-amber-950/30 text-neutral-900"
                        : "border-neutral-300 bg-neutral-50 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 text-neutral-900 dark:focus:ring-neutral-100"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageContent.trim() || (spoilerEnabled && spoilerChapter === "")}
                    title={spoilerEnabled && spoilerChapter === "" ? "Pick a chapter for the spoiler gate first" : undefined}
                    className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                  >
                    Send
                  </button>
                </form>

                {spoilerEnabled && spoilerChapter === "" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">Select a chapter above to enable the spoiler gate.</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center px-6">
                <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Select a group to start chatting</p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">Or create a new private group from the left panel.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CREATE GROUP MODAL ──────────────────────────── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-sm flex flex-col max-h-[80vh]">
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">New Private Group</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="flex flex-col flex-1 min-h-0">
              <div className="px-5 pb-3">
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Group Title <span className="font-normal text-neutral-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Spoiler Chat"
                  maxLength={80}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="px-5 pb-2">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Members</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-3">
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                  {allGroupMembers.map((member) => {
                    const isMe = member.user_id === currentUserId;
                    const isChecked = selectedMemberIds.has(member.user_id);
                    return (
                      <li key={member.user_id}>
                        <label className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${isMe ? "opacity-60 cursor-default" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMember(member.user_id)}
                            disabled={isMe}
                            className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                            {member.username}
                            {isMe && <span className="ml-1 text-xs text-neutral-400">(you)</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {createError && (
                <div className="mx-5 mb-3">
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-2 py-1.5">{createError}</p>
                </div>
              )}

              <div className="shrink-0 px-5 pb-5 flex gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition">
                  Cancel
                </button>
                <button type="submit" disabled={creating || selectedMemberIds.size < 2} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── VIEW ALL MEMBERS MODAL ──────────────────────── */}
      {showMembersModal && selectedRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMembersModal(false); }}
        >
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs flex flex-col max-h-[70vh]">
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Members
                <span className="ml-2 text-xs font-normal text-neutral-400">({selectedRoom.members.length})</span>
              </h3>
              <button onClick={() => setShowMembersModal(false)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 px-2 py-2">
              {selectedRoom.members.map((member) => {
                const isMe = member.user_id === currentUserId;
                return (
                  <li key={member.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase">{(member.username ?? "?")[0]}</span>
                    </div>
                    <span className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                      {member.username ?? "Unknown"}
                      {isMe && <span className="ml-1 text-xs text-neutral-400">(you)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}