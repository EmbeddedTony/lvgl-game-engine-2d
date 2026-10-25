import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('packaged physics playground edits colliders and runs hitbox/audio hooks through bundled LVGL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-packaged-physics-'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Explore Physics Playground' }).click();
    await expect(page.getByLabel('Physics body')).toHaveValue('character');
    await expect(page.getByLabel('Collider width', { exact: true })).toHaveValue('16');
    await page.screenshot({ path: 'evidence/packaged-physics-workbench.png', fullPage: true });
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    const canvas = page.getByTestId('native-game-canvas');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-frames')))
      .toBeGreaterThan(0);
    await page.getByLabel('Native collision shapes', { exact: true }).click();
    await expect(page.getByLabel('Native collision shapes', { exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await canvas.focus();
    await page.keyboard.down('d');
    await expect(page.getByTestId('native-output')).toContainText('AREA ENTER hitbox <- hurtbox');
    await page.keyboard.up('d');
    await expect
      .poll(() => page.getByTestId('native-runtime-state').getAttribute('data-audio-plays'))
      .not.toBe('0');
    await page.screenshot({ path: 'evidence/packaged-physics-native.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});

test('packaged app launches from its bundle, plays, edits C and exports with no server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-packaged-'));
  const executable = resolve(
    'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
  );
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    const http: string[] = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) http.push(r.url());
    });
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(page.url()).toContain('/app.asar/dist/index.html');
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByLabel('Stop preview')).toBeVisible();
    await page.keyboard.down('w');
    await expect
      .poll(
        () =>
          page
            .getByTestId('viewport-player')
            .evaluate((el) => parseFloat((el as HTMLElement).style.top)),
        { intervals: [25] },
      )
      .toBeLessThan(65);
    await page.keyboard.up('w');
    await expect(page.getByTestId('viewport-score')).toContainText('1 / 3');
    await page.getByLabel('Stop preview').click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    const editor = page.getByLabel('Native C code');
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await editor.pressSequentially('// ui_req');
    await expect(
      page
        .getByRole('option')
        .filter({ has: page.locator('.cm-completionLabel', { hasText: /^ui_request_scene$/ }) }),
    ).toBeVisible();
    await editor.press('Escape');
    await page.screenshot({ path: 'evidence/packaged-code.png', fullPage: true });
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.screenshot({ path: 'evidence/packaged-editor.png', fullPage: true });
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    const firmware = join(root, 'firmware');
    await mkdir(firmware);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, firmware);
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    expect(await readFile(join(firmware, 'ui/engine/lge_lvgl.c'), 'utf8')).toBe(
      await readFile('engine/lge_lvgl.c', 'utf8'),
    );
    expect(await readFile(join(firmware, 'ui/ui.h'), 'utf8')).toContain('ui_init_with_config');
    expect(await readFile(join(firmware, 'ui/user/game_hooks.c'), 'utf8')).toContain('// ui_req');
    expect(http).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});

test('packaged Game flow edits, previews and exports a real multi-scene journey', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-flow-app-'));
  const file = join(root, 'SceneJourney.lge.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, await readFile('examples/SceneJourney.lge.json', 'utf8'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      dialog.showMessageBox = async () => {
        throw new Error('An untouched example must not prompt to save before Open.');
      };
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'The Little Grove · Scene Journey', exact: false }),
    ).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find((i) => i.label === 'View');
      view?.submenu?.items.find((i) => i.label === 'Game flow')?.click();
    });
    await expect(page.getByLabel('Game entry', { exact: true })).toHaveValue('sequence:journey');
    await page.getByLabel('Sequence name').fill('Main campaign');
    await page.locator('.flow-workspace').evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: 'evidence/packaged-flow.png', fullPage: true });
    await page.getByRole('button', { name: 'Preview sequence', exact: true }).click();
    await page.getByTestId('viewport-begin_button').click();
    await expect(page.getByTestId('viewport-player')).toBeVisible();
    await page.getByRole('button', { name: 'Next step', exact: false }).click();
    await expect(page.getByTestId('viewport-replay_button')).toBeVisible();
    await page.getByTestId('viewport-replay_button').click();
    await expect(page.getByTestId('viewport-begin_button')).toBeVisible();
    await page.getByLabel('Stop preview').click();
    const folder = join(root, 'firmware');
    await mkdir(folder);
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    expect(await readFile(join(folder, 'ui/engine/lge_flow.c'), 'utf8')).toBe(
      await readFile('engine/lge_flow.c', 'utf8'),
    );
    expect(await readFile(join(folder, 'ui/generated/game_flow.h'), 'utf8')).toContain(
      'GAME_ENTRY_SEQUENCE "journey"',
    );
    expect(await readFile(join(folder, 'ui/generated/game_flow.c'), 'utf8')).toContain(
      'LGE_FLOW_COMPLETE',
    );
    expect(await readFile(join(folder, 'ui/ui_ids.h'), 'utf8')).toContain('UI_STEP_TITLE');
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});

test('packaged native playtest compiles C using its bundled SDK and runs inside the editor offline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-packaged-native-'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow(),
      http: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) http.push(request.url());
    });
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await page
      .getByLabel('Native C code')
      .fill(
        '#include "ui.h"\n#include <stdio.h>\nvoid game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){(void)g;(void)n;(void)u;if(e==LGE_EVENT_START){ui_label_set_text(UI_NODE_TITLE,"REAL C PLAYTEST");puts("PACKAGED C HOOK EXECUTED");}}\nvoid game_on_update(lge_engine_t*g,float d,void*u){(void)g;(void)d;(void)u;}',
      );
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Build & run', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('native-output')).toContainText('PACKAGED C HOOK EXECUTED');
    await expect
      .poll(() => page.getByTestId('native-game-canvas').getAttribute('data-frames'))
      .not.toBe('0');
    await page.getByTestId('native-game-canvas').focus();
    await page.keyboard.down('w');
    await expect(page.getByTestId('native-runtime-state')).toHaveAttribute('data-score', '1');
    await page.keyboard.up('w');
    await page.getByLabel('Pause native game', { exact: true }).click();
    await expect(page.getByLabel('Resume native game', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'evidence/packaged-native-playtest.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'stopped');
    expect(http).toEqual([]);
    const resourcePath = await app.evaluate(() => process.resourcesPath);
    expect(JSON.parse(await readFile(join(resourcePath, 'native-sdk/sdk.json'), 'utf8')).lvgl).toBe(
      '9.4.0',
    );
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
