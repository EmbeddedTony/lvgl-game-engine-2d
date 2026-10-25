import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createGameplayDemo } from '../../src/gameplay/demo';
test('packaged Gameplay workspace, fast-tap native conversations and canonical LVGL state/scene export', async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'lge-gameplay-')),
    p = createGameplayDemo();
  p.code =
    p.code.replace('void game_on_update(', 'static void authored_update(') +
    `
#include <assert.h>
#include <stdio.h>
#include <string.h>
static unsigned phase;static float elapsed;
void game_on_update(lge_engine_t*g,float dt,void*u){
 authored_update(g,dt,u);elapsed+=dt;
 if(phase==0&&elapsed>.2f){assert(ui_script_start("chest","other_chest/body"));phase=1;}
 else if(phase==1&&ui_dialogue()){int32_t n;assert(ui_state_get("amber_key",&n)&&n==1);assert(ui_state_get("second_chest_opened",&n)&&n==1);assert(ui_dialogue_revealing());puts("NATIVE REMAPPED CHEST OPEN");phase=2;}
 else if(phase==2&&ui_dialogue()&&!ui_dialogue_revealing()){assert(ui_dialogue_visible_bytes()==strlen(ui_dialogue_text()));puts("NATIVE TEXT REVEALED");phase=3;}
 else if(phase==3&&!ui_dialogue()){puts("NATIVE QUICK INTERACT PASSED");phase=4;}
}
`;
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
    await expect(page.getByRole('heading', { name: 'Gameplay', exact: true })).toBeVisible();
    await expect(page.getByLabel('Dialogue text speed').first()).toHaveValue('30');
    await page.getByLabel('Dialogue text speed').first().fill('15');
    await page.screenshot({ path: 'evidence/packaged-gameplay-editor.png' });
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-output')).toContainText('NATIVE REMAPPED CHEST OPEN');
    await page.getByTestId('native-game-canvas').focus();
    await page.keyboard.press('e');
    await expect(page.getByTestId('native-output')).toContainText('NATIVE TEXT REVEALED');
    await expect(page.getByTestId('native-output')).not.toContainText(
      'NATIVE QUICK INTERACT PASSED',
    );
    await page.keyboard.press('e'); // Reveal first, then advance the quick-tap conversation.
    await expect(page.getByTestId('native-output')).toContainText('NATIVE QUICK INTERACT PASSED');
    await page.screenshot({ path: 'evidence/packaged-gameplay-native.png' });
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
    expect(await readFile(join(folder, 'ui/engine/lge_story.c'), 'utf8')).toBe(
      await readFile('engine/lge_story.c', 'utf8'),
    );
    expect(await readFile(join(folder, 'ui/generated/game_data.c'), 'utf8')).toContain(
      '.state_bindings=bindings_',
    );
    expect(await readFile(join(folder, 'ui/generated/game_data.c'), 'utf8')).toContain(
      '.text_speed=15',
    );
    expect(await readFile(join(folder, 'ui/ui.h'), 'utf8')).toContain('ui_node_state_get');
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
