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

interface Props {
  groupId: string;
  currentUserId: string;
  currentUserUsername: string;
  initialBooks: Book[];
  initialMessages: Message[];
}

export default function GroupSplitView({
  groupId,
  currentUserId,
  currentUserUsername,
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

  // Messages state
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

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
          className="flex flex-col overflow-hidden border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
          style={{ width: `${leftWidth}%` }}
        >
          <div className="shrink-0 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
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
                  <li key={book.id}>
                    <Link
                      href={`/books/${book.id}`}
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition group"
                    >
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 leading-snug">
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
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add Book button — ~1/4 width of left panel */}
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
        <div className="flex flex-col flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-950">
          <div className="shrink-0 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Group Discussion
            </h2>
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

          <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
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

      {/* ADD BOOK MODAL — centered over the left panel */}
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
    </>
  );
}