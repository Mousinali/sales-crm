"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { io, type Socket } from "socket.io-client";
import Avatar from "@/components/ui/Avatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import { FormattedText } from "@/components/ui/RichTextField";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { toast } from "@/lib/toast";
import { MAX_MESSAGE_CHARS } from "@/lib/chat/types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Attachment = { attachment_id: number | null; attachment_name: string | null; attachment_size: number | null };

type Message = Attachment & {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  reply_to_message_id: number | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

type GroupMessage = Attachment & {
  id: number;
  group_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: string;
};

type Conversation = {
  counterpart_id: number;
  last_message: string;
  last_sender_id: number;
  last_at: string;
  unread_count: number;
  muted: boolean;
  blocked: boolean;
};

type Group = {
  id: number;
  name: string;
  created_by: number;
  last_message: string | null;
  last_sender_id: number | null;
  last_at: string;
  unread_count: number;
  muted: boolean;
};

type GroupMember = { user_id: number; name: string; role: string; avatar_url: string | null };
type RosterUser = { id: number; name: string; role: string; avatar_url: string | null };
type ChatState = { blockedByMe: boolean; blockedByThem: boolean; muted: boolean };
type Selection = { kind: "user" | "group"; id: number } | null;
type Tab = "all" | "unread" | "teams";

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Same file kinds people recognise at a glance in the usual chat apps.
function fileKind(name: string): { label: string; icon: string; tone: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { label: "PDF", icon: "ri-file-pdf-2-fill", tone: "text-rose-600 bg-rose-50" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return { label: "IMG", icon: "ri-image-fill", tone: "text-violet-600 bg-violet-50" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { label: "XLS", icon: "ri-file-excel-2-fill", tone: "text-emerald-600 bg-emerald-50" };
  if (["doc", "docx", "txt"].includes(ext)) return { label: "DOC", icon: "ri-file-word-2-fill", tone: "text-sky-600 bg-sky-50" };
  if (["zip", "rar", "7z"].includes(ext)) return { label: "ZIP", icon: "ri-file-zip-fill", tone: "text-amber-600 bg-amber-50" };
  return { label: "FILE", icon: "ri-file-3-fill", tone: "text-zinc-600 bg-zinc-100" };
}

// WhatsApp-style ticks for a message the viewer sent: one gray check once
// it's written to the server, two gray once the recipient's client has it,
// two blue once they've actually opened that conversation and read it.
function MessageTicks({ message }: { message: Message }) {
  if (message.read_at) return <i className="ri-check-double-line text-sky-300" aria-label="Read" title="Read" />;
  if (message.delivered_at) return <i className="ri-check-double-line text-white/70" aria-label="Delivered" title="Delivered" />;
  return <i className="ri-check-line text-white/70" aria-label="Sent" title="Sent" />;
}

function FileCard({ message, mine }: { message: Attachment; mine: boolean }) {
  if (message.attachment_id == null || !message.attachment_name) return null;
  const kind = fileKind(message.attachment_name);
  return (
    <a
      href={`/api/chat/attachments/${message.attachment_id}`}
      download={message.attachment_name}
      className={`mt-1 flex w-64 max-w-full items-center gap-3 rounded-xl border p-2.5 text-left ${
        mine ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ${mine ? "bg-white text-brand-600" : kind.tone}`}>
        <i className={kind.icon} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={message.attachment_name}>
          {message.attachment_name}
        </span>
        <span className={`block text-xs ${mine ? "text-white/70" : "text-zinc-500"}`}>
          {kind.label} · {formatBytes(message.attachment_size ?? 0)}
        </span>
      </span>
      <i className="ri-download-2-line shrink-0 text-lg" aria-hidden="true" />
    </a>
  );
}

function HeaderButton({ icon, label, onClick, active = false }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition-colors ${
        active ? "border-brand-200 bg-brand-50 text-brand-700" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      <i className={icon} aria-hidden="true" />
    </button>
  );
}

function GroupAvatar({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 ${
        size === "lg" ? "h-11 w-11 text-xl" : "h-10 w-10 text-lg"
      }`}
    >
      <i className="ri-group-fill" aria-hidden="true" />
    </span>
  );
}

// Appends once — a message can reach the client both via the socket and via
// the sender's own REST response.
function appendUnique<T extends { id: number }>(list: T[], item: T): T[] {
  return list.some((m) => m.id === item.id) ? list : [...list, item];
}

export default function ChatView({
  viewerId,
  initialConversations,
  initialGroups,
  initialSelectedId,
}: {
  viewerId: number;
  initialConversations: Conversation[];
  initialGroups: Group[];
  initialSelectedId: number | null;
}) {
  // The roster endpoint caps results (it's a picker, not a paginated
  // table) and expects `q` to narrow once there are more users than fit in
  // one page. Results are merged in, not replaced, so a name already
  // resolved stays resolvable even after the search term changes again.
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
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
  }, [debouncedSearch]);
  const rosterById = new Map(roster.map((u) => [u.id, u]));

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [tab, setTab] = useState<Tab>("all");
  const [selection, setSelection] = useState<Selection>(null);
  const selectionRef = useRef<Selection>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Direct-chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatState, setChatState] = useState<ChatState>({ blockedByMe: false, blockedByThem: false, muted: false });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // Team-chat state
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupMuted, setGroupMuted] = useState(false);

  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [confirm, setConfirm] = useState<"block" | "leave" | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  async function refreshLists() {
    try {
      const response = await fetch("/api/chat/conversations");
      if (!response.ok) return;
      const body = await response.json();
      setConversations(body.conversations ?? []);
      setGroups(body.groups ?? []);
    } catch {
      // The lists just stay as they were.
    }
  }

  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("message:new", (message: Message) => {
      const counterpartId = message.sender_id === viewerId ? message.recipient_id : message.sender_id;
      const current = selectionRef.current;
      const isOpenThread = current?.kind === "user" && current.id === counterpartId;

      if (isOpenThread) {
        setMessages((list) => appendUnique(list, message));
        if (message.sender_id !== viewerId) {
          void fetch("/api/chat/read", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ withUserId: counterpartId }),
          });
        }
      }

      setConversations((list) => {
        const existing = list.find((c) => c.counterpart_id === counterpartId);
        const unread = message.sender_id === viewerId || isOpenThread ? (existing?.unread_count ?? 0) : (existing?.unread_count ?? 0) + 1;
        const updatedEntry: Conversation = {
          counterpart_id: counterpartId,
          last_message: message.body || "Sent a file",
          last_sender_id: message.sender_id,
          last_at: message.created_at,
          unread_count: unread,
          muted: existing?.muted ?? false,
          blocked: existing?.blocked ?? false,
        };
        return [updatedEntry, ...list.filter((c) => c.counterpart_id !== counterpartId)];
      });
    });

    socket.on("group:message:new", (message: GroupMessage) => {
      const current = selectionRef.current;
      const isOpen = current?.kind === "group" && current.id === message.group_id;
      if (isOpen) {
        setGroupMessages((list) => appendUnique(list, message));
        if (message.sender_id !== viewerId) void fetch(`/api/chat/groups/${message.group_id}/read`, { method: "POST" });
      }
      setGroups((list) =>
        list.map((g) =>
          g.id === message.group_id
            ? {
                ...g,
                last_message: message.body || "Sent a file",
                last_sender_id: message.sender_id,
                last_at: message.created_at,
                unread_count: message.sender_id === viewerId || isOpen ? g.unread_count : g.unread_count + 1,
              }
            : g,
        ),
      );
    });

    socket.on("messages:delivered", ({ ids }: { ids: number[] }) => {
      const idSet = new Set(ids);
      setMessages((list) => list.map((m) => (idSet.has(m.id) ? { ...m, delivered_at: m.delivered_at ?? new Date().toISOString() } : m)));
    });

    socket.on("messages:read", ({ ids }: { ids: number[] }) => {
      const idSet = new Set(ids);
      setMessages((list) =>
        list.map((m) => (idSet.has(m.id) ? { ...m, delivered_at: m.delivered_at ?? new Date().toISOString(), read_at: m.read_at ?? new Date().toISOString() } : m)),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [viewerId]);

  function resetComposer() {
    setDraft("");
    setFile(null);
    setSendError(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function selectUser(userId: number) {
    setSelection({ kind: "user", id: userId });
    setMessages([]);
    setGroupMessages([]);
    setLoadError(null);
    resetComposer();
    try {
      const response = await fetch(`/api/chat/messages?with=${userId}`);
      if (!response.ok) {
        setLoadError("Could not load messages.");
        return;
      }
      const body = await response.json();
      setMessages(body.messages ?? []);
      setChatState(body.state ?? { blockedByMe: false, blockedByThem: false, muted: false });
      await fetch("/api/chat/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ withUserId: userId }),
      });
      setConversations((list) => list.map((c) => (c.counterpart_id === userId ? { ...c, unread_count: 0 } : c)));
    } catch {
      setLoadError("Could not load messages.");
    }
  }

  async function selectGroup(groupId: number) {
    setSelection({ kind: "group", id: groupId });
    setMessages([]);
    setGroupMessages([]);
    setLoadError(null);
    resetComposer();
    try {
      const response = await fetch(`/api/chat/groups/${groupId}`);
      if (!response.ok) {
        setLoadError("Could not load this team chat.");
        return;
      }
      const body = await response.json();
      setGroupMessages(body.messages ?? []);
      setMembers(body.members ?? []);
      setGroupMuted(Boolean(body.muted));
      await fetch(`/api/chat/groups/${groupId}/read`, { method: "POST" });
      setGroups((list) => list.map((g) => (g.id === groupId ? { ...g, unread_count: 0 } : g)));
    } catch {
      setLoadError("Could not load this team chat.");
    }
  }

  // Deep-linked from a "X sent you a message" notification click
  // (/chat?with=<senderId>) — open straight to that conversation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    if (initialSelectedId !== null) void selectUser(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, groupMessages.length, selection?.id]);

  const isGroup = selection?.kind === "group";
  const canSend = !isGroup ? !chatState.blockedByMe && !chatState.blockedByThem : true;

  async function sendDraft() {
    if (!selection || sending || !canSend) return;
    const body = draft.trim();
    if (!body && !file) return;
    setSendError(null);

    if (file) {
      if (file.size > MAX_FILE_BYTES) {
        setSendError(`Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
        return;
      }
      setSending(true);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("body", body);
        let url = "/api/chat/attachments";
        if (isGroup) url = `/api/chat/groups/${selection.id}/messages`;
        else form.set("recipientId", String(selection.id));
        const response = await fetch(url, { method: "POST", body: form });
        if (!response.ok) {
          setSendError(await parseErrorMessage(response, "Could not send the file."));
          return;
        }
        const sent = await response.json();
        if (isGroup) setGroupMessages((list) => appendUnique(list, sent));
        else setMessages((list) => appendUnique(list, sent));
        resetComposer();
      } catch {
        setSendError("Could not send the file.");
      } finally {
        setSending(false);
      }
      return;
    }

    if (isGroup) {
      setSending(true);
      try {
        const response = await fetch(`/api/chat/groups/${selection.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!response.ok) {
          setSendError(await parseErrorMessage(response, "Could not send the message."));
          return;
        }
        const sent = await response.json();
        setGroupMessages((list) => appendUnique(list, sent));
        resetComposer();
      } catch {
        setSendError("Could not send the message.");
      } finally {
        setSending(false);
      }
      return;
    }

    socketRef.current?.emit(
      "message:send",
      { recipientId: selection.id, body, replyToMessageId: replyingTo?.id },
      (ack?: { error?: string }) => {
        if (ack?.error) setSendError(ack.error);
      },
    );
    resetComposer();
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendDraft();
  }

  // Enter sends, Shift+Enter inserts a newline.
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendDraft();
    }
  }

  function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_FILE_BYTES) {
      setSendError(`"${picked.name}" is too large — files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      event.target.value = "";
      return;
    }
    setSendError(null);
    setFile(picked);
  }

  // Wraps the current selection in markdown markers, like a lightweight B/I toolbar.
  function wrapSelection(marker: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    setDraft(value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length);
    });
  }

  async function toggleMute() {
    if (!selection) return;
    const next = isGroup ? !groupMuted : !chatState.muted;
    try {
      const response = isGroup
        ? await fetch(`/api/chat/groups/${selection.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ muted: next }),
          })
        : await fetch("/api/chat/mute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: selection.id, muted: next }),
          });
      if (!response.ok) {
        toast.error("Could not update mute", await parseErrorMessage(response, "Please try again."));
        return;
      }
      if (isGroup) {
        setGroupMuted(next);
        setGroups((list) => list.map((g) => (g.id === selection.id ? { ...g, muted: next } : g)));
      } else {
        setChatState((s) => ({ ...s, muted: next }));
        setConversations((list) => list.map((c) => (c.counterpart_id === selection.id ? { ...c, muted: next } : c)));
      }
      toast.success(next ? "Chat muted" : "Chat unmuted");
    } catch {
      toast.error("Could not update mute");
    }
  }

  async function confirmAction() {
    if (!selection || !confirm) return;
    setConfirmPending(true);
    setConfirmError(null);
    try {
      if (confirm === "block") {
        const next = !chatState.blockedByMe;
        const response = await fetch("/api/chat/block", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: selection.id, blocked: next }),
        });
        if (!response.ok) {
          setConfirmError(await parseErrorMessage(response, "Could not update the block."));
          return;
        }
        setChatState((s) => ({ ...s, blockedByMe: next }));
        setConversations((list) => list.map((c) => (c.counterpart_id === selection.id ? { ...c, blocked: next } : c)));
        toast.success(next ? "User blocked" : "User unblocked");
      } else {
        const response = await fetch(`/api/chat/groups/${selection.id}`, { method: "DELETE" });
        if (!response.ok) {
          setConfirmError(await parseErrorMessage(response, "Could not leave the team chat."));
          return;
        }
        setGroups((list) => list.filter((g) => g.id !== selection.id));
        setSelection(null);
        toast.success("You left the team chat");
      }
      setConfirm(null);
    } catch {
      setConfirmError("Something went wrong. Please try again.");
    } finally {
      setConfirmPending(false);
    }
  }

  // The roster is capped/searched — but an existing conversation partner
  // must never disappear from the sidebar just because they're outside
  // that window, so union them in (falling back to `#id` if their name
  // hasn't been resolved yet).
  const people = useMemo(() => {
    const byId = new Map(roster.map((u) => [u.id, u]));
    for (const c of conversations) {
      if (!byId.has(c.counterpart_id)) byId.set(c.counterpart_id, { id: c.counterpart_id, name: `#${c.counterpart_id}`, role: "", avatar_url: null });
    }
    return [...byId.values()].filter((u) => u.id !== viewerId);
  }, [roster, conversations, viewerId]);

  type Row = {
    key: string;
    kind: "user" | "group";
    id: number;
    name: string;
    avatarUrl: string | null;
    sub: string;
    lastAt: string | null;
    unread: number;
    muted: boolean;
    preview: string | null;
  };

  const rows: Row[] = useMemo(() => {
    const userRows: Row[] = people.map((u) => {
      const c = conversations.find((x) => x.counterpart_id === u.id);
      return {
        key: `u${u.id}`,
        kind: "user",
        id: u.id,
        name: u.name,
        avatarUrl: u.avatar_url,
        sub: formatRoleLabel(u.role),
        lastAt: c?.last_at ?? null,
        unread: c?.unread_count ?? 0,
        muted: c?.muted ?? false,
        preview: c ? `${c.last_sender_id === viewerId ? "You: " : ""}${c.last_message}` : null,
      };
    });
    const groupRows: Row[] = groups.map((g) => ({
      key: `g${g.id}`,
      kind: "group",
      id: g.id,
      name: g.name,
      avatarUrl: null,
      sub: "Team chat",
      lastAt: g.last_at,
      unread: g.unread_count,
      muted: g.muted,
      preview: g.last_message ? `${g.last_sender_id === viewerId ? "You: " : ""}${g.last_message}` : "No messages yet",
    }));
    const term = search.trim().toLowerCase();
    return [...groupRows, ...userRows]
      .filter((r) => (tab === "teams" ? r.kind === "group" : tab === "unread" ? r.unread > 0 : true))
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [people, conversations, groups, tab, search, viewerId]);

  const totalUnread = conversations.reduce((n, c) => n + c.unread_count, 0) + groups.reduce((n, g) => n + g.unread_count, 0);

  const selectedUser = selection?.kind === "user" ? rosterById.get(selection.id) : undefined;
  const selectedGroup = selection?.kind === "group" ? groups.find((g) => g.id === selection.id) : undefined;
  const muted = isGroup ? groupMuted : chatState.muted;

  // Message list with a date divider whenever the day changes.
  const thread = (isGroup ? groupMessages : messages) as (Message | GroupMessage)[];

  return (
    <div className="flex h-[calc(100vh-17rem)] min-h-[32rem] lg:h-[calc(100vh-14rem)] gap-4">
      {/* ---------- Left: chats ---------- */}
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center gap-1 border-b border-zinc-200 px-4 pt-3">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["teams", "Teams"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
                tab === value ? "border-brand-600 text-brand-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {label}
              {value === "unread" && totalUnread > 0 && (
                <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-semibold text-brand-700">{totalUnread}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people or chats…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <button
            type="button"
            onClick={() => setNewTeamOpen(true)}
            title="New team chat"
            aria-label="New team chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700"
          >
            <i className="ri-group-line" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {rows.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">{tab === "unread" ? "No unread chats." : tab === "teams" ? "No team chats yet." : "No chats found."}</p>}
          {rows.map((row) => {
            const active = selection?.kind === row.kind && selection.id === row.id;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => (row.kind === "group" ? selectGroup(row.id) : selectUser(row.id))}
                className={`mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-brand-50" : "hover:bg-zinc-50"}`}
              >
                {row.kind === "group" ? <GroupAvatar /> : <Avatar name={row.name} imageUrl={row.avatarUrl} size="md" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-900">{row.name}</span>
                    {row.lastAt && <span className="shrink-0 text-[11px] text-zinc-400">{formatMessageTime(row.lastAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-zinc-500">{row.preview ?? row.sub}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {row.muted && <i className="ri-notification-off-line text-xs text-zinc-400" title="Muted" aria-label="Muted" />}
                      {row.unread > 0 && (
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${row.muted ? "bg-zinc-400" : "bg-brand-600"}`}
                        >
                          {row.unread}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ---------- Right: conversation ---------- */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {!selection ? (
          <div className="m-auto flex flex-col items-center gap-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-600">
              <i className="ri-chat-3-line" aria-hidden="true" />
            </span>
            <p className="text-sm text-zinc-500">Select a chat to start messaging, or create a team chat.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {isGroup ? <GroupAvatar size="lg" /> : <Avatar name={selectedUser?.name ?? `#${selection.id}`} imageUrl={selectedUser?.avatar_url} size="md" />}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-zinc-900">{isGroup ? (selectedGroup?.name ?? "Team chat") : (selectedUser?.name ?? `#${selection.id}`)}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {isGroup ? `${members.length} member${members.length === 1 ? "" : "s"}` : formatRoleLabel(selectedUser?.role ?? "")}
                    {muted ? " · Muted" : ""}
                    {!isGroup && chatState.blockedByMe ? " · Blocked" : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <HeaderButton icon={muted ? "ri-notification-off-fill" : "ri-notification-off-line"} label={muted ? "Unmute chat" : "Mute chat"} onClick={() => void toggleMute()} active={muted} />
                {isGroup ? (
                  <>
                    <HeaderButton icon="ri-information-line" label="Members" onClick={() => setInfoOpen(true)} />
                    <HeaderButton
                      icon="ri-logout-box-r-line"
                      label="Leave team chat"
                      onClick={() => {
                        setConfirmError(null);
                        setConfirm("leave");
                      }}
                    />
                  </>
                ) : (
                  <HeaderButton
                    icon="ri-forbid-2-line"
                    label={chatState.blockedByMe ? "Unblock user" : "Block user"}
                    active={chatState.blockedByMe}
                    onClick={() => {
                      setConfirmError(null);
                      setConfirm("block");
                    }}
                  />
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-zinc-50/60 px-5 py-4">
              {loadError && (
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
              )}
              {thread.length === 0 && !loadError && <p className="text-center text-sm text-zinc-500">No messages yet. Say hello.</p>}
              <div className="flex flex-col gap-3">
                {thread.map((message, index) => {
                  const day = dayLabel(message.created_at);
                  const showDay = index === 0 || dayLabel(thread[index - 1].created_at) !== day;
                  const isMine = message.sender_id === viewerId;
                  const direct = !isGroup ? (message as Message) : null;
                  const senderName = isGroup ? (message as GroupMessage).sender_name : selectedUser?.name;
                  const senderAvatar = isGroup ? null : selectedUser?.avatar_url;
                  const quoted = direct?.reply_to_message_id ? messages.find((m) => m.id === direct.reply_to_message_id) : undefined;
                  return (
                    <div key={message.id} className="flex flex-col gap-3">
                      {showDay && (
                        <div className="flex justify-center">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-200">{day}</span>
                        </div>
                      )}
                      <div className={`group flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine && <Avatar name={senderName ?? "?"} imageUrl={senderAvatar} size="sm" />}
                        {isMine && direct && (
                          <button type="button" onClick={() => setReplyingTo(direct)} title="Reply" className="rounded p-1 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-600 focus:opacity-100 group-hover:opacity-100">
                            <i className="ri-reply-line text-sm" aria-hidden="true" />
                          </button>
                        )}
                        <div className={`flex max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                          {isGroup && !isMine && <span className="mb-0.5 px-1 text-xs font-medium text-zinc-500">{senderName}</span>}
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                              isMine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-200"
                            }`}
                          >
                            {direct?.reply_to_message_id && (
                              <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${isMine ? "border-white/60 bg-white/15 text-white/90" : "border-brand-300 bg-zinc-100 text-zinc-600"}`}>
                                {quoted ? quoted.body || quoted.attachment_name || "Attachment" : "Original message"}
                              </div>
                            )}
                            {message.body && <FormattedText text={message.body} />}
                            <FileCard message={message} mine={isMine} />
                            <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isMine ? "text-white/70" : "text-zinc-400"}`}>
                              {formatMessageTime(message.created_at)}
                              {isMine && direct && <MessageTicks message={direct} />}
                            </p>
                          </div>
                        </div>
                        {!isMine && direct && (
                          <button type="button" onClick={() => setReplyingTo(direct)} title="Reply" className="rounded p-1 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-600 focus:opacity-100 group-hover:opacity-100">
                            <i className="ri-reply-line text-sm" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            {replyingTo && (
              <div className="flex items-start justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-600">Replying to {replyingTo.sender_id === viewerId ? "yourself" : (selectedUser?.name ?? "them")}</p>
                  <p className="truncate text-zinc-500">{replyingTo.body || replyingTo.attachment_name}</p>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600">
                  <i className="ri-close-line text-sm" aria-hidden="true" />
                </button>
              </div>
            )}

            {!canSend ? (
              <p className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-center text-sm text-zinc-500">
                {chatState.blockedByMe ? "You blocked this user. Unblock them to send messages." : "You can't message this user."}
              </p>
            ) : (
              <form onSubmit={handleSend} className="border-t border-zinc-200 p-4">
                {file && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${fileKind(file.name).tone}`}>
                      <i className={fileKind(file.name).icon} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{file.name}</span>
                      <span className="block text-xs text-zinc-500">{formatBytes(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label="Remove file"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
                    >
                      <i className="ri-close-line" aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="rounded-2xl border border-zinc-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
                  <div className="flex items-end gap-2 px-3 pt-2">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      maxLength={MAX_MESSAGE_CHARS}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={file ? "Add a caption…" : "Type a message…"}
                      className="max-h-32 min-h-[2.5rem] w-full resize-none py-2 text-sm text-zinc-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || (!draft.trim() && !file)}
                      aria-label="Send"
                      className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <i className={sending ? "ri-loader-4-line animate-spin" : "ri-send-plane-fill"} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 px-3 pb-2">
                    {[
                      ["**", "ri-bold", "Bold"],
                      ["*", "ri-italic", "Italic"],
                      ["`", "ri-code-line", "Code"],
                    ].map(([marker, icon, label]) => (
                      <button key={label} type="button" onClick={() => wrapSelection(marker)} title={label} className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700">
                        <i className={icon} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
                {sendError && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {sendError}
                  </p>
                )}
              </form>
            )}
          </>
        )}
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm === "leave" ? `Leave ${selectedGroup?.name ?? "this team chat"}?` : chatState.blockedByMe ? `Unblock ${selectedUser?.name ?? "this user"}?` : `Block ${selectedUser?.name ?? "this user"}?`}
          description={
            confirm === "leave"
              ? "You will stop receiving its messages. The creator can add you back."
              : chatState.blockedByMe
                ? "They will be able to message you again."
                : "Neither of you will be able to send messages in this chat until you unblock them."
          }
          error={confirmError}
          confirmLabel={confirm === "leave" ? "Leave" : chatState.blockedByMe ? "Unblock" : "Block"}
          pendingLabel="Please wait…"
          pending={confirmPending}
          tone={confirm === "block" && chatState.blockedByMe ? "brand" : "danger"}
          onConfirm={() => void confirmAction()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {newTeamOpen && (
        <NewTeamModal
          people={people}
          onClose={() => setNewTeamOpen(false)}
          onCreated={async (groupId) => {
            setNewTeamOpen(false);
            await refreshLists();
            await selectGroup(groupId);
          }}
        />
      )}

      {infoOpen && selection?.kind === "group" && selectedGroup && (
        <MembersModal
          group={selectedGroup}
          members={members}
          people={people}
          viewerId={viewerId}
          onClose={() => setInfoOpen(false)}
          onAdded={async () => {
            await selectGroup(selectedGroup.id);
          }}
        />
      )}
    </div>
  );
}

function NewTeamModal({ people, onClose, onCreated }: { people: RosterUser[]; onClose: () => void; onCreated: (groupId: number) => Promise<void> }) {
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the team chat a name.");
    if (memberIds.length === 0) return setError("Pick at least one member.");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), memberIds }),
      });
      if (!response.ok) {
        setError(await parseErrorMessage(response, "Could not create the team chat."));
        setSaving(false);
        return;
      }
      const { id } = await response.json();
      toast.success("Team chat created", name.trim());
      await onCreated(id);
    } catch {
      setError("Could not create the team chat.");
      setSaving(false);
    }
  }

  return (
    <Modal title="New team chat" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamName" className="text-sm font-medium text-zinc-700">
            Team name
          </label>
          <input
            id="teamName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="e.g. Sales team"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamMembers" className="text-sm font-medium text-zinc-700">
            Members
          </label>
          <MultiSelectSearch
            id="teamMembers"
            options={people.map((u) => ({ id: u.id, name: u.name, description: formatRoleLabel(u.role) }))}
            selectedIds={memberIds}
            onChange={setMemberIds}
            placeholder="Search people…"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  group,
  members,
  people,
  viewerId,
  onClose,
  onAdded,
}: {
  group: Group;
  members: GroupMember[];
  people: RosterUser[];
  viewerId: number;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const isCreator = group.created_by === viewerId;
  const [addIds, setAddIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const memberIds = new Set(members.map((m) => m.user_id));

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/groups/${group.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addUserIds: addIds }),
      });
      if (!response.ok) {
        setError(await parseErrorMessage(response, "Could not add members."));
        return;
      }
      setAddIds([]);
      await onAdded();
      toast.success("Members added");
    } catch {
      setError("Could not add members.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={group.name} onClose={onClose}>
      <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">{members.length} members</p>
      <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Avatar name={m.name} imageUrl={m.avatar_url} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-900">
                {m.name}
                {m.user_id === viewerId ? " (you)" : ""}
              </span>
              <span className="block text-xs text-zinc-500">{formatRoleLabel(m.role)}</span>
            </span>
            {m.user_id === group.created_by && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">Creator</span>}
          </li>
        ))}
      </ul>
      {isCreator && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4">
          <label htmlFor="addMembers" className="text-sm font-medium text-zinc-700">
            Add members
          </label>
          <MultiSelectSearch
            id="addMembers"
            options={people.filter((u) => !memberIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, description: formatRoleLabel(u.role) }))}
            selectedIds={addIds}
            onChange={setAddIds}
            placeholder="Search people…"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void add()}
            disabled={saving || addIds.length === 0}
            className="self-end rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </Modal>
  );
}
