"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/CustomSelect";
import DigitsInput from "@/components/ui/DigitsInput";
import { INDUSTRIES } from "@/app/(dashboard)/leadOptions";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { toast } from "@/lib/toast";
import type { CompanyDetail } from "@/lib/companies/get";

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

// Edits the company-wide fields; they are written to every lead of the
// company. Phone, email and contact person stay per lead (edit those on the lead).
export default function EditCompanyModal({ profile, onClose }: { profile: CompanyDetail["profile"]; onClose: () => void }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(profile.company_name);
  const [industry, setIndustry] = useState(profile.industry ?? "");
  const [businessType, setBusinessType] = useState(profile.business_type ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [pincode, setPincode] = useState(profile.pincode ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const industryOptions = (industry && !INDUSTRIES.includes(industry) ? [industry, ...INDUSTRIES] : INDUSTRIES).map((o) => ({ value: o, label: o }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyName.trim()) return setError("Enter the company name.");
    if (pincode && !/^\d{6}$/.test(pincode)) return setError("Pincode must be 6 digits.");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/companies/${profile.company_name_normalized}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName, industry, businessType, location, address, state, pincode, country, website }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not save the company.");
        setError(message);
        toast.error("Could not save company", message);
        setSaving(false);
        return;
      }
      const body = await response.json();
      toast.success("Company updated", companyName.trim());
      // The company's address is its normalized name, so a rename moves it.
      if (body.companyNameNormalized !== profile.company_name_normalized) router.push(`/companies/${body.companyNameNormalized}`);
      else {
        router.refresh();
        onClose();
      }
    } catch {
      setError("Could not save the company.");
      setSaving(false);
    }
  }

  const field = (id: string, label: string, control: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      {control}
    </div>
  );

  return (
    <Modal title="Edit company" onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">
          Changes apply to all {profile.lead_count} lead{profile.lead_count === 1 ? "" : "s"} of this company. Phone, email and contact person stay on each lead.
        </p>
        {field("company-name", "Company name", <input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("company-industry", "Industry", <CustomSelect id="company-industry" placeholder="Select Industry" value={industry} onChange={setIndustry} options={industryOptions} />)}
          {field("company-business-type", "Business type", <input id="company-business-type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass} />)}
        </div>
        {field("company-address", "Address", <input id="company-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("company-location", "City / location", <input id="company-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />)}
          {field("company-state", "State", <input id="company-state" value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />)}
          {field("company-pincode", "Pincode", <DigitsInput id="company-pincode" value={pincode} onValueChange={setPincode} maxLength={6} className={inputClass} />)}
          {field("company-country", "Country", <input id="company-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />)}
        </div>
        {field("company-website", "Website", <input id="company-website" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />)}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
