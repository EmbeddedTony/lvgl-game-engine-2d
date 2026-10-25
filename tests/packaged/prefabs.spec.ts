import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeNode, type Project } from '../../src/model';
import { createPrefab, createPrefabPool } from '../../src/editor/prefab-commands';

test('standalone app runs exported prefab pools with reused LVGL widgets, label reset and stale-handle safety', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-prefabs-packaged-'));
  const p: Project = {
    version: 1,
    name: 'Prefab integration',
    width: 320,
    height: 240,
    colorDepth: 16,
    sprites: [],
    audio: [],
    code: '',
    scenes: [
      {
        id: 'level',
        name: 'Level',
        background: '#18212b',
        objective: '',
        completion: '',
        music: '',
        nodes: [
          makeNode('group', { id: 'slime', name: 'Slime', x: 30, y: 60 }),
          makeNode('rect', {
            id: 'body',
            name: 'Body',
            parent: 'slime',
            x: 0,
            y: 0,
            width: 24,
            height: 20,
            radius: 4,
            color: '#55cc88',
          }),
          makeNode('label', {
            id: 'label',
            name: 'Label',
            parent: 'slime',
            x: 0,
            y: -18,
            width: 80,
            text: 'SLIME',
          }),
        ],
      },
    ],
  };
  const source = createPrefab(p, p.scenes[0], 'slime');
  const pool = createPrefabPool(p, p.scenes[0], source, 2);
  p.code = `#include "ui.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static lge_prefab_handle_t first, second;
static lv_obj_t *body_object, *label_object, *parent;
static unsigned count, phase;
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {
 (void)g;(void)n;(void)u;
 if(e!=LGE_EVENT_START) return;
 first=ui_prefab_spawn("${source}",120,100);
 second=ui_prefab_spawn("${source}",220,100);
 assert(first.generation && second.generation);
 assert(!ui_prefab_spawn("${source}",0,0).generation);
 lge_node_t *body=ui_prefab_node(first,"body"), *label=ui_prefab_node(first,"label");
 assert(body && label);
 body_object=ui_find_object(body->definition->id);
 label_object=ui_find_object(label->definition->id);
 assert(body_object && label_object);
 parent=lv_obj_get_parent(body_object);count=lv_obj_get_child_count(parent);
 assert(ui_label_set_text(label->definition->id,"CHANGED"));
 assert(!strcmp(lv_label_get_text(label_object),"CHANGED"));
}
void game_on_update(lge_engine_t *g,float dt,void *u) {
 (void)g;(void)dt;(void)u;
 if(phase==0 && !lv_obj_has_flag(body_object,LV_OBJ_FLAG_HIDDEN)) {
  phase=1;
  assert(ui_prefab_despawn(first));
 }
 if(phase==1 && lv_obj_has_flag(body_object,LV_OBJ_FLAG_HIDDEN)) {
  phase=2;
  assert(!ui_prefab_node(first,"body"));
  for(unsigned i=0;i<200;++i) {
   lge_prefab_handle_t h=ui_prefab_spawn("${source}",120,100);
   assert(h.generation && h.generation!=first.generation);
   lge_node_t *body=ui_prefab_node(h,"body"); assert(body);
   assert(ui_find_object(body->definition->id)==body_object);
   assert(!strcmp(lv_label_get_text(label_object),"SLIME"));
   assert(lv_obj_get_child_count(parent)==count);
   assert(ui_prefab_despawn(h));
  }
  first=ui_prefab_spawn("${source}",120,100);
 }
 if(phase==2 && !lv_obj_has_flag(body_object,LV_OBJ_FLAG_HIDDEN)) {
  phase=3;
  puts("PREFAB_WIDGETS_PASS: 200 reuses, same LVGL objects, restored labels, stale handles rejected");
  fflush(stdout);
 }
}
`;
  const file = join(root, 'Prefabs.lge.json');
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
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    await expect(page.getByTestId('tree-slime/body')).toBeVisible();
    const from = page.getByTestId('tree-slime'),
      to = page.getByTestId(`tree-${pool}`);
    const start = (await from.boundingBox())!;
    await page.mouse.move(start.x + 50, start.y + 10);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 12, { steps: 5 });
    const end = (await to.boundingBox())!;
    await page.mouse.move(end.x + 50, end.y + 10, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByLabel('Node parent')).toHaveValue(pool);
    await page.getByLabel('Undo', { exact: true }).click();
    await expect(page.getByLabel('Node parent')).toHaveValue('');
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('native-output')).toContainText('PREFAB_WIDGETS_PASS');
    await page.screenshot({ path: 'evidence/packaged-prefab-native.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
