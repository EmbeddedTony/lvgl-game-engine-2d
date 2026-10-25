import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSideScrollerDemo } from '../../src/examples/side-scroller';
import { createAdventureDemo } from '../../src/examples/topdown-adventure';
test('packaged 2D examples run actual C, pin both textboxes and export original compressed game content', async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'lge-2d-examples-'));
  for (const [name, project] of [
    ['AmberTrail', createSideScrollerDemo()],
    ['WillowlightAdventure', createAdventureDemo()],
  ] as const) {
    const p = structuredClone(project),
      file = join(root, name + '.lge.json');
    p.code =
      p.code.replace('void game_on_update(', 'static void authored_update(') +
      `
#include <assert.h>
#include <stdio.h>
#include <string.h>
static float elapsed;static unsigned phase;
void game_on_update(lge_engine_t*g,float dt,void*u) {
    authored_update(g,dt,u);elapsed+=dt;
    if(phase==0 && elapsed>.4f) {
        if(g->scene->camera2d) {assert(ui_node_set_position("player",680,144));float x,y;assert(ui_camera_position(&x,&y)&&x==448);}
        phase=1;
    }
    if(phase==1 && elapsed>.6f) {
        assert(lv_obj_get_x(ui_find_object("dialogue_text"))==18);
        assert(lv_obj_get_y(ui_find_object("dialogue_text"))==201);
        assert(strchr(lv_label_get_text(ui_find_object("dialogue_text")),'\\n'));
        puts("EXAMPLE TEXTBOX AND CAMERA PASSED");phase=2;
    }
}
`;
    await writeFile(file, JSON.stringify(p));
    const app = await electron.launch({
      executablePath: resolve(
        'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
      ),
      args: [],
      env: { ...process.env, LGE_PROFILE_DIR: join(root, name + '-profile') },
    });
    try {
      const page = await app.firstWindow(),
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await expect(page.getByRole('button', { name: /^Explore Amber Trail/ })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^Explore Willowlight Adventure/ }),
      ).toBeVisible();
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, file);
      await page.getByRole('button', { name: /^Open a project/ }).click();
      await expect(page.getByTestId('viewport-dialogue_speaker')).toContainText(
        name === 'AmberTrail' ? 'PIP' : 'MIRA',
      );
      await expect(page.getByTestId('viewport-dialogue_text')).toContainText(
        name === 'AmberTrail' ? 'six amber sparks' : 'three stones',
      );
      await page.getByLabel('Play journey', { exact: true }).click();
      await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
      await page.getByLabel('Stop preview', { exact: true }).click();
      await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
      await page.getByRole('button', { name: 'Build & run', exact: true }).click();
      await expect(page.getByTestId('native-output')).toContainText(
        'EXAMPLE TEXTBOX AND CAMERA PASSED',
      );
      await page.screenshot({ path: `evidence/packaged-${name}-native.png` });
      await page.getByRole('button', { name: 'Stop game', exact: true }).click();
      await page.getByLabel('Close dialog', { exact: true }).click();
      const folder = join(root, name + '-firmware');
      await mkdir(folder);
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, folder);
      await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
      await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
      await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
      const generated = await readFile(join(folder, 'ui/generated/game_data.c'), 'utf8');
      expect(generated).toContain('dialogue_text');
      expect(generated).toContain(
        'LGE_MOTION_' + (name === 'AmberTrail' ? 'PLATFORMER' : 'TOPDOWN'),
      );
      if (name === 'AmberTrail') expect(generated).toContain('.world_width=768');
      const report = JSON.parse(await readFile(join(folder, 'ui/compression-report.json'), 'utf8'));
      expect(report.spritePacked).toBeLessThan(report.spriteRaw);
      expect(report.mapPacked).toBeLessThan(report.mapRaw);
      expect(await readFile(join(folder, 'ui/engine/lge_physics.c'), 'utf8')).toBe(
        await readFile('engine/lge_physics.c', 'utf8'),
      );
      expect(errors).toEqual([]);
    } finally {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
  }
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
});
