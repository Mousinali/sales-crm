import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one _test database (see vitest.setup.ts) and
    // broadcast notifications to "all other active users" — running test
    // files concurrently lets one file's broadcast reference another file's
    // in-flight users, which then fails that file's own cleanup with a
    // foreign-key error. Serializing files avoids the cross-file race.
    fileParallelism: false,
    // .claude/worktrees/** holds nested git worktrees (each a full copy of
    // this project, including its own test files) — without this, Vitest's
    // default glob walks into them too and runs every test twice against
    // the same database.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.claude/**"],
  },
});
