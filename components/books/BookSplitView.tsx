"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";

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
  spoiler_chapter: number | null;
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
  msg: Message;
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
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{formattedTime}</span>
        {msg.spoiler_chapter !== null && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            isLocked
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          }`}>
            Ch.{msg.spoiler_chapter}+
          </span>
        )}
      </div>
      {isLocked ? (
        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed flex items-center gap-2 select-none ${
          isOwn ? "rounded-tr-sm" : "rounded-tl-sm"
        } bg-neutral-100 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-600`}>
          <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span className="text-neutral-400 dark:text-neutral-500 italic text-xs">
            Locked until chapter {msg.spoiler_chapter}
          </span>
        </div>
      ) : (
        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isOwn
            ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 rounded-tr-sm"
            : "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700 rounded-tl-sm"
        }`}>
          {msg.content}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fetcher — shared by SWR
// ---------------------------------------------------------------------------

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// How often SWR re-fetches while the tab is visible.
// SWR automatically pauses polling when the tab is hidden, so this won't
// rack up requests while the user is on a different tab.
const REFRESH_INTERVAL_MS = 5000;

export default function BookSplitView({
  bookId,
  groupId,
  totalChapters,
  currentUserId,
  currentUserUsername,
  initialProgress,
  myCurrentChapter: initialMyCurrentChapter,
  initialMessages,
}: Props) {
  const [leftWidth, setLeftWidth] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Progress state (updated optimistically on save)
  const [progress, setProgress] = useState<ProgressEntry[]>(initialProgress);
  const [myCurrentChapter, setMyCurrentChapter] = useState<number | null>(initialMyCurrentChapter);
  const [chapterInput, setChapterInput] = useState(
    initialMyCurrentChapter != null ? String(initialMyCurrentChapter) : ""
  );
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressSuccess, setProgressSuccess] = useState(false);

  // Optimistic messages — appended immediately on send, then replaced by SWR
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);

  // Spoiler compose state
  const [spoilerEnabled, setSpoilerEnabled] = useState(false);
  const [spoilerChapter, setSpoilerChapter] = useState<string>("");

  // Scroll tracking
  const isAtBottomRef = useRef(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // SWR — polls for messages automatically; pauses when tab is hidden;
  // deduplicates concurrent requests; retries with backoff on error.
  // ---------------------------------------------------------------------------
  const { data: swrData, mutate } = useSWR<{ messages: Message[] }>(
    `/api/books/${bookId}/messages?group_id=${groupId}`,
    fetcher,
    {
      fallbackData: { messages: initialMessages },
      refreshInterval: REFRESH_INTERVAL_MS,
      // Don't re-fetch just because the window regained focus — the interval
      // already keeps data fresh. Disabling this halves the number of requests.
      revalidateOnFocus: false,
      // Keep showing the last good data while a revalidation is in flight.
      keepPreviousData: true,
    }
  );

  // Merge server messages with any optimistic ones not yet confirmed by SWR.
  const serverMessages = swrData?.messages ?? initialMessages;
  const messages = [...serverMessages, ...optimisticMessages];

  // ── Scroll tracking ───────────────────────────────────────

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── Resizable divider ─────────────────────────────────────

  const onMouseDown = useCallback(() => setIsDragging(true), []);
  const onTouchStart = useCallback(() => setIsDragging(true), []);

  useEffect(() => {
    if (!isDragging) return;
    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setLeftWidth(Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 20), 70));
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
      setLeftWidth(Math.min(Math.max(((e.touches[0].clientX - rect.left) / rect.width) * 100, 20), 70));
    }
    function onTouchEnd() { setIsDragging(false); }
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => { window.removeEventListener("touchmove", onTouchMove); window.removeEventListener("touchend", onTouchEnd); };
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

    setMyCurrentChapter(chapter);
    setProgress((prev) => {
      const exists = prev.find((p) => p.user_id === currentUserId);
      const updated = new Date().toISOString();
      const next = exists
        ? prev.map((p) => p.user_id === currentUserId ? { ...p, current_chapter: chapter, updated_at: updated } : p)
        : [{ user_id: currentUserId, username: currentUserUsername, current_chapter: chapter, updated_at: updated }, ...prev];
      return next.sort((a, b) => b.current_chapter - a.current_chapter);
    });

    setSavingProgress(false);
    setProgressSuccess(true);
    setTimeout(() => setProgressSuccess(false), 2000);
  }

  // ── Send message ──────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = messageContent.trim();
    if (!content) return;
    setSending(true);

    const spoilerChapterValue = spoilerEnabled && spoilerChapter !== "" ? Number(spoilerChapter) : null;

    // Optimistic update — show the message immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      book_id: bookId,
      group_id: groupId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      sender_username: currentUserUsername,
      spoiler_chapter: spoilerChapterValue,
    };
    setOptimisticMessages((prev) => [...prev, optimisticMsg]);
    isAtBottomRef.current = true;
    setMessageContent("");
    setSpoilerEnabled(false);
    setSpoilerChapter("");

    const res = await fetch(`/api/books/${bookId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, content, spoiler_chapter: spoilerChapterValue }),
    });

    if (res.ok) {
      // Wait for the revalidation to complete, then drop the optimistic
      // entry — the real message from the server will now be in swrData.
      await mutate();
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      // Roll back the optimistic message on failure
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessageContent(content);
    }

    setSending(false);
  }

  // ── Helpers ───────────────────────────────────────────────

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function progressPercent(chapter: number) {
    if (!totalChapters || totalChapters <= 0) return null;
    return Math.min(100, Math.round((chapter / totalChapters) * 100));
  }

  const maxChapter = totalChapters ?? 100;
  const chapterOptions = Array.from({ length: maxChapter }, (_, i) => i + 1);

  // ── Render ────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden" style={{ userSelect: isDragging ? "none" : undefined }}>
      {/* LEFT PANEL — Reading Progress */}
      <div className="flex flex-col overflow-hidden border-r border-neutral-200 bg-background" style={{ width: `${leftWidth}%` }}>
        <div className="shrink-0 px-4 py-3 border-b border-neutral-200 bg-surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Reading Progress</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {progress.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500">No progress logged yet. Be the first!</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {progress.map((entry) => {
                const pct = progressPercent(entry.current_chapter);
                const isMe = entry.user_id === currentUserId;
                return (
                  <li key={entry.user_id} className="px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${isMe ? "text-blue-600 dark:text-blue-400" : "text-black"}`}>
                        {entry.username}
                        {isMe && <span className="ml-1 text-xs font-normal text-blue-400 dark:text-blue-500">(you)</span>}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                        Ch.&nbsp;{entry.current_chapter}{totalChapters ? ` / ${totalChapters}` : ""}
                      </span>
                    </div>
                    {pct != null && (
                      <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${isMe ? "bg-blue-500" : "bg-neutral-400 dark:bg-neutral-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-4 py-3 bg-background">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">Update Your Progress</p>
          <form onSubmit={handleUpdateProgress} className="flex gap-2 items-center">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">Ch.</span>
              <input
                type="number" min={0} step={0.5} max={totalChapters ?? undefined}
                value={chapterInput} onChange={(e) => setChapterInput(e.target.value)} placeholder="0"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {totalChapters && <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">/ {totalChapters}</span>}
            </div>
            <button type="submit" disabled={savingProgress || chapterInput === ""}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {savingProgress ? "Saving…" : "Save"}
            </button>
          </form>
          {progressError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{progressError}</p>}
          {progressSuccess && <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">✓ Progress saved!</p>}

          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
            <Link href={`/books/${bookId}/private-conversations`}
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs font-medium text-black hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Private Conversations
            </Link>
          </div>
        </div>
      </div>

      {/* DIVIDER */}
      <div
        className={`relative shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group ${isDragging ? "bg-neutral-400 dark:bg-neutral-500" : "bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700"} transition-colors`}
        onMouseDown={onMouseDown} onTouchStart={onTouchStart}
      >
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((i) => <div key={i} className="w-0.5 h-4 rounded-full bg-neutral-400 dark:bg-neutral-600 group-hover:bg-neutral-500 transition-colors" />)}
        </div>
      </div>

      {/* RIGHT PANEL — Book Discussion */}
      <div className="flex flex-col flex-1 overflow-hidden bg-background">
        <div className="shrink-0 px-4 py-3 border-b border-neutral-200 bg-surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Book Discussion</h2>
        </div>

        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">No messages yet. Start the discussion!</p>
          )}
          {messages.map((msg) => {
            const isOwn = msg.sender_id === currentUserId;
            return (
              <SpoilerMessage
                key={msg.id}
                msg={msg}
                isOwn={isOwn}
                myCurrentChapter={myCurrentChapter}
                senderLabel={isOwn ? currentUserUsername : (msg.sender_username ?? "Unknown")}
                formattedTime={formatTime(msg.created_at)}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose */}
        <div className="shrink-0 border-t border-neutral-200 bg-background px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => { const next = !spoilerEnabled; setSpoilerEnabled(next); if (!next) setSpoilerChapter(""); }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                spoilerEnabled
                  ? "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300"
                  : "bg-white border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400"
              }`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                {spoilerEnabled
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                }
              </svg>
              Spoiler
            </button>
            {spoilerEnabled && (
              <>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">lock until ch.</span>
                <select value={spoilerChapter} onChange={(e) => setSpoilerChapter(e.target.value)}
                  className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">pick chapter…</option>
                  {chapterOptions.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
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
            <input type="text" value={messageContent} onChange={(e) => setMessageContent(e.target.value)}
              placeholder={spoilerEnabled && spoilerChapter !== "" ? `Spoiler message (ch. ${spoilerChapter}+)…` : "Write a message…"}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 transition dark:text-neutral-100 ${
                spoilerEnabled && spoilerChapter !== ""
                  ? "border-amber-300 bg-amber-50 focus:ring-amber-400 dark:border-amber-700 dark:bg-amber-950/30"
                  : "border-neutral-300 bg-neutral-50 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:ring-neutral-100"
              }`}
            />
            <button type="submit"
              disabled={sending || !messageContent.trim() || (spoilerEnabled && spoilerChapter === "")}
              title={spoilerEnabled && spoilerChapter === "" ? "Pick a chapter for the spoiler gate first" : undefined}
              className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">
              Send
            </button>
          </form>
          {spoilerEnabled && spoilerChapter === "" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">Select a chapter above to enable the spoiler gate.</p>
          )}
        </div>
      </div>
    </div>
  );
}