import { defineConfig, devices } from '@playwright/test';

// Set WAHALA_CHROMIUM to use a preinstalled Chromium instead of `npx playwright install`.
const executablePath = process.env.WAHALA_CHROMIUM || undefined;
const PORT = 4173;

// GitHub's runners render WebGL in software on two slow vCPUs: a single frame (and so every screenshot)
// can take tens of seconds there, so CI gets far longer budgets than the container.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  timeout: CI ? 300_000 : 90_000,
  // Software WebGL (SwiftShader) plus the audio bank's warm-up share one CPU, so UI state can lag the sim by seconds.
  expect: { timeout: CI ? 45_000 : 15_000 },
  workers: CI ? 1 : undefined,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/wahala-game/`,
    launchOptions: {
      executablePath,
      args: [
        // The container's preinstalled Chromium needs one process; on CI runners it kills new contexts.
        ...(executablePath ? ['--single-process'] : []),
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/wahala-game/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
