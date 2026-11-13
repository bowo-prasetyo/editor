import { defineConfig, devices } from '@playwright/test'

// End-to-end tests (e2e/*.spec.js) run against the production build, the
// same files that are deployed, served by `vite preview`. See TESTING.md.
const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'off',
  },
  // Chromium only: Plumb's file features need the File System Access API
  // (see VISION.md, Platforms).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
