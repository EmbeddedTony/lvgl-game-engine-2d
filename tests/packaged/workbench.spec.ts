import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('packaged workbench exposes resizable docks, real Project/Console navigation and Scene/Game controls offline', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'lge-workbench-'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  try {
    const page = await app.firstWindow(),
      http: string[] = [],
      errors: string[] = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) http.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    const separator = page.getByRole('separator', { name: 'Resize hierarchy' }),
      box = (await separator.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 100);
    await page.mouse.up();
    await expect(separator).toHaveAttribute('aria-valuenow', '260');
    await page
      .getByRole('navigation', { name: 'Project folders' })
      .getByRole('button', { name: 'Sprites' })
      .click();
    await page.getByRole('listitem', { name: 'Pine tree.image' }).click();
    await expect(page.getByRole('button', { name: 'Add to scene', exact: true })).toBeVisible();
    await expect(page.getByLabel('Undo', { exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: 'Console', exact: false }).click();
    await expect(page.getByRole('log', { name: 'Editor console' })).toContainText('Project ready');
    await page.getByRole('tab', { name: 'Project', exact: true }).click();
    await page.getByRole('menubar').getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Reset editor layout' }).click();
    await expect(separator).toHaveAttribute('aria-valuenow', '220');
    await page.getByRole('button', { name: 'Game view' }).click();
    await expect(page.getByLabel('Stop preview')).toBeVisible();
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByTestId('tree-player').click();
    await page.screenshot({ path: 'evidence/packaged-workbench.png', fullPage: true });
    expect(http).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
