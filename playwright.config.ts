import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      DATABASE_URL:
        "postgresql://neondb_owner:npg_XH76IiTONnUY@ep-weathered-flower-aezw517w-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require",
      AUTH_SECRET: "xelera-sdr-local-secret-2026",
      AUTH_TRUST_HOST: "true",
      NEXTAUTH_URL: "http://localhost:3000",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
