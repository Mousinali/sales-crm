export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const hostname = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    // A real domain has at least one dot (e.g. "acme.com"). Without this,
    // a placeholder value like "N/A" or "none" parses to a single-label
    // "hostname" (e.g. "n"), and two leads that both left the field blank
    // in the same way would wrongly flag each other as duplicates.
    return hostname.includes(".") ? hostname : null;
  } catch {
    return null;
  }
}
