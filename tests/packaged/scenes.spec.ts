import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('packaged composition edits, saves and exports linked scenes, then runs their actual C and nested buttons', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-scenes-packaged-'));
  const file = join(root, 'Composition.lge.json');
  await writeFile(file, await readFile('examples/SceneComposition.lge.json'));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
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
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    await page.getByTestId('tree-hud/title').click();
    await page.getByLabel('Override text').fill('SCENE TEST');
    await page.getByLabel('Save project', { exact: true }).click();
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(file, 'utf8')).scenes[0].nodes.find((n: any) => n.id === 'hud')
            .overrides.title.text,
      )
      .toBe('SCENE TEST');
    await page.screenshot({ path: 'evidence/packaged-scene-composition.png', fullPage: true });
    const firmware = join(root, 'firmware');
    await mkdir(firmware);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, firmware);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    const data = await readFile(join(firmware, 'ui/generated/game_data.c'), 'utf8');
    expect(data).toContain('.id="hero/player"');
    expect(data).toContain('SCENE TEST');
    await page.getByLabel('Close dialog', { exact: true }).click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await page.getByLabel('Native C code').fill(`#include "ui.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
void game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){
 (void)n;(void)u;
 if(e==LGE_EVENT_START && !strcmp(g->scene->id,UI_SCENE_GROVE)) {
  lge_node_t *body=ui_find_node(UI_NODE_HERO_PLAYER); assert(body);
  assert(!strcmp(ui_node_parent(UI_NODE_HERO_PLAYER),UI_NODE_HERO));
  assert(ui_node_set_local_position(UI_NODE_HERO_PLAYER,0,0)); assert(body->x==144);
  assert(ui_node_set_visible(UI_NODE_HUD,false)); assert(!ui_find_node(UI_NODE_HUD_TITLE)->effective_visible);
  assert(ui_node_set_visible(UI_NODE_HUD,true)); assert(ui_find_node(UI_NODE_HUD_TITLE)->effective_visible);
  puts("COMPOSED C: hierarchy and visibility passed");
 }
 if(e==LGE_EVENT_EXIT) puts("SCENE EXIT");
}
void game_on_update(lge_engine_t*g,float dt,void*u){(void)g;(void)dt;(void)u;}
`);
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByLabel('Native start target').selectOption('entry');
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect
      .poll(() => page.getByTestId('native-game-canvas').getAttribute('data-frames'))
      .not.toBe('0');
    const canvas = page.getByTestId('native-game-canvas'),
      box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: (box.height * 170) / 240 } });
    await expect(page.getByTestId('native-output')).toContainText(
      'COMPOSED C: hierarchy and visibility passed',
    );
    await expect(page.getByTestId('native-output')).toContainText('SCENE EXIT');
    await canvas.focus();
    await page.keyboard.down('w');
    await expect(page.getByTestId('native-runtime-state')).toHaveAttribute('data-score', '1');
    await page.keyboard.up('w');
    await expect
      .poll(() => page.getByTestId('native-runtime-state').getAttribute('data-audio-plays'))
      .not.toBe('0');
    await page.screenshot({ path: 'evidence/packaged-composed-native.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    expect(http).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
