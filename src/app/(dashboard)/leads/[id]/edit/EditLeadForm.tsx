"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { LEAD_PRIORITIES, type LeadPriority, type LeadBudgetType, type LeadRow } from "@/lib/leads/types";
import { LEAD_PRIORITY_LABELS, LEAD_BUDGET_TYPE_LABELS, SELECTABLE_LEAD_BUDGET_TYPES } from "@/app/(dashboard)/leadDisplay";
import { INDIAN_STATES } from "@/app/(dashboard)/indianStates";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import CustomSelect from "@/components/ui/CustomSelect";
import RichTextField from "@/components/ui/RichTextField";
import SocialLinksField, { type SocialLinks } from "@/app/(dashboard)/leads/SocialLinksField";
import type { ServiceRow } from "@/lib/services/types";

export default function EditLeadForm({
  lead,
  serviceOptions,
  initialServiceIds,
}: {
  lead: LeadRow;
  serviceOptions: ServiceRow[];
  initialServiceIds: number[];
}) {
  const router = useRouter();

  const [industry, setIndustry] = useState(lead.industry ?? "");
  const [businessType, setBusinessType] = useState(lead.business_type ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [leadState, setLeadState] = useState(lead.state ?? "");
  const [pincode, setPincode] = useState(lead.pincode ?? "");
  const [country, setCountry] = useState(lead.country);
  const [gstNumber, setGstNumber] = useState(lead.gst_number ?? "");
  const [contactPerson, setContactPerson] = useState(lead.contact_person ?? "");
  const [designation, setDesignation] = useState(lead.designation ?? "");
  const [phone, setPhone] = useState(lead.phone);
  const [phoneSameAsWhatsapp, setPhoneSameAsWhatsapp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState(lead.whatsapp_number ?? "");

  function toggleSameAsWhatsapp(checked: boolean) {
    setPhoneSameAsWhatsapp(checked);
    if (checked) setWhatsappNumber(phone);
  }

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (phoneSameAsWhatsapp) setWhatsappNumber(value);
  }
  const [email, setEmail] = useState(lead.email ?? "");
  const [website, setWebsite] = useState(lead.website ?? "");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(initialServiceIds);
  const [estimatedBudget, setEstimatedBudget] = useState(lead.estimated_budget ?? "");
  const [budgetType, setBudgetType] = useState<LeadBudgetType | "">(lead.budget_type ?? "");
  // "Advance" was dropped from the default pick list, but a lead already
  // saved with it (or any other value outside the current list) must still
  // show its real value instead of silently falling back to the browser's
  // first option.
  const budgetTypeOptions =
    lead.budget_type && !SELECTABLE_LEAD_BUDGET_TYPES.includes(lead.budget_type)
      ? [...SELECTABLE_LEAD_BUDGET_TYPES, lead.budget_type]
      : SELECTABLE_LEAD_BUDGET_TYPES;
  const stateOptions = lead.state && !(INDIAN_STATES as readonly string[]).includes(lead.state) ? [...INDIAN_STATES, lead.state] : INDIAN_STATES;
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [remarks, setRemarks] = useState(lead.remarks ?? "");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    youtubeUrl: lead.youtube_url ?? "",
    facebookUrl: lead.facebook_url ?? "",
    instagramUrl: lead.instagram_url ?? "",
    linkedinUrl: lead.linkedin_url ?? "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSaveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) {
      setSaveError("Enter a phone number.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setSaveError("Select at least one service.");
      return;
    }

    setSaveError(null);
    setSaving(true);

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
          gstNumber: gstNumber.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          designation: designation.trim() || undefined,
          phone: phone.trim(),
          whatsappNumber: whatsappNumber.trim() || undefined,
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          serviceIds: selectedServiceIds,
          estimatedBudget: estimatedBudget.toString().trim() ? Number(estimatedBudget) : undefined,
          budgetType: budgetType || undefined,
          priority,
          notes: notes.trim() || undefined,
          remarks: remarks.trim() || undefined,
          youtubeUrl: socialLinks.youtubeUrl.trim() || undefined,
          facebookUrl: socialLinks.facebookUrl.trim() || undefined,
          instagramUrl: socialLinks.instagramUrl.trim() || undefined,
          linkedinUrl: socialLinks.linkedinUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save changes.", {
          403: "You are not allowed to do that.",
        });
        setSaveError(message);
        toast.error("Could not save changes", message);
        setSaving(false);
        return;
      }

      toast.success("Lead updated");
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } catch {
      setSaveError("Could not save changes.");
      toast.error("Could not save changes");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form onSubmit={handleSaveSubmit} className="grid grid-cols-3 gap-4" noValidate>
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
            options={stateOptions.map((state) => ({ value: state, label: state }))}
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="gstNumber" className="text-sm font-medium text-zinc-700">
            GST Number
          </label>
          <input
            id="gstNumber"
            type="text"
            value={gstNumber}
            onChange={(event) => setGstNumber(event.target.value)}
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
            onChange={(event) => handlePhoneChange(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
            onChange={(event) => setWhatsappNumber(event.target.value)}
            disabled={phoneSameAsWhatsapp}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-zinc-50 disabled:text-zinc-500"
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
            <option value="">—</option>
            {budgetTypeOptions.map((type) => (
              <option key={type} value={type}>
                {LEAD_BUDGET_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
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
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Notes
          </label>
          <RichTextField id="notes" value={notes} onChange={setNotes} rows={3} />
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

        {saveError && (
          <p role="alert" className="col-span-3 text-sm text-red-600">
            {saveError}
          </p>
        )}

        <div className="col-span-3 mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/leads/${lead.id}`)}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
