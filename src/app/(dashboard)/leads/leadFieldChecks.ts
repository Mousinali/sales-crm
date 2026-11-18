import {
  isValidPhone, isValidEmail, isValidPincode, isValidGst, isValidWebsite, isValidUrl,
  PHONE_MESSAGE, EMAIL_MESSAGE, PINCODE_MESSAGE, GST_MESSAGE, WEBSITE_MESSAGE, URL_MESSAGE,
} from "@/lib/validation";
import type { SocialLinks } from "./SocialLinksField";

export type LeadFieldValues = {
  pincode: string; gstNumber: string; phone: string; whatsappNumber: string;
  email: string; website: string; socialLinks: SocialLinks;
};

// `step` is the wizard step the field lives on in the new-lead form; the edit form ignores it.
export function leadFieldChecks(v: LeadFieldValues) {
  const checks = [
    { step: 1, fieldId: "pincode", value: v.pincode, ok: isValidPincode, message: PINCODE_MESSAGE },
    { step: 1, fieldId: "gstNumber", value: v.gstNumber, ok: isValidGst, message: GST_MESSAGE },
    { step: 2, fieldId: "phone", value: v.phone, ok: isValidPhone, message: PHONE_MESSAGE },
    { step: 2, fieldId: "whatsappNumber", value: v.whatsappNumber, ok: isValidPhone, message: PHONE_MESSAGE },
    { step: 2, fieldId: "email", value: v.email, ok: isValidEmail, message: EMAIL_MESSAGE },
    { step: 2, fieldId: "website", value: v.website, ok: isValidWebsite, message: WEBSITE_MESSAGE },
    ...(Object.keys(v.socialLinks) as (keyof SocialLinks)[]).map((key) => ({
      step: 3, fieldId: key, value: v.socialLinks[key], ok: isValidUrl, message: URL_MESSAGE,
    })),
  ];
  // Blank optional fields are fine; only a typed value can be invalid.
  return checks.map((c) => ({ ...c, invalid: c.value.trim() !== "" && !c.ok(c.value.trim()) }));
}
