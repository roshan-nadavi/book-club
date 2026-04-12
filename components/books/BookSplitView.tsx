"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type ProgressEntry = {
  user_id: string;
  username: string;
  current_chapter: number;
  updated_at: string;
};

type Message = {
  id: string;
  book_id: string;
  group_id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender_username?: string;
};

interface Props {
  bookId: string;
  groupId: string;
  totalChapters: number | null;
  currentUserId: string;
  currentUserUsername: string;
  initialProgress: ProgressEntry[];
  myCurrentChapter: number | null;
  initialMessages: Message[];
}

export default function BookSplitView({
  bookId,
  groupId,
  totalChapters,
  currentUserId,
  currentUserUsername,
  initialProgress,
  myCurrentChapter,
  initialMessages,
}: Props) {
  const [leftWidth, setLeftWidth] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Progress state
  const [progress, setProgress] = useState<ProgressEntry[]>(initialProgress);
  const [chapterInput, setChapterInput] = useState(
    myCurrentChapter != null ? String(myCurrentChapter) : ""
  );
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressSuccess, setProgressSuccess] = useState(false);

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

  // ── Update progress ───────────────────────────────────────

  async function handleUpdateProgress(e: React.FormEvent) {
    e.preventDefault();
    setProgressError(null);
    setProgressSuccess(false);
    setSavingProgress(true);

    const chapter = parseFloat(chapterInput);
    if (isNaN(chapter) || chapter < 0) {
      setProgressError("Please enter a valid chapter number (0 or above).");
      setSavingProgress(false);
      return;
    }

    const res = await fetch(`/api/books/${bookId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_chapter: chapter }),
    });

    const data = await res.json();

    if (!res.ok) {
      setProgressError(data.error ?? "Failed to update progress.");
      setSavingProgress(false);
      return;
    }

    setProgress((prev) => {
      const exists = prev.find((p) => p.user_id === currentUserId);
      const updated = new Date().toISOString();
      if (exists) {
        return [...prev.map((p) =>
          p.user_id === currentUserId
            ? { ...p, current_chapter: chapter, updated_at: updated }
            : p
        )].sort((a, b) => b.current_chapter - a.current_chapter);
      }
      return [
        { user_id: currentUserId, username: currentUserUsername, current_chapter: chapter, updated_at: updated },
        ...prev,
      ].sort((a, b) => b.current_chapter - a.current_chapter);
    });

    setSavingProgress(false);
    setProgressSuccess(true);
    setTimeout(() => setProgressSuccess(false), 2000);
  }

  // ── Messages ──────────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = messageContent.trim();
    if (!content) return;
    setSending(true);

    const res = await fetch(`/api/books/${bookId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, content }),
    });

    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          book_id: bookId,
          group_id: groupId,
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

  function progressPercent(chapter: number) {
    if (!totalChapters || totalChapters <= 0) return null;
    return Math.min(100, Math.round((chapter / totalChapters) * 100));
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex flex-1 overflow-hidden"
      style={{ userSelect: isDragging ? "none" : undefined }}
    >
      {/* LEFT PANEL — Reading Progress */}
      <div
        className="flex flex-col overflow-hidden border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
        style={{ width: `${leftWidth}%` }}
      >
        <div className="shrink-0 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Reading Progress
          </h2>
        </div>

        {/* All members progress list */}
        <div className="flex-1 overflow-y-auto">
          {progress.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500">
              No progress logged yet. Be the first!
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {progress.map((entry) => {
                const pct = progressPercent(entry.current_chapter);
                const isMe = entry.user_id === currentUserId;
                return (
                  <li key={entry.user_id} className="px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          isMe
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-neutral-900 dark:text-neutral-100"
                        }`}
                      >
                        {entry.username}
                        {isMe && (
                          <span className="ml-1 text-xs font-normal text-blue-400 dark:text-blue-500">
                            (you)
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                        Ch.&nbsp;{entry.current_chapter}
                        {totalChapters ? ` / ${totalChapters}` : ""}
                      </span>
                    </div>
                    {pct != null && (
                      <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isMe ? "bg-blue-500" : "bg-neutral-400 dark:bg-neutral-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* My progress updater — pinned to bottom */}
        <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-4 py-3 bg-neutral-50 dark:bg-neutral-950">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
            Update Your Progress
          </p>
          <form onSubmit={handleUpdateProgress} className="flex gap-2 items-center">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">Ch.</span>
              <input
                type="number"
                min={0}
                step={0.5}
                max={totalChapters ?? undefined}
                value={chapterInput}
                onChange={(e) => setChapterInput(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {totalChapters && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
                  / {totalChapters}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={savingProgress || chapterInput === ""}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {savingProgress ? "Saving…" : "Save"}
            </button>
          </form>
          {progressError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{progressError}</p>
          )}
          {progressSuccess && (
            <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">✓ Progress saved!</p>
          )}
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

      {/* RIGHT PANEL — Book Discussion */}
      <div className="flex flex-col flex-1 overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        <div className="shrink-0 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Book Discussion
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">
              No messages yet. Start the discussion!
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
                <div
                  className={`flex items-center gap-2 ${
                    isOwn ? "flex-row-reverse" : "flex-row"
                  }`}
                >
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
  );
}