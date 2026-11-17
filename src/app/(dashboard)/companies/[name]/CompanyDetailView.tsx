"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { CompanyDetail } from "@/lib/companies/get";
import type { SaleBudgetType } from "@/lib/sales/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE_CLASSES } from "@/app/(dashboard)/leadDisplay";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import BalanceText from "@/components/ui/BalanceText";
import Avatar from "@/components/ui/Avatar";
import { FormattedText } from "@/components/ui/RichTextField";
import Badge from "@/components/ui/Badge";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { InfoRow, InfoTile } from "@/components/ui/InfoCard";
import RefreshButton from "@/components/ui/RefreshButton";
import StatTile from "@/components/ui/StatTile";
import Tabs from "@/components/ui/Tabs";
import Timeline, { type TimelineEntry } from "@/components/ui/Timeline";
import { LEAD_ACTIVITY_DISPLAY } from "@/app/(dashboard)/leadDisplay";
import { saleBalance } from "@/lib/sales/balance";
import type { LeadActivityType } from "@/lib/leads/activities";
import type { CompanyActivity } from "@/lib/companies/get";

const SALE_BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const KIND_DISPLAY = {
  LEAD: { icon: "ri-contacts-line", iconClass: "bg-brand-50 text-brand-600" },
  VISIT: { icon: "ri-map-pin-line", iconClass: "bg-teal-50 text-teal-600" },
  SALE: { icon: "ri-money-rupee-circle-line", iconClass: "bg-emerald-50 text-emerald-600" },
  PAYMENT: { icon: "ri-hand-coin-line", iconClass: "bg-violet-50 text-violet-600" },
} as const;

function activityToTimeline(activity: CompanyActivity[]): TimelineEntry[] {
  return activity.map((a) => {
    const display =
      a.kind === "LEAD_ACTIVITY" && a.activityType
        ? LEAD_ACTIVITY_DISPLAY[a.activityType as LeadActivityType]
        : KIND_DISPLAY[a.kind as keyof typeof KIND_DISPLAY];
    return {
      id: a.id,
      icon: display.icon,
      iconClass: display.iconClass,
      title: a.title,
      description: a.description,
      meta: a.actor ? `by ${a.actor}` : undefined,
      timestamp: a.at,
    };
  });
}

// "A → B" when the owner changed, just the name when it stayed the same.
function ownerChange(previous: string | null, next: string | null): string {
  if (!next) return "—";
  return previous === next ? next : `${previous ?? "Unassigned"} → ${next}`;
}

function formatDate(date: string | Date): string {
  const text = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CompanyDetailView({ company, showLeads, canDelete }: { company: CompanyDetail; showLeads: boolean; canDelete: boolean }) {
  const { profile, leads, sales, payments, activity, owners, transfers } = company;
  // Only a Super Admin's query returns transfer history.
  const showTransfers = transfers.length > 0 || canDelete;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("activity");
  const totalSales = sales.reduce((sum, s) => sum + Number(s.budget_amount), 0);
  const totalPaid = sales.reduce((sum, s) => sum + Number(s.paid_amount ?? 0), 0);
  const balance = sales.reduce(
    (acc, s) => {
      const b = saleBalance(Number(s.budget_amount), Number(s.paid_amount ?? 0));
      return { due: acc.due + b.due, excess: acc.excess + b.excess };
    },
    { due: 0, excess: 0 },
  );
  const fullAddress = [profile.address, profile.location, profile.state, profile.pincode, profile.country].filter(Boolean).join(", ") || null;

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/companies/${profile.company_name_normalized}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not archive the company.");
        setArchiveError(message);
        toast.error("Could not archive company", message);
        setArchiving(false);
        return;
      }
      toast.success("Company archived", profile.company_name);
      window.location.href = "/companies";
    } catch {
      setArchiveError("Could not archive the company.");
      toast.error("Could not archive company");
      setArchiving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{profile.company_name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
              <i className="ri-building-2-line text-base" aria-hidden="true" />
              {[profile.industry, profile.business_type].filter(Boolean).join(" · ") || "Company"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showLeads && <Badge icon="ri-contacts-line" className="bg-brand-50 text-brand-700">{profile.lead_count} lead{profile.lead_count === 1 ? "" : "s"}</Badge>}
            <Badge icon="ri-money-rupee-circle-line" className="bg-emerald-50 text-emerald-700">{sales.length} sale{sales.length === 1 ? "" : "s"}</Badge>
            <span className="h-6 w-px bg-zinc-200" aria-hidden="true" />
            <RefreshButton onRefresh={() => router.refresh()} />
            {canDelete && (
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
        </div>

        {archiveOpen && (
          <ConfirmDialog
            title={`Delete ${profile.company_name}?`}
            description={`This moves all ${profile.lead_count} of its lead${profile.lead_count === 1 ? "" : "s"} to the Archive. It can't be undone from here.`}
            error={archiveError}
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            pending={archiving}
            onConfirm={confirmArchive}
            onCancel={() => setArchiveOpen(false)}
          />
        )}
      </div>

      <div className={`grid grid-cols-2 gap-4 ${balance.excess > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatTile label="Total sales" value={rupees(totalSales)} icon="ri-money-rupee-circle-line" tone="brand" />
        <StatTile label="Paid so far" value={rupees(totalPaid)} icon="ri-hand-coin-line" tone="emerald" />
        <StatTile label="Due" value={rupees(balance.due)} icon="ri-time-line" tone="amber" />
        {balance.excess > 0 && <StatTile label="Excess paid" value={rupees(balance.excess)} icon="ri-add-circle-line" tone="violet" />}
        <StatTile label="Payments" value={payments.length} icon="ri-receipt-line" tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-6">
          {owners.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">Client of</h2>
              <ul className="mt-3 flex flex-col divide-y divide-zinc-100">
                {owners.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Avatar name={o.name} imageUrl={o.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{o.name}</p>
                      <p className="text-xs text-zinc-500">{formatRoleLabel(o.role)}</p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-zinc-500">
                      {[o.leads > 0 && `${o.leads} lead${o.leads === 1 ? "" : "s"}`, o.sales > 0 && `${o.sales} sale${o.sales === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <InfoRow icon="ri-mail-line" iconClass="bg-sky-100 text-sky-600" label="Email" copyText={profile.email}>
              {profile.email ?? "—"}
            </InfoRow>
            <InfoRow icon="ri-phone-line" iconClass="bg-sky-100 text-sky-600" label="Phone" copyText={profile.phone}>
              {profile.phone ?? "—"}
            </InfoRow>
            <InfoRow icon="ri-map-pin-line" iconClass="bg-violet-100 text-violet-600" label="Address" copyText={fullAddress}>
              {fullAddress ?? "—"}
            </InfoRow>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="space-y-3">
              <InfoTile icon="ri-building-2-line" iconClass="bg-violet-200 text-violet-700" tileClass="bg-violet-50" label="Industry type" copyText={profile.industry}>
                {profile.industry ?? "—"}
              </InfoTile>
              <InfoTile icon="ri-stack-line" iconClass="bg-sky-200 text-sky-700" tileClass="bg-sky-50" label="Business type" copyText={profile.business_type}>
                {profile.business_type ?? "—"}
              </InfoTile>
              <InfoTile icon="ri-global-line" iconClass="bg-emerald-200 text-emerald-700" tileClass="bg-emerald-50" label="Website" copyText={profile.website}>
                {profile.website ? (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" title={profile.website} className="inline-flex max-w-full items-center gap-1 hover:underline">
                    <span className="truncate">{profile.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
                    <i className="ri-external-link-line shrink-0 text-xs" aria-hidden="true" />
                  </a>
                ) : (
                  "—"
                )}
              </InfoTile>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="px-6 pt-4">
            <Tabs
              tabs={[
                { id: "activity", label: "Activity", icon: "ri-time-line" },
                ...(showLeads ? [{ id: "leads", label: "Leads", icon: "ri-contacts-line", count: leads.length }] : []),
                { id: "sales", label: "Sales", icon: "ri-money-rupee-circle-line", count: sales.length },
                { id: "payments", label: "Payments", icon: "ri-hand-coin-line", count: payments.length },
                ...(showTransfers ? [{ id: "transfers", label: "Transfers", icon: "ri-arrow-left-right-line", count: transfers.length }] : []),
              ]}
              activeId={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {activeTab === "activity" && (
            <div className="p-6">
              <Timeline entries={activityToTimeline(activity)} emptyText="No activity recorded yet." />
              {activity.length >= 100 && <p className="mt-4 text-xs text-zinc-400">Showing the latest 100 events.</p>}
            </div>
          )}

          {activeTab === "leads" && showLeads && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-6 py-2.5">Contact</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-6 py-2.5 text-right">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
                          {lead.contact_person ?? lead.phone}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_BADGE_CLASSES[lead.status]}`}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-zinc-500">{formatDate(lead.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "sales" && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-6 py-2.5">Sale</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Paid</th>
                    <th className="px-6 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">No sales yet.</td>
                    </tr>
                  )}
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-3">
                        <Link href={`/sales/${sale.id}`} className="font-medium text-brand-700 hover:underline">
                          {sale.sale_number}
                        </Link>
                        <p className="text-xs text-zinc-500">{SALE_BUDGET_TYPE_LABELS[sale.budget_type]}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-500">{formatDate(sale.sale_date)}</td>
                      <td className="px-3 py-3 text-right font-medium text-zinc-900">{rupees(Number(sale.budget_amount))}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{rupees(Number(sale.paid_amount ?? 0))}</td>
                      <td className="px-6 py-3 text-right">
                        <BalanceText budget={Number(sale.budget_amount)} paid={Number(sale.paid_amount ?? 0)} className="text-sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "transfers" && showTransfers && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-6 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Lead</th>
                    <th className="px-3 py-2.5">Pre-sales</th>
                    <th className="px-3 py-2.5">Salesperson</th>
                    <th className="px-3 py-2.5">Transferred by</th>
                    <th className="px-6 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">This client has not been transferred.</td>
                    </tr>
                  )}
                  {transfers.map((t) => (
                    <tr key={t.id} className="align-top hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-6 py-3 text-zinc-500">{formatDate(t.transferred_at)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/leads/${t.lead_id}`} className="text-brand-700 hover:underline">
                          {t.lead_name ?? `#${t.lead_id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-zinc-600">{ownerChange(t.previous_pre_sales, t.new_pre_sales)}</td>
                      <td className="px-3 py-3 text-zinc-600">{ownerChange(t.previous_salesperson, t.new_salesperson)}</td>
                      <td className="px-3 py-3 text-zinc-600">{t.transferred_by ?? "—"}</td>
                      <td className="px-6 py-3 text-zinc-600">
                        <FormattedText text={t.reason} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-6 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Payment no.</th>
                    <th className="px-3 py-2.5">Sale</th>
                    <th className="px-3 py-2.5">Method</th>
                    <th className="px-3 py-2.5">Recorded by</th>
                    <th className="px-6 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">No payments yet.</td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-6 py-3 text-zinc-500">{formatDate(p.payment_date)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-600">{p.payment_number}</td>
                      <td className="px-3 py-3">
                        <Link href={`/sales/${p.sale_id}`} className="text-brand-700 hover:underline">
                          {p.sale_number}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-zinc-600">{p.payment_method.charAt(0) + p.payment_method.slice(1).toLowerCase().replace("_", " ")}</td>
                      <td className="px-3 py-3 text-zinc-600">{p.recorded_by_name ?? "—"}</td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-700">{rupees(Number(p.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
