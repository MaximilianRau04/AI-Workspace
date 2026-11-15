import { defineConfig, devices } from "@playwright/test";

const PORT = 5055;
const python = process.env.E2E_PYTHON || "../backend/venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Backend against a throwaway DB and config; serves the built frontend from dist/.
    command: `${python} ../backend/tests/e2e_server.py`,
    url: `http://127.0.0.1:${PORT}/login`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
