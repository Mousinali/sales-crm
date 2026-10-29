"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";

type Message = {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  reply_to_message_id: number | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// WhatsApp-style ticks for a message the viewer sent: one gray check once
// it's written to the server, two gray once the recipient's client has it,
// two blue once they've actually opened that conversation and read it.
function MessageTicks({ message }: { message: Message }) {
  if (message.read_at) {
    return <i className="ri-check-double-line text-sky-500" aria-label="Read" title="Read" />;
  }
  if (message.delivered_at) {
    return <i className="ri-check-double-line text-zinc-400" aria-label="Delivered" title="Delivered" />;
  }
  return <i className="ri-check-line text-zinc-400" aria-label="Sent" title="Sent" />;
}

type Conversation = {
  counterpart_id: number;
  last_message: string;
  last_sender_id: number;
  last_at: string;
  unread_count: number;
};

type RosterUser = { id: number; name: string; role: string };

export default function ChatView({
  viewerId,
  initialConversations,
  initialSelectedId,
}: {
  viewerId: number;
  initialConversations: Conversation[];
  initialSelectedId: number | null;
}) {
  // The roster endpoint caps results (it's a picker, not a paginated
  // table) and expects `q` to narrow once there are more users than fit in
  // one page. Results are merged in, not replaced, so a name already
  // resolved stays resolvable even after the search term changes again.
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");
  useEffect(() => {
    const params = new URLSearchParams();
    if (rosterSearch.trim()) params.set("q", rosterSearch.trim());
    const timer = setTimeout(() => {
      fetch(`/api/users/roster?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((body: { users?: RosterUser[] }) => {
          setRoster((current) => {
            const byId = new Map(current.map((u) => [u.id, u]));
            for (const u of body.users ?? []) byId.set(u.id, u);
            return [...byId.values()];
          });
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [rosterSearch]);
  const rosterById = new Map(roster.map((u) => [u.id, u]));

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Deep-linked from a "X sent you a message" notification click
  // (/chat?with=<senderId>) — open straight to that conversation instead of
  // landing on the empty "select a contact" state.
  useEffect(() => {
    if (initialSelectedId !== null) void selectContact(initialSelectedId);
  }, [initialSelectedId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("message:new", (message: Message) => {
      const counterpartId = message.sender_id === viewerId ? message.recipient_id : message.sender_id;
      const isOpenThread = counterpartId === selectedIdRef.current;

      if (isOpenThread) {
        setMessages((current) => [...current, message]);
      }

      setConversations((current) => {
        const existing = current.find((c) => c.counterpart_id === counterpartId);
        const unread = message.sender_id === viewerId || isOpenThread ? (existing?.unread_count ?? 0) : (existing?.unread_count ?? 0) + 1;
        const updatedEntry: Conversation = {
          counterpart_id: counterpartId,
          last_message: message.body,
          last_sender_id: message.sender_id,
          last_at: message.created_at,
          unread_count: unread,
        };
        return [updatedEntry, ...current.filter((c) => c.counterpart_id !== counterpartId)];
      });
    });

    socket.on("messages:delivered", ({ ids }: { ids: number[] }) => {
      const idSet = new Set(ids);
      setMessages((current) => current.map((m) => (idSet.has(m.id) ? { ...m, delivered_at: m.delivered_at ?? new Date().toISOString() } : m)));
    });

    socket.on("messages:read", ({ ids }: { ids: number[] }) => {
      const idSet = new Set(ids);
      setMessages((current) =>
        current.map((m) => (idSet.has(m.id) ? { ...m, delivered_at: m.delivered_at ?? new Date().toISOString(), read_at: m.read_at ?? new Date().toISOString() } : m)),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [viewerId]);

  async function selectContact(userId: number) {
    setSelectedId(userId);
    setMessages([]);
    setSendError(null);
    setLoadError(null);
    setReplyingTo(null);
    try {
      const response = await fetch(`/api/chat/messages?with=${userId}`);
      if (!response.ok) {
        setLoadError("Could not load messages.");
        return;
      }
      const body = await response.json();
      setMessages(body.messages ?? []);
      await fetch("/api/chat/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ withUserId: userId }),
      });
      setConversations((current) => current.map((c) => (c.counterpart_id === userId ? { ...c, unread_count: 0 } : c)));
    } catch {
      setLoadError("Could not load messages.");
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || selectedId === null) return;
    setSendError(null);
    socketRef.current?.emit(
      "message:send",
      { recipientId: selectedId, body, replyToMessageId: replyingTo?.id },
      (ack?: { error?: string }) => {
        if (ack?.error) setSendError(ack.error);
      },
    );
    setDraft("");
    setReplyingTo(null);
  }

  // The roster is capped/searched — but an existing conversation partner
  // must never disappear from the sidebar just because they're outside
  // that window, so union them in (falling back to `#id` if their name
  // hasn't been resolved yet).
  const rosterWithConversationPartners = (() => {
    const byId = new Map(roster.map((u) => [u.id, u]));
    for (const c of conversations) {
      if (!byId.has(c.counterpart_id)) byId.set(c.counterpart_id, { id: c.counterpart_id, name: `#${c.counterpart_id}`, role: "" });
    }
    return [...byId.values()];
  })();

  const contacts = rosterWithConversationPartners
    .filter((u) => u.id !== viewerId)
    .slice()
    .sort((a, b) => {
      const ca = conversations.find((c) => c.counterpart_id === a.id);
      const cb = conversations.find((c) => c.counterpart_id === b.id);
      if (ca && cb) return cb.last_at.localeCompare(ca.last_at);
      if (ca) return -1;
      if (cb) return 1;
      return a.name.localeCompare(b.name);
    });

  const selectedUser = selectedId !== null ? rosterById.get(selectedId) : undefined;

  return (
    <div className="flex h-[32rem] overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex w-64 shrink-0 flex-col border-r border-zinc-200">
        <div className="border-b border-zinc-200 p-2">
          <input
            type="text"
            value={rosterSearch}
            onChange={(event) => setRosterSearch(event.target.value)}
            placeholder="Search people..."
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 && <p className="px-4 py-3 text-sm text-zinc-500">No other users yet.</p>}
        {contacts.map((contact) => {
          const conversation = conversations.find((c) => c.counterpart_id === contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => selectContact(contact.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${
                selectedId === contact.id ? "bg-indigo-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-900">{contact.name}</span>
                {conversation && conversation.unread_count > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {conversation.unread_count}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-400">{contact.role}</span>
              {conversation && (
                <span className="truncate text-xs text-zinc-500">
                  {conversation.last_sender_id === viewerId ? "You: " : ""}
                  {conversation.last_message}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {selectedId === null ? (
          <p className="m-auto text-sm text-zinc-500">Select a contact to start chatting.</p>
        ) : (
          <>
            <div className="border-b border-zinc-200 px-4 py-3">
              <p className="text-sm font-medium text-zinc-900">{selectedUser?.name ?? `#${selectedId}`}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loadError && (
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
              )}
              {messages.length === 0 && !loadError && <p className="text-sm text-zinc-500">No messages yet. Say hello.</p>}
              <div className="flex flex-col gap-2">
                {messages.map((message) => {
                  const quoted = message.reply_to_message_id
                    ? messages.find((m) => m.id === message.reply_to_message_id)
                    : undefined;
                  const isMine = message.sender_id === viewerId;
                  return (
                    <div key={message.id} className={`group flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                      {isMine && (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(message)}
                          title="Reply"
                          className="rounded p-1 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-600 focus:opacity-100 group-hover:opacity-100"
                        >
                          <i className="ri-reply-line text-sm" aria-hidden="true" />
                        </button>
                      )}
                      <div className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
                        <div
                          className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                            isMine ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-900"
                          }`}
                        >
                          {message.reply_to_message_id && (
                            <div
                              className={`mb-1 rounded border-l-2 px-2 py-1 text-xs ${
                                isMine ? "border-indigo-300 bg-indigo-500/40 text-indigo-50" : "border-zinc-300 bg-zinc-200/60 text-zinc-600"
                              }`}
                            >
                              {quoted ? quoted.body : "Original message"}
                            </div>
                          )}
                          <p>{message.body}</p>
                        </div>
                        <p className="flex items-center gap-1 px-1 text-[10px] text-zinc-400">
                          {formatMessageTime(message.created_at)}
                          {isMine && <MessageTicks message={message} />}
                        </p>
                      </div>
                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(message)}
                          title="Reply"
                          className="rounded p-1 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-600 focus:opacity-100 group-hover:opacity-100"
                        >
                          <i className="ri-reply-line text-sm" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {replyingTo && (
              <div className="flex items-start justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-600">Replying to {replyingTo.sender_id === viewerId ? "yourself" : selectedUser?.name ?? "them"}</p>
                  <p className="truncate text-zinc-500">{replyingTo.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
                >
                  <i className="ri-close-line text-sm" aria-hidden="true" />
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2 border-t border-zinc-200 p-3">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
            {sendError && (
              <p role="alert" className="px-3 pb-2 text-sm text-red-600">
                {sendError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
