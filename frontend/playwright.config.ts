import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the behaviour the PowerShell suites cannot reach.
 *
 * Those suites assert server-rendered markup, which covers a great deal — but every click-driven
 * feature (the gallery lightbox, filter checkboxes, the theme toggle, the message composer, the
 * star-rating input) needs a browser that actually hydrates React. The in-app preview browser
 * runs backgrounded, so `requestAnimationFrame` never fires and hydration never completes there.
 * This is the tool that closes that gap.
 *
 * Both servers must already be running (`npm run dev` in each) — deliberately not `webServer`,
 * because the backend seeds an in-memory database on boot and letting Playwright restart it would
 * wipe state the other suites depend on.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // One worker: the suites share a single seeded database, so parallel writes would interfere.
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    /*
     * Defaults to the dev server. Point at a production build for a quality run:
     *   npm run build && npx next start -p 3100
     *   E2E_BASE_URL=http://localhost:3100 npx playwright test
     *
     * Do NOT run `npm run build` while `npm run dev` is live — the build overwrites `.next`
     * underneath the dev server, which then serves 500s and every axe audit silently scores the
     * Next error page instead of the app.
     */
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
