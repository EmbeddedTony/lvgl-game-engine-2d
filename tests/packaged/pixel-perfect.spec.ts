import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pixelColors, pixelProject } from '../helpers/pixel-project';
import { makeNode } from '../../src/model';

test('packaged pixel mode runs exact exported pixels, preserves subpixel state and maps scaled pointer input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-pixel-perfect-'));
  const p = pixelProject(),
    file = join(root, 'Pixels.lge.json');
  p.scenes[0].nodes.push(
    makeNode('button', {
      id: 'tap',
      name: 'Tap',
      x: 96.5,
      y: 64.5,
      width: 32,
      height: 16,
      text: '',
    }),
  );
  p.code = `#include "ui.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {
 (void)g;(void)u;
 if(e==LGE_EVENT_START) {
  assert(GAME_PIXEL_PERFECT==1);
  lge_node_t *art=ui_find_node("art"); assert(art && art->x==15.5f);
  const lv_image_dsc_t *image=art->definition->image;
  assert(image->header.w==16 && image->header.h==16);
  puts("PIXEL PERFECT C READY");
 }
 if(e==LGE_EVENT_CLICK && !strcmp(n->definition->id,"tap")) puts("PIXEL POINTER MAPPED");
}
void game_on_update(lge_engine_t *g,float dt,void *u) {(void)g;(void)dt;(void)u;}
`;
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
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByLabel('Open project', { exact: true }).click();
    await expect(page.getByLabel('Pixel perfect', { exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByLabel('Native zoom', { exact: true }).selectOption('3');
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('native-output')).toContainText('PIXEL PERFECT C READY');
    const canvas = page.getByTestId('native-game-canvas');
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const b = el.getBoundingClientRect(),
            d = devicePixelRatio;
          return [b.x * d, b.y * d, (b.width * d) / 320, (b.height * d) / 240].every(
            (v) => Math.abs(v - Math.round(v)) < 1 / 32,
          );
        }),
      )
      .toBe(true);
    await expect(canvas).toHaveAttribute('data-physical-scale', '3');
    await expect
      .poll(() =>
        canvas.evaluate((el, colors) => {
          const ctx = (el as HTMLCanvasElement).getContext('2d')!;
          const art = ctx.getImageData(16, 16, 16, 16).data;
          for (let y = 0; y < 16; y++)
            for (let x = 0; x < 16; x++) {
              const expected = colors[(Math.floor(x / 2) % 2) + (Math.floor(y / 2) % 2) * 2];
              if (expected.some((v, c) => art[(y * 16 + x) * 4 + c] !== v)) return false;
            }
          const map = ctx.getImageData(49, 33, 16, 8).data;
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 16; x++)
              if (colors[(x % 2) + (y % 2) * 2].some((v, c) => map[(y * 16 + x) * 4 + c] !== v))
                return false;
          return true;
        }, pixelColors),
      )
      .toBe(true);
    const scale = await canvas.evaluate((el) => el.getBoundingClientRect().width / 320);
    await canvas.click({ position: { x: 100 * scale, y: 70 * scale } });
    await expect(page.getByTestId('native-output')).toContainText('PIXEL POINTER MAPPED');
    await page.screenshot({ path: 'evidence/packaged-pixel-perfect.png', fullPage: true });
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
    expect(await readFile(join(folder, 'ui/generated/game_data.h'), 'utf8')).toContain(
      '#define GAME_PIXEL_PERFECT 1',
    );
    expect(await readFile(join(folder, 'ui/README.md'), 'utf8')).toContain(
      'Sprite sizes are baked with nearest sampling',
    );
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
