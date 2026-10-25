import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createToolkitDemo } from '../../src/gameplay/toolkit-demo';
test('standalone Toolkit workspace runs update-loop platforms and pooled bullets, then exports canonical RPG/runtime C', async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'lge-toolkit-')),
    p = createToolkitDemo();
  p.code =
    p.code.replace('void game_on_update(', 'static void authored_update(') +
    `
#include <assert.h>
#include <stdio.h>
static unsigned phase;static float elapsed;
void game_on_update(lge_engine_t*g,float dt,void*u){
 authored_update(g,dt,u);elapsed+=dt;
 assert(fabsf(ui_delta_seconds()-dt)<.000001f);
 if(phase==0&&elapsed>.4f){assert(ui_find_node("code_platform")->x>35);const lge_rpg_database_t *db=ui_rpg_database();assert(lge_rpg_item(db,UI_ITEM_POTION)->heal==20);puts("NATIVE TOOLKIT PLATFORM TIME RPG PASSED");assert(ui_request_scene(UI_SCENE_BULLET_LAB));phase=1;}
 else if(phase==1&&strcmp(ui_current_scene(),UI_SCENE_BULLET_LAB)==0&&ui_projectiles_count()>0){assert(ui_projectiles_count()<=32);puts("NATIVE TOOLKIT BULLET POOL PASSED");phase=2;}
}
`;
  p.code = '#include <math.h>\n' + p.code;
  const file = join(root, 'lab.lge.json');
  await writeFile(file, JSON.stringify(p));
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
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('button', { name: /^Open a project/ }).click();
    await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
    await page.getByRole('button', { name: 'Bullet patterns', exact: true }).click();
    await expect(page.getByLabel('Pattern name')).toHaveValue('Gentle spiral');
    await page.screenshot({ path: 'evidence/packaged-toolkit-patterns.png' });
    await page.getByRole('button', { name: 'RPG database', exact: true }).click();
    await expect(page.getByLabel('RPG resource name')).toHaveValue('Amber potion');
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-output')).toContainText(
      'NATIVE TOOLKIT PLATFORM TIME RPG PASSED',
      { timeout: 20000 },
    );
    await expect(page.getByTestId('native-output')).toContainText(
      'NATIVE TOOLKIT BULLET POOL PASSED',
      { timeout: 20000 },
    );
    await page.screenshot({ path: 'evidence/packaged-toolkit-native.png' });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await page.getByLabel('Close dialog', { exact: true }).click();
    const folder = join(root, 'firmware');
    await mkdir(folder);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    expect(await readFile(join(folder, 'ui/engine/lge_gameplay.c'), 'utf8')).toBe(
      await readFile('engine/lge_gameplay.c', 'utf8'),
    );
    expect(await readFile(join(folder, 'ui/generated/game_data.c'), 'utf8')).toContain(
      'const lge_rpg_database_t game_rpg',
    );
    expect(await readFile(join(folder, 'ui/ui.h'), 'utf8')).toContain('ui_platform_move');
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
