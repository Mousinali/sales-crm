"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LeadRow, LeadPriority } from "@/lib/leads/types";
import { LEAD_PRIORITIES } from "@/lib/leads/types";
import type { LeadActivityRow, LeadActivityType } from "@/lib/leads/activities";
import type { Role } from "@/lib/auth/roles";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_BADGE_CLASSES,
} from "@/app/(dashboard)/leadDisplay";

type ReviewAction = "QUALIFY" | "REJECT" | "RETURN";
type SimpleUser = { id: number; name: string };

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export default function LeadDetailView({
  lead: initialLead,
  activities: initialActivities,
  viewerRole,
  viewerId,
}: {
  lead: LeadRow;
  activities: LeadActivityRow[];
  viewerRole: Role;
  viewerId: number;
}) {
  const [lead, setLead] = useState<LeadRow>(initialLead);
  const [activities, setActivities] = useState<LeadActivityRow[]>(initialActivities);

  async function refreshActivities() {
    const response = await fetch(`/api/leads/${lead.id}/activities`);
    if (response.ok) {
      const body = await response.json();
      setActivities(body.activities ?? []);
    }
  }

  const canEdit =
    viewerRole === "MARKETING_HEAD" ||
    (viewerRole === "PRE_SALES" && (lead.pre_sales_owner_id === viewerId || lead.created_by === viewerId));
  const canReview =
    viewerRole === "MARKETING_HEAD" && (lead.status === "PENDING_REVIEW" || lead.status === "MORE_INFO_REQUIRED");
  const canAssign = viewerRole === "MARKETING_HEAD" && (lead.status === "QUALIFIED" || lead.status === "CONVERTED");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [contactPerson, setContactPerson] = useState(lead.contact_person ?? "");
  const [phone, setPhone] = useState(lead.phone);
  const [email, setEmail] = useState(lead.email ?? "");
  const [website, setWebsite] = useState(lead.website ?? "");
  const [serviceRequirements, setServiceRequirements] = useState(lead.service_requirements);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setContactPerson(lead.contact_person ?? "");
    setPhone(lead.phone);
    setEmail(lead.email ?? "");
    setWebsite(lead.website ?? "");
    setServiceRequirements(lead.service_requirements);
    setNotes(lead.notes ?? "");
    setPriority(lead.priority);
    setEditError(null);
    setEditOpen(true);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim(),
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          serviceRequirements: serviceRequirements.trim(),
          notes: notes.trim() || undefined,
          priority,
        }),
      });
      if (!response.ok) {
        setEditError(await parseErrorMessage(response, "Could not save changes."));
        setSaving(false);
        return;
      }
      setLead((current) => ({
        ...current,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        website: website.trim() || null,
        service_requirements: serviceRequirements.trim(),
        notes: notes.trim() || null,
        priority,
      }));
      setSaving(false);
      setEditOpen(false);
    } catch {
      setEditError("Could not save changes.");
      setSaving(false);
    }
  }

  // Review (qualify/reject/return)
  const [reviewPrompt, setReviewPrompt] = useState<ReviewAction | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  function startReview(action: ReviewAction) {
    setReviewError(null);
    setReviewReason("");
    if (action === "QUALIFY") {
      void submitReview(action);
    } else {
      setReviewPrompt(action);
    }
  }

  async function submitReview(action: ReviewAction, reason?: string) {
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!response.ok) {
        setReviewError(await parseErrorMessage(response, "Could not update the lead's status."));
        setReviewSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      setReviewSubmitting(false);
      setReviewPrompt(null);
    } catch {
      setReviewError("Could not update the lead's status.");
      setReviewSubmitting(false);
    }
  }

  function confirmReviewPrompt() {
    if (!reviewPrompt) return;
    if (!reviewReason.trim()) {
      setReviewError(`A reason is required to ${reviewPrompt === "REJECT" ? "reject" : "return"} a lead`);
      return;
    }
    void submitReview(reviewPrompt, reviewReason.trim());
  }

  // Assignment
  const [preSalesOptions, setPreSalesOptions] = useState<SimpleUser[]>([]);
  const [salespersonOptions, setSalespersonOptions] = useState<SimpleUser[]>([]);
  const [selectedPreSales, setSelectedPreSales] = useState<string>("");
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  useEffect(() => {
    if (!canAssign) return;
    fetch("/api/users?role=PRE_SALES")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setPreSalesOptions(body.users ?? []))
      .catch(() => {});
    fetch("/api/users?role=SALESPERSON")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setSalespersonOptions(body.users ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssign]);

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPreSales && !selectedSalesperson) {
      setAssignError("Choose a Pre-sales owner or a Salesperson.");
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preSalesOwnerId: selectedPreSales ? Number(selectedPreSales) : undefined,
          salespersonId: selectedSalesperson ? Number(selectedSalesperson) : undefined,
        }),
      });
      if (!response.ok) {
        setAssignError(await parseErrorMessage(response, "Could not assign the lead."));
        setAssignSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      setAssignSubmitting(false);
    } catch {
      setAssignError("Could not assign the lead.");
      setAssignSubmitting(false);
    }
  }

  // Activity timeline
  const [activityType, setActivityType] = useState<Exclude<LeadActivityType, "STATUS_CHANGE" | "ASSIGNMENT">>("NOTE");
  const [activityNotes, setActivityNotes] = useState("");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loggingActivity, setLoggingActivity] = useState(false);

  async function handleActivitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activityNotes.trim()) {
      setActivityError("Enter a note before logging the activity.");
      return;
    }
    setLoggingActivity(true);
    setActivityError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: activityType, notes: activityNotes.trim() }),
      });
      if (!response.ok) {
        setActivityError(await parseErrorMessage(response, "Could not log the activity."));
        setLoggingActivity(false);
        return;
      }
      await refreshActivities();
      setActivityNotes("");
      setLoggingActivity(false);
    } catch {
      setActivityError("Could not log the activity.");
      setLoggingActivity(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{lead.company_name}</h1>
            <p className="text-sm text-zinc-500">{lead.contact_person}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_BADGE_CLASSES[lead.status]}`}
            >
              {LEAD_STATUS_LABELS[lead.status]}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_PRIORITY_BADGE_CLASSES[lead.priority]}`}
            >
              {LEAD_PRIORITY_LABELS[lead.priority]}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-zinc-900">{lead.phone}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-zinc-900">{lead.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Website</dt>
            <dd className="text-zinc-900">{lead.website ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Service requirements</dt>
            <dd className="text-zinc-900">{lead.service_requirements}</dd>
          </div>
          {lead.notes && (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Notes</dt>
              <dd className="text-zinc-900">{lead.notes}</dd>
            </div>
          )}
          {lead.status_reason && (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Status reason</dt>
              <dd className="text-zinc-900">{lead.status_reason}</dd>
            </div>
          )}
        </dl>

        {canReview && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4">
            <button
              type="button"
              onClick={() => startReview("QUALIFY")}
              disabled={reviewSubmitting}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Qualify
            </button>
            <button
              type="button"
              onClick={() => startReview("REJECT")}
              disabled={reviewSubmitting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => startReview("RETURN")}
              disabled={reviewSubmitting}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Return for more info
            </button>
            {reviewError && !reviewPrompt && (
              <p role="alert" className="w-full text-sm text-red-600">
                {reviewError}
              </p>
            )}
          </div>
        )}
      </div>

      {canAssign && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Assignment</h2>
          <form onSubmit={handleAssignSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preSalesOwner" className="text-sm font-medium text-zinc-700">
                Pre-sales owner
              </label>
              <select
                id="preSalesOwner"
                value={selectedPreSales}
                onChange={(event) => setSelectedPreSales(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Unchanged</option>
                {preSalesOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="salesperson" className="text-sm font-medium text-zinc-700">
                Salesperson
              </label>
              <select
                id="salesperson"
                value={selectedSalesperson}
                onChange={(event) => setSelectedSalesperson(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Unchanged</option>
                {salespersonOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={assignSubmitting}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Assign
            </button>
          </form>
          {assignError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {assignError}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Activity</h2>
        <form onSubmit={handleActivitySubmit} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="activityType" className="text-sm font-medium text-zinc-700">
              Type
            </label>
            <select
              id="activityType"
              value={activityType}
              onChange={(event) => setActivityType(event.target.value as typeof activityType)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="NOTE">Note</option>
              <option value="CALL">Call</option>
              <option value="MEETING">Meeting</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="activityNotes" className="text-sm font-medium text-zinc-700">
              Notes
            </label>
            <input
              id="activityNotes"
              type="text"
              value={activityNotes}
              onChange={(event) => setActivityNotes(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            type="submit"
            disabled={loggingActivity}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Log activity
          </button>
        </form>
        {activityError && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {activityError}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {activities.length === 0 && <li className="text-sm text-zinc-500">No activity recorded yet.</li>}
          {activities.map((activity) => (
            <li key={activity.id} className="border-b border-zinc-100 pb-3 text-sm last:border-0 last:pb-0">
              <p className="font-medium text-zinc-900">{activity.type}</p>
              {activity.notes && <p className="text-zinc-600">{activity.notes}</p>}
            </li>
          ))}
        </ul>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Edit lead</h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editContactPerson" className="text-sm font-medium text-zinc-700">
                  Contact person
                </label>
                <input
                  id="editContactPerson"
                  type="text"
                  value={contactPerson}
                  onChange={(event) => setContactPerson(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editPhone" className="text-sm font-medium text-zinc-700">
                  Phone
                </label>
                <input
                  id="editPhone"
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editEmail" className="text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  id="editEmail"
                  type="text"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editWebsite" className="text-sm font-medium text-zinc-700">
                  Website
                </label>
                <input
                  id="editWebsite"
                  type="text"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editServiceRequirements" className="text-sm font-medium text-zinc-700">
                  Service requirements
                </label>
                <textarea
                  id="editServiceRequirements"
                  value={serviceRequirements}
                  onChange={(event) => setServiceRequirements(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editNotes" className="text-sm font-medium text-zinc-700">
                  Notes
                </label>
                <textarea
                  id="editNotes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editPriority" className="text-sm font-medium text-zinc-700">
                  Priority
                </label>
                <select
                  id="editPriority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as LeadPriority)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {LEAD_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {LEAD_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>

              {editError && (
                <p role="alert" className="text-sm text-red-600">
                  {editError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-zinc-900">
              {reviewPrompt === "REJECT" ? "Reject lead" : "Return for more information"}
            </h2>
            <label htmlFor="reviewReason" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Reason
            </label>
            <textarea
              id="reviewReason"
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
              className="mb-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {reviewError && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {reviewError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewPrompt(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReviewPrompt}
                disabled={reviewSubmitting}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
