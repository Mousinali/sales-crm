import type { IncomingHttpHeaders } from "node:http";

/** False for a path Next would answer with a 500: malformed percent-encoding, or an encoded NUL. */
export function isDecodableUrl(url: string | undefined): boolean {
  try {
    return !decodeURIComponent((url ?? "/").split("?", 1)[0]).includes("\0");
  } catch {
    return false;
  }
}

/** Whether the browser says another site made this request. Non-browser clients send neither header. */
export function isCrossSite(headers: IncomingHttpHeaders): boolean {
  const site = headers["sec-fetch-site"];
  // same-site (a sibling subdomain) is refused too: the app only ever calls itself.
  if (site) return site !== "same-origin" && site !== "none";
  if (!headers.origin) return false;
  try {
    return new URL(headers.origin).host !== headers.host;
  } catch {
    return true;
  }
}
