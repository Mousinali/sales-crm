"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import RefreshButton from "@/app/(dashboard)/RefreshButton";
import { CALENDAR_EVENT_TYPES, type AttendeeStatus, type CalendarEventAttendee, type CalendarEventType } from "@/lib/calendar/types";

type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  type: CalendarEventType;
  starts_at: string;
  created_by: number;
  attendees: CalendarEventAttendee[];
};

type RosterUser = { id: number; name: string; role: string };

const TYPE_LABELS: Record<CalendarEventType, string> = {
  MEETING: "Meeting",
  FOLLOW_UP: "Follow up",
  OTHER: "Other",
};

const TYPE_BADGE_CLASSES: Record<CalendarEventType, string> = {
  MEETING: "bg-sky-50 text-sky-700",
  FOLLOW_UP: "bg-amber-50 text-amber-700",
  OTHER: "bg-zinc-100 text-zinc-600",
};

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export default function CalendarView({ initialEvents, viewerId }: { initialEvents: CalendarEvent[]; viewerId: number }) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [listError, setListError] = useState<string | null>(null);

  // The roster endpoint caps results (it's a picker, not a paginated
  // table) and expects `q` to narrow once there are more users than fit in
  // one page. Results are merged in, not replaced, so a name already
  // resolved (e.g. an existing attendee found by an earlier search) stays
  // resolvable even after the search term changes again.
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

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CalendarEventType>("MEETING");
  const [startsAt, setStartsAt] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<number, string>>({});

  function toggleAttendee(userId: number) {
    setAttendeeIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function applyAttendeeUpdate(eventId: number, updated: CalendarEventAttendee) {
    setEvents((current) =>
      current.map((e) =>
        e.id === eventId ? { ...e, attendees: e.attendees.map((a) => (a.user_id === updated.user_id ? updated : a)) } : e,
      ),
    );
  }

  async function respond(eventId: number, body: { status?: AttendeeStatus; remarks?: string }) {
    const response = await fetch(`/api/calendar/${eventId}/respond`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      toast.error("Could not update your response", await parseErrorMessage(response, "Could not update your response."));
      return;
    }
    const updated: CalendarEventAttendee = await response.json();
    applyAttendeeUpdate(eventId, updated);
    toast.success("Response saved");
  }

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setType("MEETING");
    setStartsAt("");
    setAttendeeIds([]);
    setRosterSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditingId(event.id);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setType(event.type);
    setStartsAt(event.starts_at.slice(0, 16));
    setAttendeeIds(event.attendees.map((a) => a.user_id));
    setRosterSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!title.trim() || !startsAt) {
      setFormError("Enter a title and a date/time.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      startsAt: new Date(startsAt).toISOString(),
      attendeeUserIds: attendeeIds,
    };
    try {
      const response = editingId
        ? await fetch(`/api/calendar/${editingId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/calendar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save the event.");
        setFormError(message);
        toast.error("Could not save event", message);
        setSaving(false);
        return;
      }
      const saved: CalendarEvent = await response.json();
      setEvents((current) =>
        (editingId ? current.map((e) => (e.id === saved.id ? saved : e)) : [...current, saved]).sort((a, b) =>
          a.starts_at.localeCompare(b.starts_at),
        ),
      );
      toast.success(editingId ? "Event updated" : "Event created", saved.title);
      setSaving(false);
      setFormOpen(false);
    } catch {
      setFormError("Could not save the event.");
      toast.error("Could not save event");
      setSaving(false);
    }
  }

  async function handleDelete(eventId: number) {
    setListError(null);
    try {
      const response = await fetch(`/api/calendar/${eventId}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not delete the event.");
        setListError(message);
        toast.error("Could not delete event", message);
        return;
      }
      setEvents((current) => current.filter((e) => e.id !== eventId));
      toast.success("Event deleted");
    } catch {
      setListError("Could not delete the event.");
      toast.error("Could not delete event");
    }
  }

  async function refetchEvents() {
    setListError(null);
    try {
      const response = await fetch("/api/calendar");
      if (!response.ok) {
        setListError(await parseErrorMessage(response, "Could not load events."));
        return;
      }
      const body = await response.json();
      setEvents(body.events ?? []);
    } catch {
      setListError("Could not load events.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-end gap-2 border-b border-zinc-200 p-4">
          <RefreshButton onRefresh={refetchEvents} />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
          >
            <i className="ri-add-line text-base" aria-hidden="true" />
            New event
          </button>
        </div>

        {listError && (
          <p role="alert" className="px-4 pt-4 text-sm text-red-600">
            {listError}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Title
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  When
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-600">
                  Invited
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No events found.
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{event.title}</p>
                    {event.description && <p className="text-xs text-zinc-500">{event.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{new Date(event.starts_at).toLocaleString("en-US")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE_CLASSES[event.type]}`}
                    >
                      {TYPE_LABELS[event.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {event.attendees.length === 0 ? (
                      "—"
                    ) : (
                      <div className="flex flex-col gap-1">
                        {event.attendees.map((a) => (
                          <div key={a.user_id} className="text-xs">
                            <span className={a.status === "COMPLETED" ? "text-emerald-700" : "text-zinc-600"}>
                              {rosterById.get(a.user_id)?.name ?? `#${a.user_id}`}
                              {a.status === "COMPLETED" && " ✓"}
                            </span>
                            {a.remarks && <p className="text-zinc-400">&ldquo;{a.remarks}&rdquo;</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const mine = event.attendees.find((a) => a.user_id === viewerId);
                      if (!mine) return null;
                      return (
                        <div className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2">
                          <label className="flex items-center gap-1.5 text-xs text-zinc-700">
                            <input
                              type="checkbox"
                              checked={mine.status === "COMPLETED"}
                              onChange={(e) => respond(event.id, { status: e.target.checked ? "COMPLETED" : "PENDING" })}
                            />
                            Mark my part complete
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Your remark/concern..."
                              value={responseDrafts[event.id] ?? mine.remarks ?? ""}
                              onChange={(e) => setResponseDrafts((current) => ({ ...current, [event.id]: e.target.value }))}
                              className="w-32 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => respond(event.id, { remarks: (responseDrafts[event.id] ?? "").trim() })}
                              disabled={!(responseDrafts[event.id] ?? "").trim()}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(event)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        Edit
                      </button>
                      {event.created_by === viewerId && (
                        <button
                          type="button"
                          onClick={() => handleDelete(event.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">{editingId ? "Edit event" : "New event"}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="eventTitle" className="text-sm font-medium text-zinc-700">
                  Title
                </label>
                <input
                  id="eventTitle"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="eventDescription" className="text-sm font-medium text-zinc-700">
                  Description
                </label>
                <textarea
                  id="eventDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="eventStartsAt" className="text-sm font-medium text-zinc-700">
                  Date &amp; time
                </label>
                <input
                  id="eventStartsAt"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="eventType" className="text-sm font-medium text-zinc-700">
                  Type
                </label>
                <select
                  id="eventType"
                  value={type}
                  onChange={(event) => setType(event.target.value as CalendarEventType)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {CALENDAR_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="attendeeSearch" className="text-sm font-medium text-zinc-700">
                  Invite
                </label>
                <input
                  id="attendeeSearch"
                  type="text"
                  value={rosterSearch}
                  onChange={(event) => setRosterSearch(event.target.value)}
                  placeholder="Search people by name..."
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <div className="max-h-36 overflow-y-auto rounded-md border border-zinc-300 p-2">
                  {roster.filter((u) => u.id !== viewerId).length === 0 && (
                    <p className="px-1 py-1 text-sm text-zinc-500">No other users yet.</p>
                  )}
                  {roster
                    .filter((u) => u.id !== viewerId)
                    .map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggleAttendee(u.id)} />
                      {u.name} <span className="text-xs text-zinc-400">({u.role})</span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingId ? "Save" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
