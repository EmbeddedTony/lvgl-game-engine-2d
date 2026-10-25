import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('packaged target advice persists native saves and exports a non-blocking sourced report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-target-guidance-'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!
        .items.find((i) => i.label === 'View')!
        .submenu!.items.find((i) => i.label === 'Target guidance…')!
        .click();
    });
    const panel = page.getByTestId('target-guidance');
    await expect(panel).toBeVisible();
    await page.getByLabel('Target family', { exact: true }).selectOption('stm32f0');
    await expect(panel.locator('[data-guidance="ram"]')).toBeVisible();
    // Exercise the real preload/IPC boundary without opening an external browser.
    await app.evaluate(({ shell }) => {
      (globalThis as any).openedReference = '';
      shell.openExternal = async (url) => {
        (globalThis as any).openedReference = url;
      };
    });
    await page.getByRole('link', { name: 'Vendor reference', exact: true }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).openedReference))
      .toContain('st.com/');
    const rejection = await page.evaluate(async () => {
      try {
        await window.engineDesktop!.openReference('file:///tmp/disallowed');
        return false;
      } catch {
        return true;
      }
    });
    expect(rejection).toBe(true);
    await page.getByLabel('SD / eMMC capacity (MiB)', { exact: true }).fill('2048');
    await page.getByLabel('Audio storage budget', { exact: true }).selectOption('sd');
    await expect(panel.locator('[data-guidance="ram"]')).toBeVisible();
    await page.screenshot({ path: 'evidence/packaged-target-guidance.png', fullPage: true });
    await page.getByLabel('Close dialog', { exact: true }).click();
    const file = join(root, 'Guided.lge.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page.getByLabel('Save project', { exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(file, 'utf8')).target?.family;
        } catch {
          return null;
        }
      })
      .toBe('stm32f0');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.target.sdMiB).toBe(2048);
    expect(saved.target.audioStorage).toBe('sd');
    const folder = join(root, 'firmware');
    await mkdir(folder);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export ui folder', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    const report = JSON.parse(await readFile(join(folder, 'ui/target-guidance.json'), 'utf8'));
    expect(report.family.id).toBe('stm32f0');
    expect(report.family.source).toContain('st.com/');
    expect(report.config.sdMiB).toBe(2048);
    expect(report.alerts.some((a: any) => a.id === 'ram')).toBe(true);
    expect(report.exactExportPayload.spritePacked).toBeGreaterThan(0);
    expect(await readFile(join(folder, 'ui/README.md'), 'utf8')).toContain(
      'Target planning snapshot',
    );
    expect(await readFile(join(folder, 'ui/CMakeLists.txt'), 'utf8')).not.toContain(
      'target-guidance',
    );
    await page.getByLabel('Close dialog', { exact: true }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    await page.getByRole('button', { name: 'Target guidance', exact: true }).click();
    await expect(page.getByLabel('Target family', { exact: true })).toHaveValue('stm32f0');
    await expect(page.getByLabel('SD / eMMC capacity (MiB)', { exact: true })).toHaveValue('2048');
    await page.getByLabel('Target family', { exact: true }).selectOption('embedded-linux');
    await expect(panel.locator('[data-guidance]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
