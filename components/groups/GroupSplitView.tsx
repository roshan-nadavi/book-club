"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

type Book = {
  id: string;
  group_id: string;
  title: string;
  author: string | null;
  total_chapters: number | null;
  created_at: string;
};

type Message = {
  id: string;
  group_id: string;
  book_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender_username?: string;
};

type Member = {
  user_id: string;
  username: string | null;
};

interface Props {
  groupId: string;
  adminId: string;
  adminUsername: string;
  currentUserId: string;
  currentUserUsername: string;
  initialInviteCode: string;
  initialBooks: Book[];
  initialMessages: Message[];
}

export default function GroupSplitView({
  groupId,
  adminId,
  currentUserId,
  currentUserUsername,
  initialInviteCode,
  initialBooks,
  initialMessages,
}: Props) {
  const [leftWidth, setLeftWidth] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Books state
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [showAddBook, setShowAddBook] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookChapters, setBookChapters] = useState("");
  const [addingBook, setAddingBook] = useState(false);
  const [addBookError, setAddBookError] = useState<string | null>(null);

  // Delete book state
  const [confirmDeleteBook, setConfirmDeleteBook] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Messages state
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Members state — loaded lazily when either modal is opened
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Modal visibility
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showKickModal, setShowKickModal] = useState(false);

  // Confirm-kick sub-modal
  const [confirmKickTarget, setConfirmKickTarget] = useState<Member | null>(null);
  const [kicking, setKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);

  // Invite code (can update after a successful kick)
  const [inviteCode, setInviteCode] = useState(initialInviteCode);

  const isAdmin = currentUserId === adminId;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Resizable divider ─────────────────────────────────────

  const onMouseDown = useCallback(() => setIsDragging(true), []);

  useEffect(() => {
    if (!isDragging) return;
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, 20), 70));
    }
    function onMouseUp() { setIsDragging(false); }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const onTouchStart = useCallback(() => setIsDragging(true), []);

  useEffect(() => {
    if (!isDragging) return;
    function onTouchMove(e: TouchEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, 20), 70));
    }
    function onTouchEnd() { setIsDragging(false); }
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging]);

  // ── Lazy member fetch ─────────────────────────────────────

  async function loadMembers() {
    if (membersLoaded) return;
    setMembersLoading(true);
    setMembersError(null);

    const res = await fetch(`/api/groups/${groupId}/members`);
    const data = await res.json();

    if (!res.ok) {
      setMembersError(data.error ?? "Failed to load members.");
    } else {
      setMembers(data.members ?? []);
      setMembersLoaded(true);
    }
    setMembersLoading(false);
  }

  // ── Add Book ──────────────────────────────────────────────

  function openAddBook() {
    setBookTitle("");
    setBookAuthor("");
    setBookChapters("");
    setAddBookError(null);
    setShowAddBook(true);
  }

  async function handleAddBook(e: React.FormEvent) {
    e.preventDefault();
    setAddBookError(null);
    setAddingBook(true);

    const res = await fetch(`/api/groups/${groupId}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: bookTitle.trim(),
        author: bookAuthor.trim() || null,
        total_chapters: bookChapters ? Number(bookChapters) : null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setAddBookError(data.error ?? "Failed to add book.");
      setAddingBook(false);
      return;
    }

    setBooks((prev) => [
      ...prev,
      {
        id: data.bookId,
        group_id: groupId,
        title: bookTitle.trim(),
        author: bookAuthor.trim() || null,
        total_chapters: bookChapters ? Number(bookChapters) : null,
        created_at: new Date().toISOString(),
      },
    ]);
    setAddingBook(false);
    setShowAddBook(false);
  }

  // ── Delete Book ───────────────────────────────────────────

  function requestDeleteBook(e: React.MouseEvent, book: Book) {
    // Prevent the Link from navigating when the button is clicked
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setConfirmDeleteBook(book);
  }

  async function confirmDelete() {
    if (!confirmDeleteBook) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(
      `/api/groups/${groupId}/books/${confirmDeleteBook.id}`,
      { method: "DELETE" }
    );

    const data = await res.json();

    if (!res.ok) {
      setDeleteError(data.error ?? "Failed to remove book.");
      setDeleting(false);
      return;
    }

    setBooks((prev) => prev.filter((b) => b.id !== confirmDeleteBook.id));
    setDeleting(false);
    setConfirmDeleteBook(null);
  }

  function cancelDelete() {
    setConfirmDeleteBook(null);
    setDeleteError(null);
  }

  // ── Messages ──────────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = messageContent.trim();
    if (!content) return;
    setSending(true);

    const res = await fetch(`/api/groups/${groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          group_id: groupId,
          book_id: null,
          sender_id: currentUserId,
          content,
          created_at: new Date().toISOString(),
          sender_username: currentUserUsername,
        },
      ]);
      setMessageContent("");
    }

    setSending(false);
  }

  // ── Member modals ─────────────────────────────────────────

  async function openMembersModal() {
    setShowMembersModal(true);
    await loadMembers();
  }

  async function openKickModal() {
    setKickError(null);
    setConfirmKickTarget(null);
    setShowKickModal(true);
    await loadMembers();
  }

  // ── Kick ──────────────────────────────────────────────────

  function requestKick(member: Member) {
    setKickError(null);
    setConfirmKickTarget(member);
  }

  async function confirmKick() {
    if (!confirmKickTarget) return;
    setKicking(true);
    setKickError(null);

    const res = await fetch(`/api/groups/${groupId}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: confirmKickTarget.user_id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setKickError(data.error ?? "Failed to kick member.");
      setKicking(false);
      setConfirmKickTarget(null);
      return;
    }

    setMembers((prev) =>
      prev.filter((m) => m.user_id !== confirmKickTarget.user_id)
    );

    if (data.newInviteCode) {
      setInviteCode(data.newInviteCode);
    }

    setKicking(false);
    setConfirmKickTarget(null);
  }

  function cancelKick() {
    setConfirmKickTarget(null);
  }

  // ── Helpers ───────────────────────────────────────────────

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Suppress unused variable warning — inviteCode is updated after kick
  void inviteCode;

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden"
        style={{ userSelect: isDragging ? "none" : undefined }}
      >
        {/* LEFT PANEL — Books */}
        <div
          className="flex flex-col overflow-hidden border-r border-neutral-200 bg-background"
          style={{ width: `${leftWidth}%` }}
        >
          <div className="shrink-0 px-4 py-3 border-b border-neutral-200 bg-surface">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Books
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {books.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500">
                No books yet. Add one below.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {books.map((book) => (
                  <li key={book.id} className="relative group">
                    <Link
                      href={`/books/${book.id}`}
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                    >
                      {/* Title row — add right padding when admin so the
                          delete button never overlaps the text */}
                      <span className={`text-sm font-medium text-black group-hover:text-neutral-700 leading-snug ${isAdmin ? "pr-7" : ""}`}>
                        {book.title}
                      </span>
                      {book.author && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {book.author}
                        </span>
                      )}
                      {book.total_chapters != null && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          {book.total_chapters} chapters
                        </span>
                      )}
                    </Link>

                    {/* Admin-only delete button — top-right of the list item */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => requestDeleteBook(e, book)}
                        aria-label={`Remove ${book.title}`}
                        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-500 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
                      >
                        <svg
                          className="w-2.5 h-2.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Book button */}
          <div className="shrink-0 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={openAddBook}
              className="w-1/4 min-w-[80px] rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition"
            >
              + Add Book
            </button>
          </div>
        </div>

        {/* DIVIDER */}
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
              <div
                key={i}
                className="w-0.5 h-4 rounded-full bg-neutral-400 dark:bg-neutral-600 group-hover:bg-neutral-500 dark:group-hover:bg-neutral-500 transition-colors"
              />
            ))}
          </div>
        </div>

        {/* RIGHT PANEL — Messages */}
        <div className="flex flex-col flex-1 overflow-hidden bg-background">
          {/* Header row: title + member/kick buttons */}
          <div className="shrink-0 px-4 py-3 border-b border-neutral-200 bg-surface flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Group Discussion
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={openMembersModal}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              >
                List All Members
              </button>

              {isAdmin && (
                <button
                  onClick={openKickModal}
                  className="rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                >
                  Kick Members
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">
                No messages yet. Say hello!
              </p>
            )}
            {messages.map((msg) => {
              const isOwn = msg.sender_id === currentUserId;
              const senderLabel = isOwn
                ? currentUserUsername
                : (msg.sender_username ?? "Unknown");
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
                >
                  <div className={`flex items-center gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium truncate max-w-[180px]">
                      {senderLabel}
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isOwn
                        ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 rounded-tr-sm"
                        : "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700 rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-neutral-200 bg-background px-4 py-3">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Write a message…"
                className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-neutral-100"
              />
              <button
                type="submit"
                disabled={sending || !messageContent.trim()}
                className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── ADD BOOK MODAL ──────────────────────────────────── */}
      {showAddBook && (
        <div
          className="fixed inset-0 z-50 flex items-center bg-black/40 dark:bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddBook(false); }}
          style={{ justifyContent: `${leftWidth / 2}%` }}
        >
          <div
            className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 p-5 flex flex-col gap-4"
            style={{ width: "min(300px, 90vw)" }}
          >
            <button
              onClick={() => setShowAddBook(false)}
              className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 pr-6">
              Add a Book
            </h3>

            <form onSubmit={handleAddBook} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="e.g. Dune"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Author <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={bookAuthor}
                  onChange={(e) => setBookAuthor(e.target.value)}
                  placeholder="e.g. Frank Herbert"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Number of Chapters <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={bookChapters}
                  onChange={(e) => setBookChapters(e.target.value)}
                  placeholder="e.g. 48"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {addBookError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-2 py-1.5">
                  {addBookError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddBook(false)}
                  className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBook}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {addingBook ? "Adding…" : "Add Book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE BOOK MODAL ────────────────────────── */}
      {confirmDeleteBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs p-6 flex flex-col gap-4">
            <p className="text-sm text-neutral-800 dark:text-neutral-200 text-center leading-relaxed">
              Are you sure you want to remove{" "}
              <span className="font-semibold">{confirmDeleteBook.title}</span>?
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 text-center">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                No
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {deleting ? "Removing…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIST ALL MEMBERS MODAL ──────────────────────────── */}
      {showMembersModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMembersModal(false); }}
        >
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs flex flex-col max-h-[70vh]">
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Members
                {!membersLoading && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    ({members.length})
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowMembersModal(false)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {membersLoading && (
                <p className="px-5 py-6 text-sm text-neutral-400 dark:text-neutral-500 text-center">
                  Loading…
                </p>
              )}
              {membersError && (
                <p className="px-5 py-6 text-sm text-red-500 text-center">
                  {membersError}
                </p>
              )}
              {!membersLoading && !membersError && (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 px-2 py-2">
                  {members.map((member) => {
                    const isMe = member.user_id === currentUserId;
                    const isMemberAdmin = member.user_id === adminId;
                    const displayName = member.username ?? "Unknown";
                    return (
                      <li key={member.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase">
                            {displayName[0]}
                          </span>
                        </div>
                        <span className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                          {displayName}
                          {isMe && (
                            <span className="ml-1 text-xs text-neutral-400">(you)</span>
                          )}
                        </span>
                        {isMemberAdmin && (
                          <span className="ml-auto shrink-0 text-xs font-semibold text-red-500 dark:text-red-400">
                            (admin)
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── KICK MEMBERS MODAL (admin only) ─────────────────── */}
      {showKickModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowKickModal(false);
              setKickError(null);
            }
          }}
        >
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs flex flex-col max-h-[70vh]">
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Kick Members
              </h3>
              <button
                onClick={() => { setShowKickModal(false); setKickError(null); }}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {kickError && (
              <div className="mx-4 mt-3">
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-3 py-2">
                  {kickError}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {membersLoading && (
                <p className="px-5 py-6 text-sm text-neutral-400 dark:text-neutral-500 text-center">
                  Loading…
                </p>
              )}
              {membersError && (
                <p className="px-5 py-6 text-sm text-red-500 text-center">
                  {membersError}
                </p>
              )}
              {!membersLoading && !membersError && (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 px-2 py-2">
                  {members.filter((m) => m.user_id !== adminId).map((member) => {
                    const displayName = member.username ?? "Unknown";
                    return (
                      <li key={member.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase">
                            {displayName[0]}
                          </span>
                        </div>
                        <span className="flex-1 text-sm text-neutral-800 dark:text-neutral-200 truncate">
                          {displayName}
                        </span>
                        <button
                          onClick={() => requestKick(member)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition"
                          aria-label={`Kick ${displayName}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                  {members.filter((m) => m.user_id !== adminId).length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
                      No other members to kick.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM KICK SUB-MODAL ───────────────────────────── */}
      {confirmKickTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 dark:bg-black/75 px-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-xs p-6 flex flex-col gap-4">
            <p className="text-sm text-neutral-800 dark:text-neutral-200 text-center leading-relaxed">
              Are you sure you want to kick out{" "}
              <span className="font-semibold">
                {confirmKickTarget.username ?? "this member"}
              </span>
              ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelKick}
                disabled={kicking}
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                No
              </button>
              <button
                onClick={confirmKick}
                disabled={kicking}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {kicking ? "Kicking…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}