import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5192',
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 5192',
    url: 'http://127.0.0.1:5192',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['json', { outputFile: 'evidence/ui-results.json' }]],
});
