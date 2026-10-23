import { config } from "dotenv";
config({ path: ".env.local" });

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest's `globals` option is off, so Testing Library's automatic
// afterEach cleanup (which relies on detecting a global `afterEach`)
// never registers. Unmount rendered components explicitly instead,
// so DOM from one test doesn't leak into the next.
afterEach(() => {
  cleanup();
});

// jsdom's `window.location` setter attempts a real navigation and logs
// "Not implemented: navigation to another Document" to stderr. Components
// under test set `window.location.href` on success (e.g. LoginForm); swap
// in a plain object so that assignment is a harmless property set instead.
if (typeof window !== "undefined") {
  delete (window as unknown as { location?: unknown }).location;
  (window as unknown as { location: Location }).location = { href: "" } as Location;
}
