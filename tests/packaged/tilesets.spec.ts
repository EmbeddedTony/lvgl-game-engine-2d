import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { workshopSheet } from '../../src/tileset-demo';
import { pngRgba } from '../../scripts/png';

test('packaged importer paints actual pixels, exports only used tile images and runs tile queries in bundled LVGL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-tileset-'));
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
    await page.getByRole('menuitem', { name: 'Project', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Import tileset…', exact: true }).click();
    const sheet = workshopSheet();
    await page.getByTestId('tileset-file').setInputFiles({
      name: 'World.png',
      mimeType: 'image/png',
      buffer: pngRgba(sheet.width, sheet.height, sheet.pixels),
    });
    await page.getByText('Margins & spacing', { exact: true }).click();
    for (const field of ['Margin X', 'Margin Y', 'Spacing X', 'Spacing Y'])
      await page.getByLabel(field, { exact: true }).fill('1');
    await expect(page.getByText('6 / 255 unique tiles', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import 6 tiles', exact: true }).click();
    await expect(page.getByLabel('Object name')).toHaveValue('World layer');
    const mapId = (await page.locator('.stable-id').textContent())!;
    await page.getByRole('grid', { name: 'Tile atlas' }).getByRole('gridcell').nth(0).click();
    const box = (await page.getByTestId('stage').boundingBox())!,
      scale = await page
        .getByTestId('stage')
        .evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
    await page.mouse.click(box.x + 8 * scale, box.y + 88 * scale);
    await page.getByLabel('Solid tile selection', { exact: true }).check();
    await page.screenshot({ path: 'evidence/packaged-tileset-painter.png', fullPage: true });
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await page.getByLabel('Native C code').fill(`#include "ui.h"
#include <assert.h>
#include <stdio.h>
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {
 (void)g;(void)n;(void)u;
 if(e==LGE_EVENT_START) {
  assert(ui_find_node("${mapId}")->definition->tilemap->tile_count==6);
  assert(ui_tile_at("${mapId}",0,5)==1 && ui_tile_is_solid("${mapId}",0,5));
  assert(ui_tile_at("${mapId}",-1,0)==0 && !ui_tile_is_solid("missing",0,0));
  puts("IMPORTED TILESET READY");
 }
}
void game_on_update(lge_engine_t *g,float dt,void *u) {(void)g;(void)dt;(void)u;}
`);
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('native-output')).toContainText('IMPORTED TILESET READY');
    await expect
      .poll(() =>
        page.getByTestId('native-game-canvas').evaluate((el) => {
          const pixel = (el as HTMLCanvasElement).getContext('2d')!.getImageData(5, 81, 1, 1).data;
          return (
            Math.abs(pixel[0] - 116) < 5 &&
            Math.abs(pixel[1] - 166) < 5 &&
            Math.abs(pixel[2] - 91) < 5 &&
            pixel[3] === 255
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: 'evidence/packaged-tileset-native.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await page.getByLabel('Close dialog', { exact: true }).click();
    const folder = join(root, 'firmware');
    await mkdir(folder);
    await app.evaluate(({ dialog }, destination) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    const data = await readFile(join(folder, 'ui/generated/game_data.c'), 'utf8');
    const bank = data.match(/_tiles\[6\][^\n]*/)?.[0] ?? '';
    expect((bank.match(/NULL/g) ?? []).length).toBe(5);
    expect(data).toContain('.tile_count=6');
    expect(data).toContain('.solid_bits=');
    expect(await readFile(join(folder, 'ui/ui.h'), 'utf8')).toContain('ui_tile_is_solid');
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
