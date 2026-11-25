import { describe, it, expect } from "vitest";
import { isCrossSite, isDecodableUrl } from "./requestGuards";

describe("isDecodableUrl", () => {
  it.each([["/leads/1", true], ["/companies/a%20b?q=%00", true], ["/api/leads/%E0%A4%A", false], ["/companies/%00", false]])("%s", (url, ok) => {
    expect(isDecodableUrl(url)).toBe(ok);
  });
});

describe("isCrossSite", () => {
  it.each([
    [{ "sec-fetch-site": "same-origin" }, false],
    [{ "sec-fetch-site": "none" }, false],
    [{ "sec-fetch-site": "cross-site" }, true],
    [{ "sec-fetch-site": "same-site" }, true],
    [{ origin: "https://crm.example", host: "crm.example" }, false],
    [{ origin: "https://evil.example", host: "crm.example" }, true],
    [{ origin: "null", host: "crm.example" }, true],
    [{ host: "crm.example" }, false],
  ])("%j", (headers, cross) => {
    expect(isCrossSite(headers)).toBe(cross);
  });
});
