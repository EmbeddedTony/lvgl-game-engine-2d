import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createH7Adventure } from '../../src/examples/h7-adventure';
test('desktop board panel compiles the real M7 firmware, exposes diagnostics and refuses flash without a selected probe', async () => {
  test.setTimeout(300000);
  const root = await mkdtemp(join(tmpdir(), 'lge-board-app-')),
    file = join(root, 'village.lge.json');
  await writeFile(file, JSON.stringify(createH7Adventure()));
  const app = await electron.launch({
    executablePath: resolve(
      process.env.LGE_MONITOR_APP ?? 'release/mac-arm64/LVGL Game Engine 2D.app',
      'Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: {
      ...process.env,
      LGE_PROFILE_DIR: join(root, 'profile'),
      LGE_BOARD_SDK_CACHE: resolve('.cache'),
    },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('button', { name: /^Open a project/ }).click();
    await page.getByRole('button', { name: 'Build & flash', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'STM32H7S78-DK', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flash & run', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Board terrain cache budget')).toHaveValue('0');
    await expect(page.getByLabel('Install board bootloader', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Stream inputs over ST-LINK serial')).not.toBeChecked();
    await page.getByLabel('Stream inputs over ST-LINK serial').check();
    await expect(
      page.getByText('The installed bootloader is preserved.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Build firmware', exact: true }).click();
    await expect(page.getByTestId('board-panel')).toHaveAttribute('data-phase', 'ready', {
      timeout: 240000,
    });
    await expect(page.getByText(/Boot 20\.9 KiB/)).toBeVisible();
    await expect(page.getByText(/Persistent checkpoints ready/)).toBeVisible();
    await page.getByLabel('ST-LINK probe').selectOption('');
    await expect(page.getByRole('button', { name: 'Flash & run', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'evidence/packaged-board-build.png' });
    await page.getByLabel('Board terrain cache budget').selectOption('2048');
    await expect(page.getByText(/Project or build options changed/)).toBeVisible();
    await page.getByLabel('Board terrain cache budget').selectOption('0');
    await page.getByLabel('Board renderer').selectOption('software');
    await expect(page.getByText(/Project or build options changed/)).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
