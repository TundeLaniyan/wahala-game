import { defineConfig, devices } from '@playwright/test';

// Set WAHALA_CHROMIUM to use a preinstalled Chromium instead of `npx playwright install`.
const executablePath = process.env.WAHALA_CHROMIUM || undefined;
// WAHALA_E2E_PORT: run against a private preview server (several checkouts on one machine)
const PORT = Number(process.env.WAHALA_E2E_PORT) || 4173;

// GitHub's runners render WebGL in software: a single frame (and so every screenshot) can take tens of
// seconds there, so CI gets far longer budgets than the container.
const CI = !!process.env.CI;
// CI runs the suite as parallel shards (.github/workflows/ci.yml, docs/CI.md): each shard serves the dist/
// built once by the build job (WAHALA_E2E_PREBUILT=1) and writes a blob report that the report job merges.
const PREBUILT = !!process.env.WAHALA_E2E_PREBUILT;

export default defineConfig({
  testDir: 'e2e',
  timeout: CI ? 300_000 : 90_000,
  // Software WebGL (SwiftShader) plus the audio bank's warm-up share one CPU, so UI state can lag the sim by seconds.
  expect: { timeout: CI ? 45_000 : 15_000 },
  // one software-rendered Chromium per CPU-starved runner; WAHALA_E2E_WORKERS raises it per shard
  workers: CI ? Number(process.env.WAHALA_E2E_WORKERS) || 1 : undefined,
  retries: 1,
  reporter: CI ? [['blob'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/wahala-game/`,
    // diagnostics for the merged report: a failure screenshot, and a DOM/network trace of every retry
    // (no screencast: each frame costs seconds on software WebGL)
    screenshot: 'only-on-failure',
    trace: { mode: 'on-first-retry', screenshots: false, snapshots: true, sources: true },
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
    command: `${PREBUILT ? '' : 'npm run build && '}npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/wahala-game/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
