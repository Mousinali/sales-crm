import { describe, it, expect } from "vitest";
import { parseUserAgent } from "./userAgent";

describe("parseUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", { device: "Desktop", browser: "Chrome", os: "Windows" }],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0", { device: "Desktop", browser: "Edge", os: "Windows" }],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", { device: "Desktop", browser: "Safari", os: "macOS" }],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", { device: "Mobile", browser: "Safari", os: "iOS" }],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36", { device: "Mobile", browser: "Chrome", os: "Android" }],
    ["Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", { device: "Tablet", browser: "Chrome", os: "Android" }],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0", { device: "Desktop", browser: "Firefox", os: "Linux" }],
    ["", { device: "Desktop", browser: "Other", os: "Other" }],
  ])("%s", (ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected);
  });
});
