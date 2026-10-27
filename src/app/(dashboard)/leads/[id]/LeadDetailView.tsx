"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LeadRow, LeadPriority } from "@/lib/leads/types";
import { LEAD_PRIORITIES } from "@/lib/leads/types";
import type { LeadActivityRow, LeadActivityType } from "@/lib/leads/activities";
import type { Role } from "@/lib/auth/roles";
import type { VisitRow } from "@/lib/visits/types";
import type { ServiceRow } from "@/lib/services/types";
import MultiSelectSearch from "@/app/(dashboard)/MultiSelectSearch";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_BADGE_CLASSES,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_BADGE_CLASSES,
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
  services: initialServices,
  viewerRole,
  viewerId,
}: {
  lead: LeadRow;
  activities: LeadActivityRow[];
  services: ServiceRow[];
  viewerRole: Role;
  viewerId: number;
}) {
  const [lead, setLead] = useState<LeadRow>(initialLead);
  const [activities, setActivities] = useState<LeadActivityRow[]>(initialActivities);
  const [leadServices, setLeadServices] = useState<ServiceRow[]>(initialServices);

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
  // No status gate here: a Marketing Head can change the Pre-sales owner at
  // any point (req.md §3.3/§6.2); only assigning a Salesperson is itself
  // gated on Qualified/Converted, enforced server-side in assignLead.
  const canAssign = viewerRole === "MARKETING_HEAD";

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [industry, setIndustry] = useState(lead.industry ?? "");
  const [businessType, setBusinessType] = useState(lead.business_type ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [leadState, setLeadState] = useState(lead.state ?? "");
  const [pincode, setPincode] = useState(lead.pincode ?? "");
  const [country, setCountry] = useState(lead.country);
  const [contactPerson, setContactPerson] = useState(lead.contact_person ?? "");
  const [phone, setPhone] = useState(lead.phone);
  const [whatsappNumber, setWhatsappNumber] = useState(lead.whatsapp_number ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [website, setWebsite] = useState(lead.website ?? "");
  const [serviceOptions, setServiceOptions] = useState<ServiceRow[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(initialServices.map((s) => s.id));
  const [remarks, setRemarks] = useState(lead.remarks ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/services?status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { services: [] }))
      .then((body) => setServiceOptions(body.services ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  function openEdit() {
    setIndustry(lead.industry ?? "");
    setBusinessType(lead.business_type ?? "");
    setAddress(lead.address ?? "");
    setLeadState(lead.state ?? "");
    setPincode(lead.pincode ?? "");
    setCountry(lead.country);
    setContactPerson(lead.contact_person ?? "");
    setPhone(lead.phone);
    setWhatsappNumber(lead.whatsapp_number ?? "");
    setEmail(lead.email ?? "");
    setWebsite(lead.website ?? "");
    setSelectedServiceIds(leadServices.map((s) => s.id));
    setRemarks(lead.remarks ?? "");
    setNotes(lead.notes ?? "");
    setPriority(lead.priority);
    setEditError(null);
    setEditOpen(true);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedServiceIds.length === 0) {
      setEditError("Select at least one service.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          industry: industry.trim() || undefined,
          businessType: businessType.trim() || undefined,
          address: address.trim() || undefined,
          state: leadState.trim() || undefined,
          pincode: pincode.trim() || undefined,
          country: country.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim(),
          whatsappNumber: whatsappNumber.trim() || undefined,
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          serviceIds: selectedServiceIds,
          remarks: remarks.trim() || undefined,
          notes: notes.trim() || undefined,
          priority,
        }),
      });
      if (!response.ok) {
        setEditError(await parseErrorMessage(response, "Could not save changes."));
        setSaving(false);
        return;
      }
      setLeadServices(serviceOptions.filter((o) => selectedServiceIds.includes(o.id)));
      setLead((current) => ({
        ...current,
        industry: industry.trim() || null,
        business_type: businessType.trim() || null,
        address: address.trim() || null,
        state: leadState.trim() || null,
        pincode: pincode.trim() || null,
        country: country.trim() || current.country,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim(),
        whatsapp_number: whatsappNumber.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        remarks: remarks.trim() || null,
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
    fetch("/api/users?role=PRE_SALES&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setPreSalesOptions(body.users ?? []))
      .catch(() => {});
    fetch("/api/users?role=SALESPERSON&status=ACTIVE")
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

  // Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPreSales, setTransferPreSales] = useState<string>("");
  const [transferSalesperson, setTransferSalesperson] = useState<string>("");
  const [transferReason, setTransferReason] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  function openTransfer() {
    setTransferPreSales("");
    setTransferSalesperson("");
    setTransferReason("");
    setTransferError(null);
    setTransferOpen(true);
  }

  async function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferReason.trim()) {
      setTransferError("A reason is required to transfer a lead");
      return;
    }
    if (!transferPreSales && !transferSalesperson) {
      setTransferError("Choose a new Pre-sales owner or Salesperson.");
      return;
    }
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newPreSalesOwnerId: transferPreSales ? Number(transferPreSales) : undefined,
          newSalespersonOwnerId: transferSalesperson ? Number(transferSalesperson) : undefined,
          reason: transferReason.trim(),
        }),
      });
      if (!response.ok) {
        setTransferError(await parseErrorMessage(response, "Could not transfer the lead."));
        setTransferSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      setTransferSubmitting(false);
      setTransferOpen(false);
    } catch {
      setTransferError("Could not transfer the lead.");
      setTransferSubmitting(false);
    }
  }

  // Visits
  const [visits, setVisits] = useState<VisitRow[]>([]);

  async function refreshVisits() {
    const response = await fetch(`/api/leads/${lead.id}/visits`);
    if (response.ok) {
      const body = await response.json();
      setVisits(body.visits ?? []);
    }
  }

  useEffect(() => {
    void refreshVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const [visitSalesperson, setVisitSalesperson] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitStartTime, setVisitStartTime] = useState("");
  const [visitLocation, setVisitLocation] = useState("");
  const [visitObjective, setVisitObjective] = useState("");
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitConflictPending, setVisitConflictPending] = useState(false);
  const [visitSubmitting, setVisitSubmitting] = useState(false);

  async function submitScheduleVisit(confirmConflict: boolean) {
    setVisitSubmitting(true);
    setVisitError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/visits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          salespersonId: Number(visitSalesperson),
          visitDate,
          startTime: visitStartTime,
          location: visitLocation.trim() || undefined,
          objective: visitObjective.trim(),
          confirmConflict,
        }),
      });
      if (response.status === 409) {
        setVisitConflictPending(true);
        setVisitError("This Salesperson already has another visit at this date and time.");
        setVisitSubmitting(false);
        return;
      }
      if (!response.ok) {
        setVisitError(await parseErrorMessage(response, "Could not schedule the visit."));
        setVisitSubmitting(false);
        return;
      }
      await refreshVisits();
      await refreshActivities();
      setVisitDate("");
      setVisitStartTime("");
      setVisitLocation("");
      setVisitObjective("");
      setVisitConflictPending(false);
      setVisitSubmitting(false);
    } catch {
      setVisitError("Could not schedule the visit.");
      setVisitSubmitting(false);
    }
  }

  function handleScheduleVisitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visitSalesperson || !visitDate || !visitStartTime || !visitObjective.trim()) {
      setVisitError("Salesperson, date, time, and objective are all required.");
      return;
    }
    void submitScheduleVisit(false);
  }

  // Per-visit reschedule / cancel / outcome actions
  const [visitAction, setVisitAction] = useState<{ visitId: number; mode: "reschedule" | "outcome" } | null>(null);
  const [visitActionError, setVisitActionError] = useState<string | null>(null);
  const [visitActionConflictPending, setVisitActionConflictPending] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeNextAction, setOutcomeNextAction] = useState("");

  function openReschedule(visit: VisitRow) {
    setVisitAction({ visitId: visit.id, mode: "reschedule" });
    setRescheduleDate(visit.visit_date);
    setRescheduleStartTime(visit.start_time.slice(0, 5));
    setVisitActionError(null);
    setVisitActionConflictPending(false);
  }

  function openOutcome(visitId: number) {
    setVisitAction({ visitId, mode: "outcome" });
    setOutcomeNotes("");
    setOutcomeNextAction("");
    setVisitActionError(null);
  }

  function closeVisitAction() {
    setVisitAction(null);
    setVisitActionError(null);
    setVisitActionConflictPending(false);
  }

  async function submitReschedule(confirmConflict: boolean) {
    if (!visitAction) return;
    setVisitActionError(null);
    try {
      const response = await fetch(`/api/visits/${visitAction.visitId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "RESCHEDULE", visitDate: rescheduleDate, startTime: rescheduleStartTime, confirmConflict }),
      });
      if (response.status === 409) {
        setVisitActionConflictPending(true);
        setVisitActionError("This Salesperson already has another visit at this date and time.");
        return;
      }
      if (!response.ok) {
        setVisitActionError(await parseErrorMessage(response, "Could not reschedule the visit."));
        return;
      }
      await refreshVisits();
      await refreshActivities();
      closeVisitAction();
    } catch {
      setVisitActionError("Could not reschedule the visit.");
    }
  }

  async function cancelVisitAction(visitId: number) {
    setVisitActionError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      });
      if (!response.ok) {
        setVisitActionError(await parseErrorMessage(response, "Could not cancel the visit."));
        return;
      }
      await refreshVisits();
      await refreshActivities();
    } catch {
      setVisitActionError("Could not cancel the visit.");
    }
  }

  async function submitOutcome(outcome: "COMPLETED" | "MISSED") {
    if (!visitAction) return;
    setVisitActionError(null);
    try {
      const response = await fetch(`/api/visits/${visitAction.visitId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "RECORD_OUTCOME",
          outcome,
          outcomeNotes: outcomeNotes.trim() || undefined,
          nextAction: outcomeNextAction.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setVisitActionError(await parseErrorMessage(response, "Could not record the outcome."));
        return;
      }
      await refreshVisits();
      closeVisitAction();
    } catch {
      setVisitActionError("Could not record the outcome.");
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
            {canAssign && (
              <button
                type="button"
                onClick={openTransfer}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Transfer
              </button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Industry type</dt>
            <dd className="text-zinc-900">{lead.industry ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Business type</dt>
            <dd className="text-zinc-900">{lead.business_type ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Address</dt>
            <dd className="text-zinc-900">
              {[lead.address, lead.state, lead.pincode, lead.country].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-zinc-900">{lead.phone}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">WhatsApp number</dt>
            <dd className="text-zinc-900">{lead.whatsapp_number ?? "—"}</dd>
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
            <dt className="text-zinc-500">Service interested</dt>
            <dd className="text-zinc-900">
              {leadServices.length === 0 ? (
                "—"
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {leadServices.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </dd>
          </div>
          {lead.remarks && (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Remarks</dt>
              <dd className="text-zinc-900">{lead.remarks}</dd>
            </div>
          )}
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
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Client visits</h2>
        {canAssign && (
          <form onSubmit={handleScheduleVisitSubmit} className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="visitSalesperson" className="text-sm font-medium text-zinc-700">
                  Salesperson
                </label>
                <select
                  id="visitSalesperson"
                  value={visitSalesperson}
                  onChange={(event) => setVisitSalesperson(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Choose…</option>
                  {salespersonOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="visitDate" className="text-sm font-medium text-zinc-700">
                  Date
                </label>
                <input
                  id="visitDate"
                  type="date"
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="visitStartTime" className="text-sm font-medium text-zinc-700">
                  Time
                </label>
                <input
                  id="visitStartTime"
                  type="time"
                  value={visitStartTime}
                  onChange={(event) => setVisitStartTime(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="visitLocation" className="text-sm font-medium text-zinc-700">
                  Location
                </label>
                <input
                  id="visitLocation"
                  type="text"
                  value={visitLocation}
                  onChange={(event) => setVisitLocation(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="visitObjective" className="text-sm font-medium text-zinc-700">
                  Objective
                </label>
                <input
                  id="visitObjective"
                  type="text"
                  value={visitObjective}
                  onChange={(event) => setVisitObjective(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <button
                type="submit"
                disabled={visitSubmitting}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Schedule visit
              </button>
            </div>
            {visitError && (
              <p role="alert" className="text-sm text-amber-700">
                {visitError}
              </p>
            )}
            {visitConflictPending && (
              <button
                type="button"
                onClick={() => void submitScheduleVisit(true)}
                disabled={visitSubmitting}
                className="self-start rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Schedule anyway
              </button>
            )}
          </form>
        )}
        <ul className="flex flex-col gap-3">
          {visits.length === 0 && <li className="text-sm text-zinc-500">No visits scheduled yet.</li>}
          {visits.map((visit) => (
            <li key={visit.id} className="border-b border-zinc-100 pb-3 text-sm last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VISIT_STATUS_BADGE_CLASSES[visit.status]}`}
                >
                  {VISIT_STATUS_LABELS[visit.status]}
                </span>
                <span className="text-zinc-900">
                  {visit.visit_date} at {visit.start_time}
                </span>
                {visit.location && <span className="text-zinc-500">· {visit.location}</span>}
              </div>
              <p className="mt-1 text-zinc-600">{visit.objective}</p>
              {visit.outcome_notes && <p className="mt-1 text-zinc-500">Outcome: {visit.outcome_notes}</p>}
              {visit.next_action && <p className="mt-1 text-zinc-500">Next action: {visit.next_action}</p>}

              {canAssign && (visit.status === "SCHEDULED" || visit.status === "RESCHEDULED") && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openReschedule(visit)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelVisitAction(visit.id)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Cancel visit
                  </button>
                </div>
              )}

              {viewerRole === "SALESPERSON" &&
                visit.salesperson_id === viewerId &&
                (visit.status === "SCHEDULED" || visit.status === "RESCHEDULED") && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openOutcome(visit.id)}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Record outcome
                    </button>
                  </div>
                )}

              {visitAction?.visitId === visit.id && visitAction.mode === "reschedule" && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`rescheduleDate-${visit.id}`} className="text-xs font-medium text-zinc-700">
                      New date
                    </label>
                    <input
                      id={`rescheduleDate-${visit.id}`}
                      type="date"
                      value={rescheduleDate}
                      onChange={(event) => setRescheduleDate(event.target.value)}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`rescheduleTime-${visit.id}`} className="text-xs font-medium text-zinc-700">
                      New time
                    </label>
                    <input
                      id={`rescheduleTime-${visit.id}`}
                      type="time"
                      value={rescheduleStartTime}
                      onChange={(event) => setRescheduleStartTime(event.target.value)}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitReschedule(false)}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={closeVisitAction}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                  {visitActionConflictPending && (
                    <button
                      type="button"
                      onClick={() => void submitReschedule(true)}
                      className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
                    >
                      Reschedule anyway
                    </button>
                  )}
                  {visitActionError && (
                    <p role="alert" className="w-full text-xs text-red-600">
                      {visitActionError}
                    </p>
                  )}
                </div>
              )}

              {visitAction?.visitId === visit.id && visitAction.mode === "outcome" && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`outcomeNotes-${visit.id}`} className="text-xs font-medium text-zinc-700">
                      Outcome notes
                    </label>
                    <input
                      id={`outcomeNotes-${visit.id}`}
                      type="text"
                      value={outcomeNotes}
                      onChange={(event) => setOutcomeNotes(event.target.value)}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`outcomeNextAction-${visit.id}`} className="text-xs font-medium text-zinc-700">
                      Next action
                    </label>
                    <input
                      id={`outcomeNextAction-${visit.id}`}
                      type="text"
                      value={outcomeNextAction}
                      onChange={(event) => setOutcomeNextAction(event.target.value)}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void submitOutcome("COMPLETED")}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Mark completed
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitOutcome("MISSED")}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Mark missed
                    </button>
                    <button
                      type="button"
                      onClick={closeVisitAction}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Cancel
                    </button>
                  </div>
                  {visitActionError && (
                    <p role="alert" className="text-xs text-red-600">
                      {visitActionError}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

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
                <label htmlFor="editIndustry" className="text-sm font-medium text-zinc-700">
                  Industry type
                </label>
                <input
                  id="editIndustry"
                  type="text"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editBusinessType" className="text-sm font-medium text-zinc-700">
                  Business type
                </label>
                <input
                  id="editBusinessType"
                  type="text"
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editAddress" className="text-sm font-medium text-zinc-700">
                  Address
                </label>
                <input
                  id="editAddress"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="editLeadState" className="text-sm font-medium text-zinc-700">
                    State
                  </label>
                  <input
                    id="editLeadState"
                    type="text"
                    value={leadState}
                    onChange={(event) => setLeadState(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="editPincode" className="text-sm font-medium text-zinc-700">
                    Pincode
                  </label>
                  <input
                    id="editPincode"
                    type="text"
                    value={pincode}
                    onChange={(event) => setPincode(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="editCountry" className="text-sm font-medium text-zinc-700">
                    Country
                  </label>
                  <input
                    id="editCountry"
                    type="text"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
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
                <label htmlFor="editWhatsappNumber" className="text-sm font-medium text-zinc-700">
                  WhatsApp number
                </label>
                <input
                  id="editWhatsappNumber"
                  type="text"
                  value={whatsappNumber}
                  onChange={(event) => setWhatsappNumber(event.target.value)}
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
                <label htmlFor="editServiceInterested" className="text-sm font-medium text-zinc-700">
                  Service interested
                </label>
                <MultiSelectSearch
                  id="editServiceInterested"
                  options={serviceOptions}
                  selectedIds={selectedServiceIds}
                  onChange={setSelectedServiceIds}
                  placeholder="Search services…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="editRemarks" className="text-sm font-medium text-zinc-700">
                  Remarks
                </label>
                <textarea
                  id="editRemarks"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
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

      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Transfer lead</h2>
            <form onSubmit={handleTransferSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="transferPreSales" className="text-sm font-medium text-zinc-700">
                  New Pre-sales owner
                </label>
                <select
                  id="transferPreSales"
                  value={transferPreSales}
                  onChange={(event) => setTransferPreSales(event.target.value)}
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
                <label htmlFor="transferSalesperson" className="text-sm font-medium text-zinc-700">
                  New Salesperson
                </label>
                <select
                  id="transferSalesperson"
                  value={transferSalesperson}
                  onChange={(event) => setTransferSalesperson(event.target.value)}
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
              <div className="flex flex-col gap-1.5">
                <label htmlFor="transferReason" className="text-sm font-medium text-zinc-700">
                  Reason
                </label>
                <textarea
                  id="transferReason"
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {transferError && (
                <p role="alert" className="text-sm text-red-600">
                  {transferError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Transfer
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
