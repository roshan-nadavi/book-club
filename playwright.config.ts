import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Run tests in this file sequentially — later tests depend on IDs from earlier ones
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    // All API requests automatically include cookies stored by the context
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  // Expect your Next.js dev server to already be running.
  // If you want Playwright to start it for you automatically, uncomment below:
  //
  // webServer: {
  //   command: "npm run dev",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: true,
  // },
});