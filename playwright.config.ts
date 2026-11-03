import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use the pre-installed Chromium when Playwright's own build is not downloaded.
const fallback = '/home/div-dev/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const executablePath = process.env.PW_CHROME ?? (existsSync(fallback) ? fallback : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath } },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
