import { z } from "zod";
import { extractDomain } from "@/lib/leads/normalize";

// Shared by the forms (instant feedback) and the API routes (the real check),
// so a rule can't drift between the two.

// shortcut: 10-15 digits covers Indian mobiles and E.164 numbers, no per-country rules; tighten if only India is served.
export const PHONE_MIN = 10;
export const PHONE_MAX = 15;
export const PINCODE_LENGTH = 6;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ACCOUNT_RE = /^\d{9,18}$/;

export const digitsOnly = (value: string, max?: number) => value.replace(/\D/g, "").slice(0, max);

export const isValidPhone = (v: string) => new RegExp(`^\\d{${PHONE_MIN},${PHONE_MAX}}$`).test(v);
export const isValidEmail = (v: string) => z.email().safeParse(v).success;
export const isValidPincode = (v: string) => /^\d{6}$/.test(v);
export const isValidGst = (v: string) => GST_RE.test(v);
export const isValidAccountNumber = (v: string) => ACCOUNT_RE.test(v);
export const isValidWebsite = (v: string) => extractDomain(v) !== null;
export const isValidUrl = (v: string) => z.url().safeParse(v).success;

export const PHONE_MESSAGE = `Enter a ${PHONE_MIN}-${PHONE_MAX} digit phone number (digits only).`;
export const EMAIL_MESSAGE = "Enter a valid email address.";
export const PINCODE_MESSAGE = "Enter a 6-digit pincode.";
export const GST_MESSAGE = "Enter a valid 15-character GST number (e.g. 22AAAAA0000A1Z5).";
export const WEBSITE_MESSAGE = "Enter a valid website (e.g. acme.com).";
export const URL_MESSAGE = "Enter a full link starting with https://";
export const ACCOUNT_MESSAGE = "Enter a 9-18 digit account number (digits only).";

// Optional text fields where "" means "not provided" (or "clear it").
const blankOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]);

export const phoneSchema = z.string().trim().regex(/^\d+$/, PHONE_MESSAGE).refine(isValidPhone, PHONE_MESSAGE);
export const optionalPhoneSchema = blankOr(phoneSchema);
export const pincodeSchema = z.string().trim().refine(isValidPincode, PINCODE_MESSAGE);
export const gstSchema = z.string().trim().toUpperCase().refine(isValidGst, GST_MESSAGE);
export const websiteSchema = z.string().trim().refine(isValidWebsite, WEBSITE_MESSAGE);
export const emailSchema = z.string().trim().email(EMAIL_MESSAGE);

/** Validates a form's fields in order; returns the first error (and its field id) or null. */
export function firstError(checks: [fieldId: string, value: string, ok: (v: string) => boolean, message: string][]) {
  for (const [fieldId, value, ok, message] of checks) {
    if (value.trim() && !ok(value.trim())) return { fieldId, message };
  }
  return null;
}
