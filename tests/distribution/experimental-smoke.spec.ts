import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

test('experimental packaged editor runs Play and exports C while reporting unavailable native playtest', async () => {
  const release = JSON.parse(await readFile('.cache/release-app.json', 'utf8'));
  const label = { win32: 'Windows', linux: 'Linux' }[release.platform as 'win32' | 'linux'];
  expect(label).toBeTruthy();
  const root = await mkdtemp(join(tmpdir(), 'lge-experimental-'));
  const app = await electron.launch({
    executablePath: resolve(release.executable),
    args: ['--no-sandbox'],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('experimental-platform')).toHaveText(`${label} · Experimental`);
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await expect(page.getByLabel('Object name')).toHaveValue('Player');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
    const hero = page.getByTestId('viewport-player');
    const y = await hero.evaluate((el) => parseFloat((el as HTMLElement).style.top));
    await page.keyboard.down('w');
    await expect
      .poll(() => hero.evaluate((el) => parseFloat((el as HTMLElement).style.top)))
      .toBeLessThan(y);
    await page.keyboard.up('w');
    await page.getByLabel('Stop preview', { exact: true }).click();
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Build & run', exact: true })).toBeDisabled();
    await expect(page.locator('.native-unavailable')).toContainText('experimental');
    const caps = await page.evaluate(() => window.engineDesktop!.nativeCapabilities());
    expect(caps.available).toBe(false);
    const runner = join(release.appRoot, 'resources', 'app.asar', 'desktop', 'cli-runner.cjs');
    const output = join(root, 'export');
    const result = await execute(
      release.executable,
      [
        runner,
        'export',
        '--project-path',
        resolve('examples/TheLittleGrove.lge.json'),
        '--output',
        output,
      ],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          LGE_PROFILE_DIR: join(root, 'cli-profile'),
        },
        maxBuffer: 8 * 1024 * 1024,
        timeout: 30000,
      },
    );
    const reply = JSON.parse(result.stdout);
    expect(reply.ok).toBe(true);
    const ui = reply.data.path;
    expect(await readFile(join(ui, 'ui.h'), 'utf8')).toContain('bool ui_init(void)');
    expect(await readFile(join(ui, 'LICENSE.md'), 'utf8')).toContain('noncommercial');
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
});
