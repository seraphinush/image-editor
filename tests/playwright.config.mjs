import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:18766",
    trace: "off",
  },
  webServer: {
    command: `node ./server.mjs`,
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    url: "http://127.0.0.1:18766",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        // Emulate iPhone metrics in Chromium (webkit binary not required for this suite).
        browserName: "chromium",
      },
    },
  ],
  metadata: { appRoot: root },
});
