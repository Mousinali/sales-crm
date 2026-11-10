import { config } from "dotenv";
config({ path: ".env.local" });

// Integration tests exercise real CRUD code against `pool` (see src/lib/db.ts),
// which otherwise points at the same DATABASE_URL the dev server uses — every
// test run was writing real rows (users, leads, etc.) straight into dev data.
// Redirect to a sibling "_test" database instead, so test runs stay isolated.
// `npm run migrate -- ` only targets DATABASE_URL as given, so keep that
// database's schema in sync by rerunning migrations against it when needed
// (see scripts/migrate.ts; point DATABASE_URL at the _test database to do so).
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  process.env.DATABASE_URL = url.toString();
}

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
