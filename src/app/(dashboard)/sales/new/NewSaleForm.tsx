"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { SALE_BUDGET_TYPES, SALE_PAYMENT_METHODS, type SaleBudgetType, type SaleSoldByType, type SalePaymentMethod } from "@/lib/sales/types";
import type { Role } from "@/lib/auth/roles";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import type { ServiceRow } from "@/lib/services/types";

const BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

type SimpleLead = { id: number; company_name: string };
type SimpleUser = { id: number; name: string };

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewSaleForm({ viewerRole, serviceOptions }: { viewerRole: Role; serviceOptions: ServiceRow[] }) {
  const router = useRouter();
  const isMarketingHead = viewerRole === "MARKETING_HEAD";

  // Company: either chosen from the lead list, or typed fresh.
  const [leadOptions, setLeadOptions] = useState<SimpleLead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetType, setBudgetType] = useState<SaleBudgetType>("ONE_TIME");
  const [saleDate, setSaleDate] = useState(todayDateInput());
  const [notes, setNotes] = useState("");

  // An advance/first payment can be recorded right away — optional, since
  // not every sale is paid anything up front.
  const [initialPaymentAmount, setInitialPaymentAmount] = useState("");
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<SalePaymentMethod>("CASH");

  // "Sold by" attribution is only a Marketing Head's choice (req: "if
  // marketing can add sales also can mention the sales by..."); a Pre-sales
  // or Salesperson recording their own sale is always the one who sold it,
  // enforced server-side regardless of what this form sends.
  const [soldByType, setSoldByType] = useState<SaleSoldByType>("SELF");
  const [soldByUserId, setSoldByUserId] = useState("");
  const [soldByCustomName, setSoldByCustomName] = useState("");
  const [preSalesOptions, setPreSalesOptions] = useState<SimpleUser[]>([]);
  const [salespersonOptions, setSalespersonOptions] = useState<SimpleUser[]>([]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // shortcut: a flat page of up to 100 leads, no search box; fine for a
    // small-to-mid lead list — switch to a type-ahead search if it grows.
    fetch("/api/leads?pageSize=100")
      .then((res) => (res.ok ? res.json() : { leads: [] }))
      .then((body) => setLeadOptions(((body.leads ?? []) as (SimpleLead & { status: string })[]).filter((l) => l.status !== "REJECTED" && l.status !== "CLOSED_LOST")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isMarketingHead) return;
    fetch("/api/users?role=PRE_SALES&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setPreSalesOptions(body.users ?? []))
      .catch(() => {});
    fetch("/api/users?role=SALESPERSON&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setSalespersonOptions(body.users ?? []))
      .catch(() => {});
  }, [isMarketingHead]);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!leadId && !companyName.trim()) {
      setCreateError("Choose a company from the lead list, or enter a company name.");
      return;
    }
    const amount = Number(budgetAmount);
    if (!budgetAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setCreateError("Enter a budget amount greater than 0.");
      return;
    }
    if (isMarketingHead) {
      if (soldByType === "CUSTOM" && !soldByCustomName.trim()) {
        setCreateError("Enter a name for who sold this.");
        return;
      }
      if ((soldByType === "PRE_SALES" || soldByType === "SALESPERSON") && !soldByUserId) {
        setCreateError(`Choose a ${soldByType === "PRE_SALES" ? "Pre-sales" : "Salesperson"} user.`);
        return;
      }
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: leadId ? Number(leadId) : undefined,
          companyName: leadId ? undefined : companyName.trim(),
          contactPerson: leadId ? undefined : contactPerson.trim() || undefined,
          phone: leadId ? undefined : phone.trim() || undefined,
          email: leadId ? undefined : email.trim() || undefined,
          address: leadId ? undefined : address.trim() || undefined,
          serviceIds: selectedServiceIds.length > 0 ? selectedServiceIds : undefined,
          budgetAmount: amount,
          budgetType,
          saleDate: saleDate || undefined,
          notes: notes.trim() || undefined,
          initialPaymentAmount: initialPaymentAmount.trim() ? Number(initialPaymentAmount) : undefined,
          initialPaymentMethod: initialPaymentAmount.trim() ? initialPaymentMethod : undefined,
          ...(isMarketingHead
            ? {
                soldByType,
                soldByUserId: soldByUserId ? Number(soldByUserId) : undefined,
                soldByCustomName: soldByType === "CUSTOM" ? soldByCustomName.trim() : undefined,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not record the sale.", {
          403: "You are not allowed to do that.",
        });
        setCreateError(message);
        toast.error("Could not record sale", message);
        setCreating(false);
        return;
      }

      await response.json();
      toast.success("Sale recorded", leadId ? leadOptions.find((l) => String(l.id) === leadId)?.company_name : companyName.trim());
      router.push("/sales");
    } catch {
      setCreateError("Could not record the sale.");
      toast.error("Could not record sale");
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form onSubmit={handleCreateSubmit} className="grid grid-cols-3 gap-4" noValidate>
        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="leadId" className="text-sm font-medium text-zinc-700">
            Company from lead list
          </label>
          <select
            id="leadId"
            value={leadId}
            onChange={(event) => setLeadId(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">— Enter company details manually —</option>
            {leadOptions.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.company_name}
              </option>
            ))}
          </select>
        </div>

        {!leadId && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="companyName" className="text-sm font-medium text-zinc-700">
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contactPerson" className="text-sm font-medium text-zinc-700">
                Contact person
              </label>
              <input
                id="contactPerson"
                type="text"
                value={contactPerson}
                onChange={(event) => setContactPerson(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
                Phone
              </label>
              <input
                id="phone"
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="address" className="text-sm font-medium text-zinc-700">
                Address
              </label>
              <input
                id="address"
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </>
        )}

        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="serviceInterested" className="text-sm font-medium text-zinc-700">
            Service interested
          </label>
          <MultiSelectSearch
            id="serviceInterested"
            options={serviceOptions}
            selectedIds={selectedServiceIds}
            onChange={setSelectedServiceIds}
            placeholder="Search services…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetAmount" className="text-sm font-medium text-zinc-700">
            Budget
          </label>
          <input
            id="budgetAmount"
            type="number"
            min="0"
            step="any"
            value={budgetAmount}
            onChange={(event) => setBudgetAmount(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetType" className="text-sm font-medium text-zinc-700">
            Payment type
          </label>
          <select
            id="budgetType"
            value={budgetType}
            onChange={(event) => setBudgetType(event.target.value as SaleBudgetType)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {SALE_BUDGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {BUDGET_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="saleDate" className="text-sm font-medium text-zinc-700">
            Date
          </label>
          <input
            id="saleDate"
            type="date"
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="col-span-3 grid grid-cols-3 gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="col-span-3 text-xs font-medium text-zinc-500">Record a payment now (optional — e.g. an advance)</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="initialPaymentAmount" className="text-sm font-medium text-zinc-700">
              Amount
            </label>
            <input
              id="initialPaymentAmount"
              type="number"
              min="0"
              step="any"
              value={initialPaymentAmount}
              onChange={(event) => setInitialPaymentAmount(event.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="initialPaymentMethod" className="text-sm font-medium text-zinc-700">
              Payment method
            </label>
            <select
              id="initialPaymentMethod"
              value={initialPaymentMethod}
              onChange={(event) => setInitialPaymentMethod(event.target.value as SalePaymentMethod)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {SALE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isMarketingHead && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="soldByType" className="text-sm font-medium text-zinc-700">
                Sold by
              </label>
              <select
                id="soldByType"
                value={soldByType}
                onChange={(event) => {
                  setSoldByType(event.target.value as SaleSoldByType);
                  setSoldByUserId("");
                  setSoldByCustomName("");
                }}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="SELF">Myself</option>
                <option value="CUSTOM">Custom name</option>
                <option value="PRE_SALES">Pre-sales user</option>
                <option value="SALESPERSON">Salesperson</option>
              </select>
            </div>

            {soldByType === "CUSTOM" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="soldByCustomName" className="text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="soldByCustomName"
                  type="text"
                  value={soldByCustomName}
                  onChange={(event) => setSoldByCustomName(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            )}

            {(soldByType === "PRE_SALES" || soldByType === "SALESPERSON") && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="soldByUserId" className="text-sm font-medium text-zinc-700">
                  {soldByType === "PRE_SALES" ? "Pre-sales user" : "Salesperson"}
                </label>
                <select
                  id="soldByUserId"
                  value={soldByUserId}
                  onChange={(event) => setSoldByUserId(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Select…</option>
                  {(soldByType === "PRE_SALES" ? preSalesOptions : salespersonOptions).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {createError && (
          <p role="alert" className="col-span-3 text-sm text-red-600">
            {createError}
          </p>
        )}

        <div className="col-span-3 mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/sales")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
