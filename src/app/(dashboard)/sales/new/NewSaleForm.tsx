"use client";

import DateField from "@/components/ui/DateField";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { SALE_BUDGET_TYPES, type SaleBudgetType, type SaleSoldByType } from "@/lib/sales/types";
import CustomSelect from "@/components/ui/CustomSelect";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import RichTextField from "@/components/ui/RichTextField";
import MoneyInput from "@/components/ui/MoneyInput";
import type { ServiceRow } from "@/lib/services/types";
import type { SaleLeadOption } from "@/lib/sales/leadOptions";

const BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

type SimpleLead = { id: number; company_name: string };
type SimpleUser = { id: number; name: string };

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewSaleForm({ serviceOptions, isAccountant }: { serviceOptions: ServiceRow[]; isAccountant: boolean }) {
  const router = useRouter();

  // Company: either chosen from the lead list (which fills the fields below
  // from that lead, still editable for this sale) or typed fresh.
  const [leadOptions, setLeadOptions] = useState<SimpleLead[]>([]);
  // An Accountant can't open leads, so their picker (and prefill) comes from this instead.
  const [accountantLeads, setAccountantLeads] = useState<SaleLeadOption[]>([]);
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

  // "Sold by" defaults to self but anyone recording a sale can credit it
  // to someone else instead.
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
    fetch(isAccountant ? "/api/sales/lead-options" : "/api/leads?pageSize=100")
      .then((res) => (res.ok ? res.json() : { leads: [] }))
      .then((body) => (isAccountant ? (setAccountantLeads(body.leads ?? []), setLeadOptions(body.leads ?? [])) : setLeadOptions(((body.leads ?? []) as (SimpleLead & { status: string })[]).filter((l) => l.status !== "REJECTED" && l.status !== "CLOSED_LOST"))))
      .catch(() => {});
  }, [isAccountant]);

  useEffect(() => {
    fetch("/api/users?role=PRE_SALES&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setPreSalesOptions(body.users ?? []))
      .catch(() => {});
    fetch("/api/users?role=SALESPERSON&status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((body) => setSalespersonOptions(body.users ?? []))
      .catch(() => {});
  }, []);

  // Picking a lead fills the company fields, its estimated budget, and its
  // interested services from that lead's record — still editable here, and
  // more services can be added on top, without changing the lead itself.
  useEffect(() => {
    if (!leadId) return;
    const accountantLead = accountantLeads.find((l) => String(l.id) === leadId);
    (isAccountant
      ? Promise.resolve(accountantLead ? { ...accountantLead, services: accountantLead.service_ids.map((id) => ({ id })) } : null)
      : fetch(`/api/leads/${leadId}`).then((res) => (res.ok ? res.json() : null))
    )
      .then(
        (
          lead: {
            company_name: string;
            contact_person: string | null;
            phone: string | null;
            email: string | null;
            address: string | null;
            estimated_budget: string | null;
            budget_type: SaleBudgetType | null;
            services?: { id: number }[];
          } | null,
        ) => {
          if (!lead) return;
          setCompanyName(lead.company_name ?? "");
          setContactPerson(lead.contact_person ?? "");
          setPhone(lead.phone ?? "");
          setEmail(lead.email ?? "");
          setAddress(lead.address ?? "");
          if (lead.estimated_budget != null) setBudgetAmount(lead.estimated_budget);
          if (lead.budget_type) setBudgetType(lead.budget_type);
          setSelectedServiceIds(lead.services ? lead.services.map((s) => s.id) : []);
        },
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

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
    if (soldByType === "CUSTOM" && !soldByCustomName.trim()) {
      setCreateError("Enter a name for who sold this.");
      return;
    }
    if ((soldByType === "PRE_SALES" || soldByType === "SALESPERSON") && !soldByUserId) {
      setCreateError(`Choose a ${soldByType === "PRE_SALES" ? "Pre-sales" : "Salesperson"} user.`);
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: leadId ? Number(leadId) : undefined,
          companyName: companyName.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          serviceIds: selectedServiceIds.length > 0 ? selectedServiceIds : undefined,
          budgetAmount: amount,
          budgetType,
          saleDate: saleDate || undefined,
          notes: notes.trim() || undefined,
          soldByType,
          soldByUserId: soldByUserId ? Number(soldByUserId) : undefined,
          soldByCustomName: soldByType === "CUSTOM" ? soldByCustomName.trim() : undefined,
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
      <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="leadId" className="text-sm font-medium text-zinc-700">
            Company from lead list
          </label>
          <CustomSelect
            id="leadId"
            value={leadId}
            onChange={setLeadId}
            options={[{ value: "", label: "— Enter company details manually —" }, ...leadOptions.map((lead) => ({ value: String(lead.id), label: lead.company_name }))]}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="companyName" className="text-sm font-medium text-zinc-700">
            Company name
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
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

        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor="address" className="text-sm font-medium text-zinc-700">
            Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="saleDate" className="text-sm font-medium text-zinc-700">
            Date
          </label>
          <DateField id="saleDate" value={saleDate} onChange={setSaleDate} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetAmount" className="text-sm font-medium text-zinc-700">
            Budget
          </label>
          <MoneyInput
            id="budgetAmount"
            value={budgetAmount}
            onValueChange={setBudgetAmount}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetType" className="text-sm font-medium text-zinc-700">
            Payment type
          </label>
          <CustomSelect
            id="budgetType"
            value={budgetType}
            onChange={(value) => setBudgetType(value as SaleBudgetType)}
            options={SALE_BUDGET_TYPES.map((type) => ({ value: type, label: BUDGET_TYPE_LABELS[type] }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="soldByType" className="text-sm font-medium text-zinc-700">
            Sold by
          </label>
          <CustomSelect
            id="soldByType"
            value={soldByType}
            onChange={(value) => {
              setSoldByType(value as SaleSoldByType);
              setSoldByUserId("");
              setSoldByCustomName("");
            }}
            options={[
              { value: "SELF", label: "Myself" },
              { value: "CUSTOM", label: "Custom name" },
              { value: "PRE_SALES", label: "Pre-sales user" },
              { value: "SALESPERSON", label: "Salesperson" },
            ]}
          />
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
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
        )}

        {(soldByType === "PRE_SALES" || soldByType === "SALESPERSON") && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="soldByUserId" className="text-sm font-medium text-zinc-700">
              {soldByType === "PRE_SALES" ? "Pre-sales user" : "Salesperson"}
            </label>
            <CustomSelect
              id="soldByUserId"
              value={soldByUserId}
              onChange={setSoldByUserId}
              placeholder="Select…"
              options={(soldByType === "PRE_SALES" ? preSalesOptions : salespersonOptions).map((u) => ({ value: String(u.id), label: u.name }))}
            />
          </div>
        )}

        <div className="col-span-full flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Notes
          </label>
          <RichTextField id="notes" value={notes} onChange={setNotes} rows={3} />
        </div>

        {createError && (
          <p role="alert" className="col-span-full text-sm text-red-600">
            {createError}
          </p>
        )}

        <div className="col-span-full mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/sales")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
