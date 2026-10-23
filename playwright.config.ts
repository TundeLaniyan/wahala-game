import { defineConfig, devices } from '@playwright/test';

// Set WAHALA_CHROMIUM to use a preinstalled Chromium instead of `npx playwright install`.
const executablePath = process.env.WAHALA_CHROMIUM || undefined;
// WAHALA_E2E_PORT: run against a private preview server (several checkouts on one machine)
const PORT = Number(process.env.WAHALA_E2E_PORT) || 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // Software WebGL (SwiftShader) plus the audio bank's warm-up share one CPU, so UI state can lag the sim by seconds.
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/wahala-game/`,
    launchOptions: {
      executablePath,
      args: [
        // The container's preinstalled Chromium needs one process; on CI runners it kills new contexts.
        // WAHALA_MULTIPROCESS=1 opts out where the single-process launch itself crashes (busy shared container)
        ...(executablePath && !process.env.WAHALA_MULTIPROCESS ? ['--single-process'] : []),
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
