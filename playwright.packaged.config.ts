import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/packaged',
  timeout: 45000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'evidence/packaged-results.json' }]],
  outputDir: 'desktop-test-results/packaged',
});
