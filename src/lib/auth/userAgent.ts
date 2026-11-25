export type ClientInfo = { device: "Mobile" | "Tablet" | "Desktop"; browser: string; os: string };

// shortcut: regex sniffing of the User-Agent, not a full UA database — iPadOS 13+
// reports as a Mac desktop and unknown browsers show "Other"; swap in a UA library if that matters.
export function parseUserAgent(ua: string | null | undefined): ClientInfo {
  const s = ua ?? "";
  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox"
    : /Chrome\/|CriOS/.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari"
    : "Other";
  const os =
    /Windows/.test(s) ? "Windows"
    : /Android/.test(s) ? "Android"
    : /iPhone|iPad|iPod/.test(s) ? "iOS"
    : /Mac OS X|Macintosh/.test(s) ? "macOS"
    : /CrOS/.test(s) ? "ChromeOS"
    : /Linux/.test(s) ? "Linux"
    : "Other";
  const device =
    /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? "Tablet"
    : /Mobi|iPhone|iPod|Android/.test(s) ? "Mobile"
    : "Desktop";
  return { device, browser, os };
}
