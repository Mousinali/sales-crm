"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import Timeline, { type TimelineEntry } from "@/components/ui/Timeline";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { InfoRow, InfoTile } from "@/components/ui/InfoCard";
import RichTextField, { FormattedText } from "@/components/ui/RichTextField";
import type { LeadRow } from "@/lib/leads/types";
import type { LeadActivityRow, LeadActivityType } from "@/lib/leads/activities";
import type { Role } from "@/lib/auth/roles";
import type { VisitRow } from "@/lib/visits/types";
import type { ServiceRow } from "@/lib/services/types";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_STATUS_ICONS,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_BADGE_CLASSES,
  LEAD_PRIORITY_ICONS,
  LEAD_BUDGET_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_BADGE_CLASSES,
  LEAD_ACTIVITY_DISPLAY,
} from "@/app/(dashboard)/leadDisplay";

type ReviewAction = "QUALIFY" | "REJECT" | "RETURN";
type SimpleUser = { id: number; name: string };

const SOCIAL_PLATFORMS: { key: "youtube_url" | "facebook_url" | "instagram_url" | "linkedin_url"; label: string; icon: string }[] = [
  { key: "youtube_url", label: "YouTube", icon: "/social-icons/youtube.svg" },
  { key: "facebook_url", label: "Facebook", icon: "/social-icons/facebook.svg" },
  { key: "instagram_url", label: "Instagram", icon: "/social-icons/instagram.svg" },
  { key: "linkedin_url", label: "LinkedIn", icon: "/social-icons/linkedin.svg" },
];

function activitiesToTimeline(activities: LeadActivityRow[]): TimelineEntry[] {
  return activities.map((activity) => ({
    id: activity.id,
    icon: LEAD_ACTIVITY_DISPLAY[activity.type].icon,
    iconClass: LEAD_ACTIVITY_DISPLAY[activity.type].iconClass,
    title: LEAD_ACTIVITY_DISPLAY[activity.type].label,
    description: activity.notes,
    meta: activity.actor_name ? `by ${activity.actor_name}` : undefined,
    timestamp: activity.created_at,
  }));
}

type LeadWithSale = LeadRow & {
  latest_sale_id?: number | null;
  latest_sale_budget_amount?: string | null;
  latest_sale_paid_amount?: string | null;
  pre_sales_owner_name?: string | null;
  salesperson_owner_name?: string | null;
  created_by_name?: string | null;
};

async function copyToClipboard(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

export default function LeadDetailView({
  lead: initialLead,
  activities: initialActivities,
  services: initialServices,
  viewerRole,
  viewerId,
}: {
  lead: LeadWithSale;
  activities: LeadActivityRow[];
  services: ServiceRow[];
  viewerRole: Role;
  viewerId: number;
}) {
  const [lead, setLead] = useState<LeadWithSale>(initialLead);
  const [activities, setActivities] = useState<LeadActivityRow[]>(initialActivities);
  const leadServices = initialServices;

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not archive the lead.");
        setArchiveError(message);
        toast.error("Could not archive lead", message);
        setArchiving(false);
        return;
      }
      toast.success("Lead archived", lead.company_name);
      window.location.href = "/leads";
    } catch {
      setArchiveError("Could not archive the lead.");
      toast.error("Could not archive lead");
      setArchiving(false);
    }
  }

  async function refreshActivities() {
    const response = await fetch(`/api/leads/${lead.id}/activities`);
    if (response.ok) {
      const body = await response.json();
      setActivities(body.activities ?? []);
    }
  }

  async function refreshLead() {
    const response = await fetch(`/api/leads/${lead.id}`);
    if (response.ok) {
      setLead((await response.json()) as LeadRow);
    }
  }

  async function refreshAll() {
    await Promise.all([refreshLead(), refreshActivities(), refreshVisits()]);
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

  // Tabbed panel below the header card: Activity / Assignment / Visits.
  const [activeTab, setActiveTab] = useState("activity");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [scheduleVisitModalOpen, setScheduleVisitModalOpen] = useState(false);

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
        const message = await parseErrorMessage(response, "Could not update the lead's status.");
        setReviewError(message);
        toast.error("Could not update status", message);
        setReviewSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      toast.success("Lead status updated", LEAD_STATUS_LABELS[updated.status as keyof typeof LEAD_STATUS_LABELS]);
      setReviewSubmitting(false);
      setReviewPrompt(null);
    } catch {
      setReviewError("Could not update the lead's status.");
      toast.error("Could not update status");
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

  function openAssign() {
    setSelectedPreSales("");
    setSelectedSalesperson("");
    setAssignError(null);
    setAssignModalOpen(true);
  }

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
        const message = await parseErrorMessage(response, "Could not assign the lead.");
        setAssignError(message);
        toast.error("Could not assign lead", message);
        setAssignSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      toast.success("Lead assigned");
      setAssignSubmitting(false);
      setAssignModalOpen(false);
    } catch {
      setAssignError("Could not assign the lead.");
      toast.error("Could not assign lead");
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
        const message = await parseErrorMessage(response, "Could not transfer the lead.");
        setTransferError(message);
        toast.error("Could not transfer lead", message);
        setTransferSubmitting(false);
        return;
      }
      const updated = await response.json();
      setLead(updated);
      await refreshActivities();
      toast.success("Lead transferred");
      setTransferSubmitting(false);
      setTransferOpen(false);
    } catch {
      setTransferError("Could not transfer the lead.");
      toast.error("Could not transfer lead");
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
    fetch(`/api/leads/${lead.id}/visits`)
      .then((res) => (res.ok ? res.json() : { visits: [] }))
      .then((body) => setVisits(body.visits ?? []))
      .catch(() => {});
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

  function openScheduleVisit() {
    setVisitSalesperson("");
    setVisitDate("");
    setVisitStartTime("");
    setVisitLocation("");
    setVisitObjective("");
    setVisitError(null);
    setVisitConflictPending(false);
    setScheduleVisitModalOpen(true);
  }

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
        const message = await parseErrorMessage(response, "Could not schedule the visit.");
        setVisitError(message);
        toast.error("Could not schedule visit", message);
        setVisitSubmitting(false);
        return;
      }
      await refreshVisits();
      await refreshActivities();
      toast.success("Visit scheduled");
      setVisitDate("");
      setVisitStartTime("");
      setVisitLocation("");
      setVisitObjective("");
      setVisitConflictPending(false);
      setVisitSubmitting(false);
      setScheduleVisitModalOpen(false);
    } catch {
      setVisitError("Could not schedule the visit.");
      toast.error("Could not schedule visit");
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
        const message = await parseErrorMessage(response, "Could not reschedule the visit.");
        setVisitActionError(message);
        toast.error("Could not reschedule visit", message);
        return;
      }
      await refreshVisits();
      await refreshActivities();
      toast.success("Visit rescheduled");
      closeVisitAction();
    } catch {
      setVisitActionError("Could not reschedule the visit.");
      toast.error("Could not reschedule visit");
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
        const message = await parseErrorMessage(response, "Could not cancel the visit.");
        setVisitActionError(message);
        toast.error("Could not cancel visit", message);
        return;
      }
      await refreshVisits();
      await refreshActivities();
      toast.success("Visit cancelled");
    } catch {
      setVisitActionError("Could not cancel the visit.");
      toast.error("Could not cancel visit");
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
        const message = await parseErrorMessage(response, "Could not record the outcome.");
        setVisitActionError(message);
        toast.error("Could not record outcome", message);
        return;
      }
      await refreshVisits();
      toast.success("Outcome recorded");
      closeVisitAction();
    } catch {
      setVisitActionError("Could not record the outcome.");
      toast.error("Could not record outcome");
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
        const message = await parseErrorMessage(response, "Could not log the activity.");
        setActivityError(message);
        toast.error("Could not log activity", message);
        setLoggingActivity(false);
        return;
      }
      await refreshActivities();
      toast.success("Activity logged");
      setActivityNotes("");
      setLoggingActivity(false);
    } catch {
      setActivityError("Could not log the activity.");
      toast.error("Could not log activity");
      setLoggingActivity(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{lead.company_name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
              <i className="ri-user-line text-base" aria-hidden="true" />
              {lead.contact_person}
              {lead.designation && <span className="text-zinc-400">· {lead.designation}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge icon={LEAD_STATUS_ICONS[lead.status]} className={LEAD_STATUS_BADGE_CLASSES[lead.status]}>
              {LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            {lead.latest_sale_id != null && <Badge className="bg-emerald-50 text-emerald-700">Converted to sale</Badge>}
            <Badge icon={LEAD_PRIORITY_ICONS[lead.priority]} className={LEAD_PRIORITY_BADGE_CLASSES[lead.priority]}>
              {LEAD_PRIORITY_LABELS[lead.priority]}
            </Badge>
            <span className="h-6 w-px bg-zinc-200" aria-hidden="true" />
            <RefreshButton onRefresh={refreshAll} />
          </div>
        </div>

        {(canReview || canEdit || canAssign) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {canReview && (
                <>
                  <button
                    type="button"
                    onClick={() => startReview("QUALIFY")}
                    disabled={reviewSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i className="ri-checkbox-circle-line text-sm" aria-hidden="true" />
                    Qualify
                  </button>
                  <button
                    type="button"
                    onClick={() => startReview("REJECT")}
                    disabled={reviewSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i className="ri-close-circle-line text-sm" aria-hidden="true" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => startReview("RETURN")}
                    disabled={reviewSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i className="ri-information-line text-sm" aria-hidden="true" />
                    Return for more info
                  </button>
                </>
              )}
            </div>

            {(canEdit || canAssign) && (
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <Link
                    href={`/leads/${lead.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    <i className="ri-pencil-line text-sm" aria-hidden="true" />
                    Edit
                  </Link>
                )}
                {canAssign && (
                  <button
                    type="button"
                    onClick={openTransfer}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    <i className="ri-arrow-left-right-line text-sm" aria-hidden="true" />
                    Transfer
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveError(null);
                      setArchiveOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <i className="ri-delete-bin-line text-sm" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            )}

            {reviewError && !reviewPrompt && (
              <p role="alert" className="w-full text-sm text-red-600">
                {reviewError}
              </p>
            )}
          </div>
        )}

        {archiveOpen && (
          <Modal title={`Delete ${lead.company_name}?`} onClose={() => setArchiveOpen(false)}>
            <p className="mb-4 text-sm text-zinc-500">This moves the lead to the Archive. It can&apos;t be undone from here.</p>
            {archiveError && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {archiveError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                disabled={archiving}
                className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {archiving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Modal>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col">
              <InfoRow
                icon="ri-mail-line"
                iconClass="bg-sky-100 text-sky-600"
                label="Email"
                action={
                  lead.email && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(lead.email!, "Email")}
                      aria-label="Copy email"
                      className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <i className="ri-file-copy-line text-sm" aria-hidden="true" />
                    </button>
                  )
                }
              >
                {lead.email ?? "—"}
              </InfoRow>
              <InfoRow
                icon="ri-phone-line"
                iconClass="bg-sky-100 text-sky-600"
                label="Phone"
                action={
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.phone, "Phone")}
                    aria-label="Copy phone"
                    className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <i className="ri-file-copy-line text-sm" aria-hidden="true" />
                  </button>
                }
              >
                {lead.phone}
              </InfoRow>
              {lead.whatsapp_number && (
                <InfoRow
                  icon="ri-whatsapp-line"
                  iconClass="bg-emerald-100 text-emerald-600"
                  label="WhatsApp"
                  action={
                    <a
                      href={`https://wa.me/${lead.whatsapp_number.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open in WhatsApp"
                      className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <i className="ri-external-link-line text-sm" aria-hidden="true" />
                    </a>
                  }
                >
                  {lead.whatsapp_number}
                </InfoRow>
              )}
              <InfoRow icon="ri-map-pin-line" iconClass="bg-violet-100 text-violet-600" label="Address">
                {[lead.address, lead.state, lead.pincode, lead.country].filter(Boolean).join(", ") || "—"}
              </InfoRow>
              {lead.gst_number && (
                <InfoRow icon="ri-bill-line" iconClass="bg-amber-100 text-amber-600" label="GST Number">
                  {lead.gst_number}
                </InfoRow>
              )}
              <InfoRow icon="ri-calendar-line" iconClass="bg-violet-100 text-violet-600" label="Created on">
                {new Date(lead.created_at).toLocaleString()}
              </InfoRow>
              <InfoRow icon="ri-user-line" iconClass="bg-indigo-100 text-indigo-600" label="Created by">
                {lead.created_by_name ?? "—"}
              </InfoRow>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="space-y-3">
              <InfoTile icon="ri-building-2-line" iconClass="bg-violet-200 text-violet-700" tileClass="bg-violet-50" label="Industry type">
                {lead.industry ?? "—"}
              </InfoTile>
              <InfoTile icon="ri-stack-line" iconClass="bg-sky-200 text-sky-700" tileClass="bg-sky-50" label="Business type">
                {lead.business_type ?? "—"}
              </InfoTile>
              <InfoTile icon="ri-global-line" iconClass="bg-emerald-200 text-emerald-700" tileClass="bg-emerald-50" label="Website">
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                    {lead.website}
                    <i className="ri-external-link-line text-xs" aria-hidden="true" />
                  </a>
                ) : (
                  "—"
                )}
              </InfoTile>
              <InfoTile icon="ri-wallet-3-line" iconClass="bg-amber-200 text-amber-700" tileClass="bg-amber-50" label="Estimated budget">
                {lead.estimated_budget != null ? `₹${Number(lead.estimated_budget).toLocaleString("en-IN")}` : "—"}
                {lead.budget_type && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                    {LEAD_BUDGET_TYPE_LABELS[lead.budget_type]}
                  </span>
                )}
              </InfoTile>
              <InfoTile
                icon="ri-price-tag-3-line"
                iconClass="bg-rose-200 text-rose-700"
                tileClass="bg-rose-50"
                label="Service interested"
                className="col-span-2"
              >
                {leadServices.length === 0 ? (
                  "—"
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {leadServices.map((s) => (
                      <span key={s.id} className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-rose-800">
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </InfoTile>
            </div>

            {(lead.latest_sale_id != null || lead.remarks || lead.notes || lead.status_reason) && (
              <dl className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 text-sm">
                {lead.latest_sale_id != null && (
                  <div>
                    <dt className="text-zinc-500">Sale payment status</dt>
                    <dd className="text-zinc-900">
                      <Link href={`/sales/${lead.latest_sale_id}`} className="text-brand-700 hover:underline">
                        ₹{Number(lead.latest_sale_paid_amount ?? 0).toLocaleString("en-IN")} paid of ₹
                        {Number(lead.latest_sale_budget_amount ?? 0).toLocaleString("en-IN")}
                      </Link>
                      <span className="ml-1 block text-xs text-amber-700">
                        (₹{Math.max(Number(lead.latest_sale_budget_amount ?? 0) - Number(lead.latest_sale_paid_amount ?? 0), 0).toLocaleString("en-IN")} remaining)
                      </span>
                    </dd>
                  </div>
                )}
                {lead.remarks && (
                  <div>
                    <dt className="text-zinc-500">Remarks</dt>
                    <dd className="text-zinc-900">
                      <FormattedText text={lead.remarks} />
                    </dd>
                  </div>
                )}
                {lead.notes && (
                  <div>
                    <dt className="text-zinc-500">Notes</dt>
                    <dd className="text-zinc-900">
                      <FormattedText text={lead.notes} />
                    </dd>
                  </div>
                )}
                {lead.status_reason && (
                  <div>
                    <dt className="text-zinc-500">Status reason</dt>
                    <dd className="text-zinc-900">{lead.status_reason}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex gap-2">
              {SOCIAL_PLATFORMS.map((platform) => {
                const url = lead[platform.key];
                return url ? (
                  <a
                    key={platform.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={platform.label}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-2 transition hover:border-brand-300 hover:bg-brand-50 hover:shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize. */}
                    <img src={platform.icon} alt={platform.label} className="h-full w-full object-contain" />
                  </a>
                ) : (
                  <span
                    key={platform.key}
                    title={`No ${platform.label} link added`}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-2 opacity-40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize. */}
                    <img src={platform.icon} alt={platform.label} className="h-full w-full object-contain grayscale" />
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="px-6 pt-4">
          <Tabs
            tabs={[
              { id: "activity", label: "Activity", icon: "ri-time-line" },
              ...(canAssign ? [{ id: "assignment", label: "Assignment", icon: "ri-user-add-line" }] : []),
              { id: "visits", label: "Visits", icon: "ri-map-pin-line", count: visits.length },
            ]}
            activeId={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === "activity" && (
          <div className="p-6">
            <form onSubmit={handleActivitySubmit} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="activityType" className="text-sm font-medium text-zinc-700">
                  Type
                </label>
                <select
                  id="activityType"
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value as typeof activityType)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button
                type="submit"
                disabled={loggingActivity}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Log activity
              </button>
            </form>
            {activityError && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {activityError}
              </p>
            )}
            <Timeline entries={activitiesToTimeline(activities)} emptyText="No activity recorded yet." />
          </div>
        )}

        {canAssign && activeTab === "assignment" && (
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Pre-sales owner</dt>
                  <dd className="text-zinc-900">{lead.pre_sales_owner_name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Salesperson</dt>
                  <dd className="text-zinc-900">{lead.salesperson_owner_name ?? "Unassigned"}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={openAssign}
                className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {activeTab === "visits" && (
          <div className="p-6">
            {canAssign && (
              <button
                type="button"
                onClick={openScheduleVisit}
                className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <i className="ri-add-line" aria-hidden="true" />
                Schedule visit
              </button>
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitReschedule(false)}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
        )}
        </div>
      </div>

      {assignModalOpen && (
        <Modal title="Assign lead" onClose={() => setAssignModalOpen(false)}>
          <form onSubmit={handleAssignSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preSalesOwner" className="text-sm font-medium text-zinc-700">
                Pre-sales owner
              </label>
              <select
                id="preSalesOwner"
                value={selectedPreSales}
                onChange={(event) => setSelectedPreSales(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">Unchanged</option>
                {salespersonOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            {assignError && (
              <p role="alert" className="text-sm text-red-600">
                {assignError}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assignSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Assign
              </button>
            </div>
          </form>
        </Modal>
      )}

      {scheduleVisitModalOpen && (
        <Modal title="Schedule a client visit" onClose={() => setScheduleVisitModalOpen(false)} maxWidth="max-w-lg">
          <form onSubmit={handleScheduleVisitSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="visitSalesperson" className="text-sm font-medium text-zinc-700">
                Salesperson
              </label>
              <select
                id="visitSalesperson"
                value={visitSalesperson}
                onChange={(event) => setVisitSalesperson(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">Choose…</option>
                {salespersonOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="visitDate" className="text-sm font-medium text-zinc-700">
                  Date
                </label>
                <input
                  id="visitDate"
                  type="date"
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
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
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="visitObjective" className="text-sm font-medium text-zinc-700">
                Objective
              </label>
              <input
                id="visitObjective"
                type="text"
                value={visitObjective}
                onChange={(event) => setVisitObjective(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
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
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setScheduleVisitModalOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={visitSubmitting}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Schedule visit
              </button>
            </div>
          </form>
        </Modal>
      )}

      {transferOpen && (
        <Modal title="Transfer lead" onClose={() => setTransferOpen(false)}>
            <form onSubmit={handleTransferSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="transferPreSales" className="text-sm font-medium text-zinc-700">
                  New Pre-sales owner
                </label>
                <select
                  id="transferPreSales"
                  value={transferPreSales}
                  onChange={(event) => setTransferPreSales(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                <RichTextField id="transferReason" value={transferReason} onChange={setTransferReason} />
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
                  className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting}
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Transfer
                </button>
              </div>
            </form>
        </Modal>
      )}

      {reviewPrompt && (
        <Modal title={reviewPrompt === "REJECT" ? "Reject lead" : "Return for more information"} onClose={() => setReviewPrompt(null)} maxWidth="max-w-sm">
            <label htmlFor="reviewReason" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Reason
            </label>
            <div className="mb-3">
              <RichTextField id="reviewReason" value={reviewReason} onChange={setReviewReason} />
            </div>
            {reviewError && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {reviewError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewPrompt(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReviewPrompt}
                disabled={reviewSubmitting}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
