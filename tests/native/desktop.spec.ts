import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let app: ElectronApplication, page: Page, root: string;
async function launch(profile: string) {
  app = await electron.launch({
    args: [resolve('desktop/main.cjs')],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Explore The Little Grove' })).toBeVisible();
  await page.screenshot({ path: 'evidence/desktop-welcome.png', fullPage: true });
}
async function pickSave(file: string | null) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: file === null, filePath: file ?? '' });
  }, file);
}
async function pickFolder(folder: string) {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, folder);
}
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lge-native-'));
  await launch(join(root, 'profile'));
});
test.afterEach(async () => {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app?.close().catch(() => {});
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
});
test('launches offline, edits/saves natively and exports a real ui folder', async () => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  expect(page.url()).toMatch(/^file:/);
  expect(
    await page.evaluate(() => ({
      node: typeof (window as any).require,
      desktop: !!window.engineDesktop,
    })),
  ).toEqual({ node: 'undefined', desktop: true });
  await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('Player');
  await page.screenshot({ path: 'evidence/desktop-editor.png', fullPage: true });
  await page.getByLabel('Object name').fill('Explorer');
  const saved = join(root, 'My game.lge.json');
  await pickSave(saved);
  await page.getByLabel('Save project', { exact: true }).click();
  await expect
    .poll(async () => {
      const json = await readFile(saved, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null; // Atomic publication may still be pending.
        throw error;
      });
      return json
        ? JSON.parse(json).scenes[0].nodes.find((n: any) => n.id === 'player').name
        : null;
    })
    .toBe('Explorer');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByLabel('Native C code').click();
  await page.getByLabel('Native C code').press('ControlOrMeta+End');
  await expect(page.getByLabel('Native C code')).toContainText('game_on_update');
  await page.screenshot({ path: 'evidence/desktop-code.png', fullPage: true });
  await page.getByRole('button', { name: 'ui.h read only' }).click();
  // CodeMirror renders the visible viewport; verify the opened header's visible entry point.
  await expect(page.getByLabel('Public API header')).toContainText('ui_init_with_config');
  await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
  const target = join(root, 'firmware');
  await mkdir(target);
  await pickFolder(target);
  await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
  expect(await readFile(join(target, 'ui/ui.h'), 'utf8')).toContain('ui_init');
  expect(await readFile(join(target, 'ui/user/game_hooks.c'), 'utf8')).toContain('game_on_update');
  expect(await readFile(join(target, 'ui/generated/game_data.c'), 'utf8')).toContain('Explorer');
  await page.screenshot({ path: 'evidence/desktop-export.png', fullPage: true });
  expect(external).toEqual([]);
});
test('new-project workflow supports custom displays and cancelled saves keep edits', async () => {
  await page.getByRole('button', { name: 'Create a project' }).click();
  await page.getByLabel('New project name').fill('Pocket Quest');
  await page.getByLabel('New display width').fill('400');
  await page.getByLabel('New display height').fill('300');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('button', { name: '400 × 300' })).toBeVisible();
  await page.getByRole('button', { name: 'Add object', exact: true }).first().click();
  await page.getByRole('button', { name: 'Text label', exact: true }).click();
  await page.getByLabel('Object text').fill('Hello, handheld!');
  await pickSave(null);
  await page.getByLabel('Save project', { exact: true }).click();
  await expect(page.getByText('Unsaved project', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Object text')).toHaveValue('Hello, handheld!');
});
test('recovers an edited session after restarting without a dev server', async () => {
  await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
  await page.getByLabel('Object name').fill('Recovered explorer');
  const recovery = join(root, 'profile/recovery.json');
  await expect
    .poll(async () => {
      try {
        return JSON.parse(JSON.parse(await readFile(recovery, 'utf8')).text).scenes[0].nodes.find(
          (n: any) => n.id === 'player',
        ).name;
      } catch {
        return '';
      }
    })
    .toBe('Recovered explorer');
  await app.evaluate(({ app }) => app.exit(0));
  app = await electron.launch({
    args: [resolve('desktop/main.cjs')],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  page = await app.firstWindow();
  await page.getByTestId('tree-player').click();
  await expect(page.getByLabel('Object name')).toHaveValue('Recovered explorer');
  expect(page.url()).toMatch(/^file:/);
});

test('native Open validates before changing the save target and Cancel keeps a dirty window open', async () => {
  await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
  const first = join(root, 'first.lge.json');
  await pickSave(first);
  await page.getByLabel('Save project', { exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(first, 'utf8')).version;
      } catch {
        return 0;
      }
    })
    .toBe(1);
  const second = join(root, 'second.lge.json');
  const source = JSON.parse(await readFile(first, 'utf8'));
  source.name = 'Second game';
  await writeFile(second, JSON.stringify(source));
  await pickFolder(second);
  await page.getByLabel('Open project', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Second game/ })).toBeVisible();
  await page.getByTestId('tree-player').click();
  await page.getByLabel('Object name').fill('Keep this edit');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDocumentEdited()),
    )
    .toBe(true);
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect(page.getByLabel('Object name')).toHaveValue('Keep this edit');
  expect(page.isClosed()).toBe(false);
  const invalid = join(root, 'invalid.lge.json');
  await writeFile(invalid, JSON.stringify({ version: 1, name: 'Invalid', scenes: [] }));
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await pickFolder(invalid);
  await page.getByLabel('Open project', { exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invalid .lge.json' })).toBeVisible();
  await page.getByLabel('Save project', { exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(second, 'utf8')).scenes[0].nodes.find(
          (n: any) => n.id === 'player',
        ).name,
    )
    .toBe('Keep this edit');
  expect(JSON.parse(await readFile(invalid, 'utf8')).name).toBe('Invalid');
});
