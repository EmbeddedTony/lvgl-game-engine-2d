import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/native',
  timeout: 45000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'evidence/desktop-results.json' }]],
  use: { trace: 'retain-on-failure' },
  outputDir: 'desktop-test-results',
});
