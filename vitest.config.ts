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
    // .claude/worktrees/** holds nested git worktrees (each a full copy of
    // this project, including its own test files) — without this, Vitest's
    // default glob walks into them too and runs every test twice against
    // the same database.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.claude/**"],
  },
});
