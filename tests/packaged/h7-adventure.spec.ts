import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createH7Adventure } from '../../src/examples/h7-adventure';
test('standalone H7 demo runs touchscreen scrolling and melee in native LVGL and exports the M7 board adapter', async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'lge-h7-')),
    p = createH7Adventure();
  p.code =
    p.code.replace('void game_on_update(', 'static void authored_update(') +
    `
#include <assert.h>
#include <stdio.h>
static unsigned phase;
void game_on_update(lge_engine_t*g,float dt,void*u){
 authored_update(g,dt,u);lge_node_t*n=ui_find_node("player");assert(n&&g->melee);
 float x,y;assert(ui_camera_position(&x,&y));assert(x>1000&&y>600);
 if(!phase){puts("H7 NATIVE CAMERA READY");phase=1;}
 if(phase==1&&n->x>1490){puts("H7 NATIVE SCROLL PASSED");phase=2;}
 if(phase==2&&ui_melee_active("player")){puts("H7 NATIVE SWORD PASSED");phase=3;}
}
`;
  const file = join(root, 'h7.lge.json');
  await writeFile(file, JSON.stringify(p));
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
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('button', { name: /^Open a project/ }).click();
    await page.getByLabel('Project settings', { exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('checkbox', { name: /^Touchscreen controls/ }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    const output = page.getByTestId('native-output');
    await expect(output).toContainText('H7 NATIVE CAMERA READY', { timeout: 20000 });
    const canvas = page.getByTestId('native-game-canvas');
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(
      bounds.x + (bounds.width * 140) / 800,
      bounds.y + (bounds.height * 398) / 480,
    );
    await page.mouse.down();
    await expect(output).toContainText('H7 NATIVE SCROLL PASSED');
    await page.mouse.up();
    await page.mouse.move(
      bounds.x + (bounds.width * 736) / 800,
      bounds.y + (bounds.height * 438) / 480,
    );
    await page.mouse.down();
    await page.mouse.up();
    await expect(output).toContainText('H7 NATIVE SWORD PASSED');
    await page.screenshot({ path: 'evidence/packaged-h7-native.png' });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await page.getByLabel('Close dialog', { exact: true }).click();
    const folder = join(root, 'export');
    await mkdir(folder);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    expect(await readFile(join(folder, 'ui/engine/lge_melee.c'), 'utf8')).toBe(
      await readFile('engine/lge_melee.c', 'utf8'),
    );
    expect(await readFile(join(folder, 'ui/lv_conf_acceleration.h'), 'utf8')).toContain(
      'LV_USE_NEMA_LIB LV_NEMA_LIB_M7',
    );
    expect(await readFile(join(folder, 'ui/ports/stm32h7s78_dk.c'), 'utf8')).toContain(
      'lge_h7s78_start',
    );
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
