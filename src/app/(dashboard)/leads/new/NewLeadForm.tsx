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
import { INDUSTRIES, DESIGNATIONS } from "@/app/(dashboard)/leadOptions";
import RichTextField from "@/components/ui/RichTextField";
import MoneyInput from "@/components/ui/MoneyInput";
import SocialLinksField, { EMPTY_SOCIAL_LINKS, type SocialLinks } from "@/app/(dashboard)/leads/SocialLinksField";
import type { ServiceRow } from "@/lib/services/types";
import { leadFieldChecks } from "@/app/(dashboard)/leads/leadFieldChecks";
import DigitsInput from "@/components/ui/DigitsInput";

type DuplicateMatch = { id: number; companyName: string; status: LeadStatus };

// Twenty fields on one screen is a wall; the wizard shows one group at a time.
// Every field stays mounted in component state, so stepping back and forth
// never loses what was typed.
const STEPS = ["Company", "Address", "Contact", "Opportunity"] as const;
const LAST_STEP = STEPS.length - 1;

function StepIndicator({ current, onSelect }: { current: number; onSelect: (step: number) => void }) {
  return (
    <ol className="col-span-full mb-2 flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              // Only steps already visited are clickable — jumping ahead would
              // skip past fields the person hasn't seen yet.
              onClick={() => onSelect(index)}
              disabled={index > current}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white"
                  : done
                    ? "text-brand-700 hover:bg-brand-50"
                    : "cursor-not-allowed text-zinc-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? "bg-white/20" : done ? "bg-brand-100" : "bg-zinc-100"
                }`}
              >
                {done ? <i className="ri-check-line" aria-hidden="true" /> : index + 1}
              </span>
              {label}
            </button>
            {index < LAST_STEP && <span className="text-zinc-300" aria-hidden="true">/</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function NewLeadForm({ serviceOptions }: { serviceOptions: ServiceRow[] }) {
  const router = useRouter();

  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [leadState, setLeadState] = useState("West Bengal");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [gstNumber, setGstNumber] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneSameAsWhatsapp, setPhoneSameAsWhatsapp] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  function toggleSameAsWhatsapp(checked: boolean) {
    setPhoneSameAsWhatsapp(checked);
    if (checked) setWhatsappNumber(phone);
  }

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (phoneSameAsWhatsapp) setWhatsappNumber(value);
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
  const [step, setStep] = useState(0);
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

  // The required fields are spread across three different steps, so an error
  // has to say which step it belongs to — otherwise submitting on the last step
  // complains about a field that isn't even rendered and the person is stuck.
  const requiredFields = [
    { step: 0, fieldId: "companyName", missing: !companyName.trim(), message: "Enter a company name." },
    { step: 2, fieldId: "phone", missing: !phone.trim(), message: "Enter a phone number." },
    {
      step: 3,
      fieldId: "serviceInterested",
      missing: selectedServiceIds.length === 0,
      message: "Select at least one service.",
    },
    ...leadFieldChecks({ pincode, gstNumber, phone, whatsappNumber, email, website, socialLinks }).map((c) => ({
      step: c.step, fieldId: c.fieldId, missing: c.invalid, message: c.message,
    })),
  ];

  // Sends the person to the offending field rather than just naming it.
  function reportMissing(field: { step: number; fieldId: string; message: string }) {
    setCreateError(field.message);
    setStep(field.step);
    // Deferred: on a jump to another step the field isn't mounted yet.
    requestAnimationFrame(() => {
      const el = document.getElementById(field.fieldId);
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function goNext() {
    // Validate only what belongs to the step being left, so nobody is blocked
    // by a field they haven't reached yet.
    const missing = requiredFields.find((f) => f.step === step && f.missing);
    if (missing) {
      reportMissing(missing);
      return;
    }
    setCreateError(null);
    setStep((current) => Math.min(current + 1, LAST_STEP));
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Enter inside any field submits the form, so on an earlier step that must
    // advance the wizard rather than create a half-filled lead.
    if (step < LAST_STEP) {
      goNext();
      return;
    }

    const missing = requiredFields.find((f) => f.missing);
    if (missing) {
      reportMissing(missing);
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
          gstNumber: gstNumber.trim() || undefined,
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
      router.refresh(); // drop cached list pages so the new record shows up
    } catch {
      setCreateError("Could not create the lead.");
      toast.error("Could not create lead");
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <StepIndicator current={step} onSelect={setStep} />

        {step === 0 && (
          <>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="industry" className="text-sm font-medium text-zinc-700">
            Industry type
          </label>
          <CustomSelect id="industry" placeholder="Select Industry" value={industry} onChange={setIndustry} options={INDUSTRIES.map((o) => ({ value: o, label: o }))} />
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

        {/* Sits with the Company field whose blur triggers the check, rather
            than stranded at the end of a later section. */}
        {duplicates.length > 0 && (
          <div role="alert" className="col-span-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">This looks like it might already be a similar lead:</p>
            <ul className="mt-1 list-inside list-disc">
              {duplicates.map((d) => (
                <li key={d.id}>{d.companyName}</li>
              ))}
            </ul>
          </div>
        )}

          </>
        )}

        {step === 1 && (
          <>
        {/* Wider than the rest: a street address needs the room, and it makes
            the row read Address + State, then Pincode + Country + GST. */}
        <div className="flex flex-col gap-1.5 lg:col-span-2">
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

          </>
        )}

        {step === 2 && (
          <>
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
          <CustomSelect id="designation" placeholder="Select Designation" value={designation} onChange={setDesignation} options={DESIGNATIONS.map((o) => ({ value: o, label: o }))} />
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
            onBlur={checkDuplicates}
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

          </>
        )}

        {step === 3 && (
          <>
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
            options={SELECTABLE_LEAD_BUDGET_TYPES.map((type) => ({
              value: type,
              label: LEAD_BUDGET_TYPE_LABELS[type],
            }))}
          />
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
          <CustomSelect
            id="priority"
            value={priority}
            onChange={(value) => setPriority(value as LeadPriority)}
            options={LEAD_PRIORITIES.map((p) => ({ value: p, label: LEAD_PRIORITY_LABELS[p] }))}
          />
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
          </>
        )}

        {createError && (
          <div
            role="alert"
            className="col-span-full flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm/5 text-red-700"
          >
            {/* leading-5 matches the text's line box, so the icon lines up with
                the first line instead of sitting low — and stays aligned if the
                message wraps. */}
            <i className="ri-error-warning-line shrink-0 text-base leading-5" aria-hidden="true" />
            <span>{createError}</span>
          </div>
        )}

        <div className="col-span-full mt-2 flex items-center justify-between gap-3 border-t border-zinc-200 pt-5">
          <button
            type="button"
            onClick={() => router.push("/leads")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              Step {step + 1} of {STEPS.length}
            </span>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                Back
              </button>
            )}
            {step < LAST_STEP ? (
              // type="button", not submit: the form's onSubmit is reserved for
              // the final Create so Enter can't skip the remaining steps.
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
