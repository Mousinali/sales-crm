"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import RefreshButton from "@/components/ui/RefreshButton";
import Pagination from "@/components/ui/Pagination";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

// listAnnouncements has no server-side paging of its own, so this slices
// the already-fetched array client-side rather than adding a query param
// this view is the only caller of.
const PAGE_SIZE = 20;

type Announcement = {
  id: number;
  subject: string;
  body: string;
  created_at: string;
  recipientStatusCounts: Record<string, number>;
};

type RecipientGroupType = "ALL_PRE_SALES" | "ALL_SALESPEOPLE" | "SPECIFIC";

const GROUP_BUTTONS: { type: RecipientGroupType; label: string }[] = [
  { type: "ALL_PRE_SALES", label: "All Pre-sales" },
  { type: "ALL_SALESPEOPLE", label: "All Salespeople" },
  { type: "SPECIFIC", label: "Choose specific users" },
];

export default function AnnouncementsView({ initialAnnouncements }: { initialAnnouncements: Announcement[] }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [recipientOptions, setRecipientOptions] = useState<{ id: number; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(announcements.length / PAGE_SIZE));
  const pageAnnouncements = announcements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Only the "Choose specific users" picker inside the New Announcement
  // modal needs this roster — deferred to when that modal actually opens,
  // instead of fetching it for everyone who merely visits this page.
  const recipientRosterLoaded = useRef(false);
  function loadRecipientRoster() {
    if (recipientRosterLoaded.current) return;
    recipientRosterLoaded.current = true;
    Promise.all([
      fetch("/api/users?role=PRE_SALES&status=ACTIVE").then((r) => (r.ok ? r.json() : { users: [] })),
      fetch("/api/users?role=SALESPERSON&status=ACTIVE").then((r) => (r.ok ? r.json() : { users: [] })),
    ])
      .then(([ps, sp]) => setRecipientOptions([...(ps.users ?? []), ...(sp.users ?? [])]))
      .catch(() => {});
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [groupType, setGroupType] = useState<RecipientGroupType>("ALL_PRE_SALES");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  function openCreate() {
    loadRecipientRoster();
    setSubject("");
    setBody("");
    setGroupType("ALL_PRE_SALES");
    setSelectedUserIds([]);
    setSendError(null);
    setSendSuccess(false);
    setCreateOpen(true);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setSendError("Enter a subject and a message.");
      return;
    }
    if (groupType === "SPECIFIC" && selectedUserIds.length === 0) {
      setSendError("Select at least one recipient.");
      return;
    }

    const recipientGroup =
      groupType === "ALL_PRE_SALES"
        ? { type: "ALL_PRE_SALES" as const }
        : groupType === "ALL_SALESPEOPLE"
          ? { type: "ALL_SALESPEOPLE" as const }
          : selectedUserIds.length === 1
            ? { type: "USER" as const, userId: selectedUserIds[0] }
            : { type: "USERS" as const, userIds: selectedUserIds };

    setSending(true);
    setSendError(null);
    try {
      const response = await fetch("/api/email-announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), recipientGroup }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not send the announcement.");
        setSendError(message);
        toast.error("Could not send announcement", message);
        setSending(false);
        return;
      }
      const created: Announcement = await response.json();
      setAnnouncements((current) => [created, ...current]);
      toast.success("Announcement sent", subject.trim());
      setSending(false);
      setSendSuccess(true);
    } catch {
      setSendError("Could not send the announcement.");
      toast.error("Could not send announcement");
      setSending(false);
    }
  }

  async function refetchAnnouncements() {
    const response = await fetch("/api/email-announcements");
    if (!response.ok) {
      toast.error("Could not refresh announcements");
      return;
    }
    const body = await response.json();
    setAnnouncements(body.announcements ?? []);
  }

  useAutoRefresh(() => {
    void refetchAnnouncements();
  });

  async function retryFailed(announcementId: number) {
    const response = await fetch(`/api/email-announcements/${announcementId}/retry`, { method: "POST" });
    if (!response.ok) {
      toast.error("Could not retry delivery", await parseErrorMessage(response, "Could not retry delivery."));
      return;
    }
    await refetchAnnouncements();
    toast.success("Retrying delivery");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Sent announcements</h2>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refetchAnnouncements} />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-add-line text-base" aria-hidden="true" />
              New Announcement
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                <th scope="col" className="px-4 py-3 text-left">
                  Subject
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Sent
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Delivery
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {announcements.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No announcements sent yet.
                  </td>
                </tr>
              )}
              {pageAnnouncements.map((a) => {
                const sent = a.recipientStatusCounts.SENT ?? 0;
                const failed = a.recipientStatusCounts.FAILED ?? 0;
                return (
                  <tr key={a.id} className="transition-colors hover:bg-zinc-50/80">
                    <td data-label="Subject" className="px-4 py-3 font-medium text-zinc-900">{a.subject}</td>
                    <td data-label="Sent" className="px-4 py-3 text-zinc-600">{new Date(a.created_at).toLocaleString("en-US")}</td>
                    <td data-label="Delivery" className="px-4 py-3 text-zinc-600">
                      {sent} sent{failed > 0 ? `, ${failed} failed` : ""}
                    </td>
                    <td data-label="" className="px-4 py-3 text-right">
                      {failed > 0 && (
                        <button
                          type="button"
                          onClick={() => retryFailed(a.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                        >
                          Retry failed
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={announcements.length} onChange={setPage} />
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">New announcement</h2>
            {sendSuccess ? (
              <div>
                <p role="status" className="mb-4 text-sm text-emerald-700">
                  Announcement sent.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSend} className="flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="announcementSubject" className="text-sm font-medium text-zinc-700">
                    Subject
                  </label>
                  <input
                    id="announcementSubject"
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="announcementBody" className="text-sm font-medium text-zinc-700">
                    Message
                  </label>
                  <textarea
                    id="announcementBody"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={4}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">Recipients</span>
                  <div className="flex flex-wrap gap-2">
                    {GROUP_BUTTONS.map((g) => (
                      <button
                        key={g.type}
                        type="button"
                        onClick={() => setGroupType(g.type)}
                        aria-pressed={groupType === g.type}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                          groupType === g.type
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {groupType === "SPECIFIC" && (
                    <MultiSelectSearch
                      id="announcementRecipients"
                      options={recipientOptions}
                      selectedIds={selectedUserIds}
                      onChange={setSelectedUserIds}
                      placeholder="Search Pre-sales/Salespeople…"
                    />
                  )}
                </div>

                {sendError && (
                  <p role="alert" className="text-sm text-red-600">
                    {sendError}
                  </p>
                )}

                <div className="mt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
