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
    const hostname = new URL(withScheme).hostname.toLowerCase();
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
