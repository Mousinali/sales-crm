"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { CompanyDetail } from "@/lib/companies/get";
import type { SaleBudgetType } from "@/lib/sales/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE_CLASSES } from "@/app/(dashboard)/leadDisplay";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const SALE_BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

export default function CompanyDetailView({ company }: { company: CompanyDetail }) {
  const { profile, leads, sales } = company;

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
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-zinc-900">{profile.company_name}</h1>
          <button
            type="button"
            onClick={() => {
              setArchiveError(null);
              setArchiveOpen(true);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            Delete
          </button>
        </div>
        <p className="text-sm text-zinc-500">{profile.lead_count} lead{profile.lead_count === 1 ? "" : "s"} recorded</p>

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

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">Industry</dt>
            <dd className="text-sm text-zinc-900">{profile.industry ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Business type</dt>
            <dd className="text-sm text-zinc-900">{profile.business_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Phone</dt>
            <dd className="text-sm text-zinc-900">{profile.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Email</dt>
            <dd className="text-sm text-zinc-900">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Website</dt>
            <dd className="text-sm text-zinc-900">{profile.website ?? "—"}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-xs text-zinc-500">Address</dt>
            <dd className="text-sm text-zinc-900">
              {[profile.address, profile.location, profile.state, profile.pincode, profile.country].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Leads ({leads.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Contact</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-2">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-indigo-700 hover:underline">
                      {lead.contact_person ?? lead.phone}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_BADGE_CLASSES[lead.status]}`}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-zinc-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sales.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Sales ({sales.length})</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Budget</th>
                  <th className="px-2 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-2 py-2">
                      <Link href={`/sales/${sale.id}`} className="font-medium text-indigo-700 hover:underline">
                        ₹{Number(sale.budget_amount).toLocaleString("en-IN")}
                      </Link>
                      <span className="ml-1 text-xs text-zinc-500">({SALE_BUDGET_TYPE_LABELS[sale.budget_type]})</span>
                    </td>
                    <td className="px-2 py-2 text-zinc-500">{sale.sale_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
