import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createH7Adventure } from '../../src/examples/h7-adventure';

test('standalone Scene view preserves explicit zoom and pans/frames a large world without editing the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-navigation-'));
  const file = join(root, 'Navigation.lge.json'),
    source = JSON.stringify(createH7Adventure());
  await writeFile(file, source);
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    // The native picker/parse/accept transaction is asynchronous; wait for the new document.
    await expect(
      page.getByRole('button', { name: 'Willowlight - H7 Adventure Saved', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Zoom', { exact: true }).selectOption('2');
    await page.setViewportSize({ width: 1380, height: 950 });
    await page.waitForTimeout(900);
    await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('2');
    const copy = join(root, 'Navigation copy.lge.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, copy);
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Save project as…' }).click();
    await expect
      .poll(() =>
        readFile(copy, 'utf8')
          .then(() => true)
          .catch(() => false),
      )
      .toBe(true);
    await expect(page.getByText('Saved Navigation copy.lge.json', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('2');
    await page.getByTestId('tree-player').click();
    await page.getByLabel('Frame selected', { exact: true }).click();
    const node = page.getByTestId('viewport-player'),
      before = (await node.boundingBox())!,
      viewport = (await page.getByTestId('scene-viewport').boundingBox())!;
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(
      viewport.x + viewport.width / 2 + 64,
      viewport.y + viewport.height / 2 + 32,
      { steps: 8 },
    );
    await page.mouse.up({ button: 'right' });
    const after = (await node.boundingBox())!;
    expect(Math.abs(after.x - before.x - 64)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y - 32)).toBeLessThan(2);
    await page.getByLabel('Frame all', { exact: true }).click();
    const zoom = Number(await page.getByLabel('Zoom', { exact: true }).inputValue());
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.wheel(0, -100);
    await expect
      .poll(async () => Number(await page.getByLabel('Zoom', { exact: true }).inputValue()))
      .toBeGreaterThan(zoom);
    const enlargedZoom = Number(await page.getByLabel('Zoom', { exact: true }).inputValue());
    await page.mouse.wheel(0, 100);
    await expect
      .poll(async () => Number(await page.getByLabel('Zoom', { exact: true }).inputValue()))
      .toBeLessThan(enlargedZoom);
    await expect(page.getByLabel('Undo', { exact: true })).toBeDisabled();
    await page.screenshot({ path: 'evidence/packaged-scene-navigation.png', fullPage: true });
    expect(await readFile(file, 'utf8')).toBe(source);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
