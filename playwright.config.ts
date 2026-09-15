import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000/capture",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_APP_ENV: "e2e",
    },
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
