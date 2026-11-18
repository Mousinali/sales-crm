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
import { INDUSTRIES, DESIGNATIONS } from "@/app/(dashboard)/leadOptions";
import RichTextField from "@/components/ui/RichTextField";
import MoneyInput from "@/components/ui/MoneyInput";
import SocialLinksField, { type SocialLinks } from "@/app/(dashboard)/leads/SocialLinksField";
import type { ServiceRow } from "@/lib/services/types";
import { leadFieldChecks } from "@/app/(dashboard)/leads/leadFieldChecks";
import { digitsOnly } from "@/lib/validation";
import DigitsInput from "@/components/ui/DigitsInput";

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
  const [pincode, setPincode] = useState(digitsOnly(lead.pincode ?? "", 6));
  const [country, setCountry] = useState(lead.country);
  const [gstNumber, setGstNumber] = useState(lead.gst_number ?? "");
  const [contactPerson, setContactPerson] = useState(lead.contact_person ?? "");
  const [designation, setDesignation] = useState(lead.designation ?? "");
  const [phone, setPhone] = useState(digitsOnly(lead.phone, 15));
  const [phoneSameAsWhatsapp, setPhoneSameAsWhatsapp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState(digitsOnly(lead.whatsapp_number ?? "", 15));

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

    const invalid = leadFieldChecks({ pincode, gstNumber, phone, whatsappNumber, email, website, socialLinks }).find((c) => c.invalid);
    if (invalid) {
      setSaveError(invalid.message);
      document.getElementById(invalid.fieldId)?.focus();
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
      <form onSubmit={handleSaveSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="industry" className="text-sm font-medium text-zinc-700">
            Industry type
          </label>
          <CustomSelect id="industry" placeholder="Select Industry" value={industry} onChange={setIndustry} options={(INDUSTRIES.includes(industry) || !industry ? INDUSTRIES : [industry, ...INDUSTRIES]).map((o) => ({ value: o, label: o }))} />
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
          <DigitsInput
            id="pincode"
            value={pincode}
            onValueChange={setPincode}
            maxLength={6}
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
            onChange={(event) => setGstNumber(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))}
            maxLength={15}
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
          <CustomSelect id="designation" placeholder="Select Designation" value={designation} onChange={setDesignation} options={(DESIGNATIONS.includes(designation) || !designation ? DESIGNATIONS : [designation, ...DESIGNATIONS]).map((o) => ({ value: o, label: o }))} />
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
          <DigitsInput
            id="phone"
            value={phone}
            onValueChange={handlePhoneChange}
            maxLength={15}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="whatsappNumber" className="text-sm font-medium text-zinc-700">
            WhatsApp number
          </label>
          <DigitsInput
            id="whatsappNumber"
            value={whatsappNumber}
            onValueChange={setWhatsappNumber}
            maxLength={15}
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
          <MoneyInput
            id="estimatedBudget"
            value={estimatedBudget}
            onValueChange={setEstimatedBudget}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="budgetType" className="text-sm font-medium text-zinc-700">
            Budget type
          </label>
          <CustomSelect
            id="budgetType"
            value={budgetType}
            onChange={(value) => setBudgetType(value as LeadBudgetType | "")}
            options={[
              { value: "", label: "—" },
              ...budgetTypeOptions.map((type) => ({ value: type, label: LEAD_BUDGET_TYPE_LABELS[type] })),
            ]}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="priority" className="text-sm font-medium text-zinc-700">
            Priority
          </label>
          <CustomSelect
            id="priority"
            value={priority}
            onChange={(value) => setPriority(value as LeadPriority)}
            options={LEAD_PRIORITIES.map((p) => ({ value: p, label: LEAD_PRIORITY_LABELS[p] }))}
          />
        </div>

        <div className="col-span-full flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Notes
          </label>
          <RichTextField id="notes" value={notes} onChange={setNotes} rows={3} />
        </div>

        <div className="col-span-full flex flex-col gap-1.5">
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
          <p role="alert" className="col-span-full text-sm text-red-600">
            {saveError}
          </p>
        )}

        <div className="col-span-full mt-2 flex justify-end gap-3">
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
