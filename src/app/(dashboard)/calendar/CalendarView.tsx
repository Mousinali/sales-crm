"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import RefreshButton from "@/components/ui/RefreshButton";
import RichTextField, { FormattedText } from "@/components/ui/RichTextField";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
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

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The events list is fetched in full (it also drives the month grid above),
// so the "All events" table filters and paginates client-side rather than
// adding a paginated query this view would be the only caller of.
const EVENTS_PAGE_SIZE = 10;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Always returns full weeks (a multiple of 7 days) spanning the month, so
// the grid can be split into even rows without a ragged last week.
function buildMonthCells(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => new Date(year, month, i - firstWeekday + 1));
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
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
  const debouncedRosterSearch = useDebouncedValue(rosterSearch, 300);
  useEffect(() => {
    const trimmed = debouncedRosterSearch.trim();
    // Below 3 characters, the client-side filter on the roster already
    // fetched (below) is enough — querying the server on every keystroke
    // from "a" onward would mostly just re-fetch the same broad result.
    if (trimmed.length > 0 && trimmed.length < 3) return;

    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
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
  }, [debouncedRosterSearch]);
  const rosterById = new Map(roster.map((u) => [u.id, u]));
  const rosterSearchLower = rosterSearch.trim().toLowerCase();
  const filteredRoster = roster.filter(
    (u) => u.id !== viewerId && (!rosterSearchLower || u.name.toLowerCase().includes(rosterSearchLower)),
  );

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
  const [descriptionEvent, setDescriptionEvent] = useState<CalendarEvent | null>(null);

  const [eventsSearch, setEventsSearch] = useState("");
  const [eventsTypeFilter, setEventsTypeFilter] = useState<CalendarEventType | "ALL">("ALL");
  const [eventsPage, setEventsPage] = useState(1);
  const filteredEvents = events.filter(
    (event) =>
      event.title.toLowerCase().includes(eventsSearch.trim().toLowerCase()) &&
      (eventsTypeFilter === "ALL" || event.type === eventsTypeFilter),
  );
  const eventsTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE));
  const pageEvents = filteredEvents.slice((eventsPage - 1) * EVENTS_PAGE_SIZE, eventsPage * EVENTS_PAGE_SIZE);

  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const monthWeeks = chunk(buildMonthCells(monthStart), 7);
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(new Date(event.starts_at));
    const list = eventsByDay.get(key) ?? [];
    list.push(event);
    eventsByDay.set(key, list);
  }

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

  function openCreateForDate(date: Date) {
    openCreate();
    const prefilled = new Date(date);
    prefilled.setHours(9, 0, 0, 0);
    setStartsAt(toLocalInputValue(prefilled));
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

  useAutoRefresh(() => {
    void refetchEvents();
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <i className="ri-arrow-left-s-line text-lg" aria-hidden="true" />
            </button>
            <h2 className="text-base font-semibold text-zinc-900">
              {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <button
              type="button"
              onClick={() => setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <i className="ri-arrow-right-s-line text-lg" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refetchEvents} />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-1 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-add-line text-base" aria-hidden="true" />
              New event
            </button>
          </div>
        </div>

        {listError && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {listError}
          </p>
        )}

        <div className="overflow-hidden rounded-md border border-zinc-200">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-2 text-center">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-zinc-200">
            {monthWeeks.flat().map((date, i) => {
              const inMonth = date.getMonth() === monthStart.getMonth();
              const isToday = dateKey(date) === dateKey(new Date());
              const dayEvents = eventsByDay.get(dateKey(date)) ?? [];
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  data-testid={isToday ? "today-cell" : undefined}
                  onClick={() => openCreateForDate(date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openCreateForDate(date);
                  }}
                  className={`flex min-h-24 flex-col gap-1 p-1.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-400 ${
                    inMonth ? "bg-white hover:bg-zinc-50" : "bg-zinc-50/60 hover:bg-zinc-50"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-brand-500 font-semibold text-white"
                        : inMonth
                          ? "text-zinc-700"
                          : "text-zinc-400"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-col gap-1">
                    {visible.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(event);
                        }}
                        className={`truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${TYPE_BADGE_CLASSES[event.type]}`}
                      >
                        {event.title}
                      </button>
                    ))}
                    {/* shortcut: "+N more" is static, not a day-detail popover; upgrade if days routinely exceed 3 events */}
                    {overflow > 0 && <span className="px-1.5 text-[11px] text-zinc-400">+{overflow} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">All events</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="text"
                value={eventsSearch}
                onChange={(event) => {
                  setEventsSearch(event.target.value);
                  setEventsPage(1);
                }}
                placeholder="Search by title…"
                aria-label="Search events by title"
                className="rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <select
              value={eventsTypeFilter}
              onChange={(event) => {
                setEventsTypeFilter(event.target.value as CalendarEventType | "ALL");
                setEventsPage(1);
              }}
              aria-label="Filter by type"
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="ALL">All types</option>
              {CALENDAR_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-responsive min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                <th scope="col" className="px-4 py-3 text-left">
                  Title
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  When
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  Invited
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    {events.length === 0 ? "No events found." : "No events match your search."}
                  </td>
                </tr>
              )}
              {pageEvents.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-zinc-50/80">
                  <td data-label="Title" className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-zinc-900">{event.title}</p>
                      {event.description && (
                        <button
                          type="button"
                          onClick={() => setDescriptionEvent(event)}
                          aria-label="View description"
                          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                        >
                          <i className="ri-information-line text-sm" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td data-label="When" className="px-4 py-3 text-zinc-600">{new Date(event.starts_at).toLocaleString("en-US")}</td>
                  <td data-label="Type" className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE_CLASSES[event.type]}`}
                    >
                      {TYPE_LABELS[event.type]}
                    </span>
                  </td>
                  <td data-label="Invited" data-stack="true" className="px-4 py-3 text-zinc-600">
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
                              className="w-32 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-900 focus:border-brand-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => respond(event.id, { remarks: (responseDrafts[event.id] ?? "").trim() })}
                              disabled={!(responseDrafts[event.id] ?? "").trim()}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td data-label="" data-stack="true" className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(event)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
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
        <Pagination page={eventsPage} totalPages={eventsTotalPages} total={filteredEvents.length} onChange={setEventsPage} />
      </div>

      {descriptionEvent && (
        <Modal title={descriptionEvent.title} onClose={() => setDescriptionEvent(null)}>
          <FormattedText text={descriptionEvent.description ?? ""} className="text-sm text-zinc-600" />
        </Modal>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">{editingId ? "Edit event" : "New event"}</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="eventTitle" className="text-sm font-medium text-zinc-700">
                  Title
                </label>
                <input
                  id="eventTitle"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="eventDescription" className="text-sm font-medium text-zinc-700">
                  Description
                </label>
                <RichTextField id="eventDescription" value={description} onChange={setDescription} />
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {CALENDAR_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="attendeeSearch" className="text-sm font-medium text-zinc-700">
                  Invite
                </label>
                <input
                  id="attendeeSearch"
                  type="text"
                  value={rosterSearch}
                  onChange={(event) => setRosterSearch(event.target.value)}
                  placeholder="Search people by name..."
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <div className="max-h-36 overflow-y-auto rounded-md border border-zinc-300 p-2">
                  {filteredRoster.length === 0 && (
                    <p className="px-1 py-1 text-sm text-zinc-500">No matching people.</p>
                  )}
                  {filteredRoster.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggleAttendee(u.id)} />
                      {u.name} <span className="text-xs text-zinc-400">({formatRoleLabel(u.role)})</span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <p role="alert" className="text-sm text-red-600 sm:col-span-2">
                  {formError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
