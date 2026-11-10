"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { LEAD_SOURCES, LEAD_PRIORITIES, type LeadSource, type LeadPriority, type LeadStatus, type LeadBudgetType } from "@/lib/leads/types";
import { LEAD_PRIORITY_LABELS, LEAD_BUDGET_TYPE_LABELS, LEAD_SOURCE_LABELS, LEAD_SOURCE_ICONS, SELECTABLE_LEAD_BUDGET_TYPES } from "@/app/(dashboard)/leadDisplay";
import { INDIAN_STATES } from "@/app/(dashboard)/indianStates";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import CustomSelect from "@/components/ui/CustomSelect";
import RichTextField from "@/components/ui/RichTextField";
import SocialLinksField, { EMPTY_SOCIAL_LINKS, type SocialLinks } from "@/app/(dashboard)/leads/SocialLinksField";
import type { ServiceRow } from "@/lib/services/types";

type DuplicateMatch = { id: number; companyName: string; status: LeadStatus };

export default function NewLeadForm({ serviceOptions }: { serviceOptions: ServiceRow[] }) {
  const router = useRouter();

  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [leadState, setLeadState] = useState("West Bengal");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [contactPerson, setContactPerson] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneSameAsWhatsapp, setPhoneSameAsWhatsapp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  function toggleSameAsWhatsapp(checked: boolean) {
    setPhoneSameAsWhatsapp(checked);
    if (checked) setPhone(whatsappNumber);
  }

  function handleWhatsappChange(value: string) {
    setWhatsappNumber(value);
    if (phoneSameAsWhatsapp) setPhone(value);
  }
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [estimatedBudget, setEstimatedBudget] = useState("");
  const [budgetType, setBudgetType] = useState<LeadBudgetType | "">("ONE_TIME");
  const [remarks, setRemarks] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(EMPTY_SOCIAL_LINKS);
  const [leadSource, setLeadSource] = useState<LeadSource>(LEAD_SOURCES[0]);
  const [priority, setPriority] = useState<LeadPriority>("MEDIUM");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  async function checkDuplicates() {
    if (!companyName.trim()) return;
    // The duplicates endpoint requires both companyName and phone, but the
    // check is advisory: fire it as soon as the company name is filled in
    // (the usual case is company name first, phone second), and let a 400
    // from an incomplete query resolve to "no warning yet" rather than
    // waiting for every field before checking at all.
    const params = new URLSearchParams({ companyName: companyName.trim(), phone: phone.trim() });
    if (email.trim()) params.set("email", email.trim());
    if (website.trim()) params.set("website", website.trim());
    try {
      const response = await fetch(`/api/leads/duplicates?${params.toString()}`);
      if (!response.ok) return;
      const body = await response.json();
      setDuplicates(body.duplicates ?? []);
    } catch {
      // Duplicate-check is advisory; a failed check just means no warning shown.
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyName.trim()) {
      setCreateError("Enter a company name.");
      return;
    }
    if (!phone.trim()) {
      setCreateError("Enter a phone number.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setCreateError("Select at least one service.");
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          industry: industry.trim() || undefined,
          businessType: businessType.trim() || undefined,
          companyName: companyName.trim(),
          address: address.trim() || undefined,
          state: leadState.trim() || undefined,
          pincode: pincode.trim() || undefined,
          country: country.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          designation: designation.trim() || undefined,
          phone: phone.trim(),
          whatsappNumber: whatsappNumber.trim() || undefined,
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          serviceIds: selectedServiceIds,
          estimatedBudget: estimatedBudget.trim() ? Number(estimatedBudget) : undefined,
          budgetType: budgetType || undefined,
          remarks: remarks.trim() || undefined,
          leadSource,
          priority,
          youtubeUrl: socialLinks.youtubeUrl.trim() || undefined,
          facebookUrl: socialLinks.facebookUrl.trim() || undefined,
          instagramUrl: socialLinks.instagramUrl.trim() || undefined,
          linkedinUrl: socialLinks.linkedinUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not create the lead.", {
          403: "You are not allowed to do that.",
        });
        setCreateError(message);
        toast.error("Could not create lead", message);
        setCreating(false);
        return;
      }

      const created = await response.json();
      toast.success("Lead created", companyName.trim());
      router.push(`/leads/${created.id}`);
    } catch {
      setCreateError("Could not create the lead.");
      toast.error("Could not create lead");
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form onSubmit={handleCreateSubmit} className="grid grid-cols-3 gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="industry" className="text-sm font-medium text-zinc-700">
            Industry type
          </label>
          <input
            id="industry"
            type="text"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="businessType" className="text-sm font-medium text-zinc-700">
            Business type
          </label>
          <input
            id="businessType"
            type="text"
            value={businessType}
            onChange={(event) => setBusinessType(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="companyName" className="text-sm font-medium text-zinc-700">
            Company
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            onBlur={checkDuplicates}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="leadState" className="text-sm font-medium text-zinc-700">
            State
          </label>
          <CustomSelect
            id="leadState"
            value={leadState}
            onChange={setLeadState}
            options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pincode" className="text-sm font-medium text-zinc-700">
            Pincode
          </label>
          <input
            id="pincode"
            type="text"
            value={pincode}
            onChange={(event) => setPincode(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="country" className="text-sm font-medium text-zinc-700">
            Country
          </label>
          <input
            id="country"
            type="text"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        {duplicates.length > 0 && (
          <div role="alert" className="col-span-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">This looks like it might already be a similar lead:</p>
            <ul className="mt-1 list-inside list-disc">
              {duplicates.map((d) => (
                <li key={d.id}>{d.companyName}</li>
              ))}
            </ul>
          </div>
        )}

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
          <label htmlFor="designation" className="text-sm font-medium text-zinc-700">
            Contact person designation
          </label>
          <input
            id="designation"
            type="text"
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
              Phone
            </label>
            <label className="flex items-center gap-1.5 text-xs font-normal text-zinc-500">
              <input
                type="checkbox"
                checked={phoneSameAsWhatsapp}
                onChange={(event) => toggleSameAsWhatsapp(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 focus:ring-brand-400"
              />
              Same as WhatsApp
            </label>
          </div>
          <input
            id="phone"
            type="text"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={checkDuplicates}
            disabled={phoneSameAsWhatsapp}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-zinc-50 disabled:text-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="whatsappNumber" className="text-sm font-medium text-zinc-700">
            WhatsApp number
          </label>
          <input
            id="whatsappNumber"
            type="text"
            value={whatsappNumber}
            onChange={(event) => handleWhatsappChange(event.target.value)}
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
          <label htmlFor="website" className="text-sm font-medium text-zinc-700">
            Website
          </label>
          <input
            id="website"
            type="text"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="estimatedBudget" className="text-sm font-medium text-zinc-700">
            Estimated budget
          </label>
          <input
            id="estimatedBudget"
            type="number"
            min="0"
            step="any"
            value={estimatedBudget}
            onChange={(event) => setEstimatedBudget(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetType" className="text-sm font-medium text-zinc-700">
            Budget type
          </label>
          <select
            id="budgetType"
            value={budgetType}
            onChange={(event) => setBudgetType(event.target.value as LeadBudgetType | "")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {SELECTABLE_LEAD_BUDGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {LEAD_BUDGET_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="leadSource" className="text-sm font-medium text-zinc-700">
            Lead source
          </label>
          <CustomSelect
            id="leadSource"
            value={leadSource}
            onChange={(value) => setLeadSource(value as LeadSource)}
            options={LEAD_SOURCES.map((source) => ({ value: source, label: LEAD_SOURCE_LABELS[source], icon: LEAD_SOURCE_ICONS[source] }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="priority" className="text-sm font-medium text-zinc-700">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as LeadPriority)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="remarks" className="text-sm font-medium text-zinc-700">
            Remarks
          </label>
          <RichTextField id="remarks" value={remarks} onChange={setRemarks} rows={3} />
        </div>

        <SocialLinksField
          value={socialLinks}
          onChange={(key, url) => setSocialLinks((prev) => ({ ...prev, [key]: url }))}
        />

        {createError && (
          <p role="alert" className="col-span-3 text-sm text-red-600">
            {createError}
          </p>
        )}

        <div className="col-span-3 mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/leads")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
