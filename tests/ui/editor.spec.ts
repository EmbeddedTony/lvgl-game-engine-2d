import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});
test('scene edits, drag, undo, resolution, autosave and project download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByLabel('Object name')).toHaveValue('Player');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: 'evidence/editor-initial.png', fullPage: true });
  const hero = page.getByTestId('viewport-player'),
    box = (await hero.boundingBox())!,
    scale = await page
      .getByTestId('stage')
      .evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 16 * scale, box.y + box.height / 2 + 8 * scale, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('160');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('144');
  const corner = (await hero.locator('.handle.br').boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    corner.x + corner.width / 2 + 8 * scale,
    corner.y + corner.height / 2 + 8 * scale,
  );
  await page.mouse.up();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('32');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('24');
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByLabel('Display preset').selectOption('480x320');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: '480 × 320' })).toBeVisible();
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByLabel('Display width').fill('400');
  await page.getByLabel('Display height').fill('300');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: '400 × 300' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').width,
      ),
    )
    .toBe(400);
  await page.reload();
  await expect(page.getByRole('button', { name: '400 × 300' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByLabel('Save project', { exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.lge\.json$/);
  expect(errors).toEqual([]);
});
test('tile painting is one undoable stroke and solid types persist', async ({ page }) => {
  await page.getByTestId('tree-terrain').click();
  await page.getByLabel('Paint tiles', { exact: true }).click();
  await page.getByLabel('Tile brush').selectOption('3');
  const stage = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.move(stage.x + 12, stage.y + 16 * 2 + 12);
  await page.mouse.down();
  await page.mouse.move(stage.x + 90, stage.y + 16 * 2 + 12, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').scenes?.[0]
            ?.nodes?.[0]?.tilemap?.cells[0],
      ),
    )
    .toBe(3);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').scenes?.[0]
            ?.nodes?.[0]?.tilemap?.cells[0],
      ),
    )
    .toBe(1);
});
test('play moves, collects, pauses, resumes and stop restores authored positions', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
  const hero = page.getByTestId('viewport-player');
  const y = await hero.evaluate((el) => parseFloat((el as HTMLElement).style.top));
  await page.keyboard.down('w');
  await expect
    .poll(() => hero.evaluate((el) => parseFloat((el as HTMLElement).style.top)))
    .toBeLessThan(65);
  await page.keyboard.up('w');
  await expect(page.getByTestId('viewport-score')).toContainText('1 / 3');
  await page.getByLabel('Pause', { exact: true }).click();
  const pausedY = await hero.evaluate((el) => (el as HTMLElement).style.top);
  await page.keyboard.down('w');
  await page.waitForTimeout(120);
  await page.keyboard.up('w');
  expect(await hero.evaluate((el) => (el as HTMLElement).style.top)).toBe(pausedY);
  await page.getByRole('button', { name: 'Resume', exact: true }).first().click();
  await page.getByLabel('Stop preview', { exact: true }).click();
  expect(await hero.evaluate((el) => parseFloat((el as HTMLElement).style.top))).toBe(y);
  await expect(page.getByTestId('viewport-score')).toContainText('0 / 3');
});
test('code and audio persist; export contains real C runtime and compressed assets', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page
    .getByLabel('Native C code')
    .fill(
      '#include "game.h"\nvoid game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){(void)g;(void)e;(void)n;(void)u;}\nvoid game_on_update(lge_engine_t*g,float dt,void*u){(void)g;(void)dt;(void)u;}',
    );
  await page.getByRole('button', { name: 'Audio', exact: true }).click();
  await page.getByLabel('Cue bus', { exact: true }).selectOption('ui');
  await page.getByLabel('Cue gain', { exact: true }).fill('0.4');
  await page.screenshot({ path: 'evidence/audio-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download LVGL package' }).click();
  const download = await pending;
  const path = await download.path();
  const zip = await JSZip.loadAsync(await readFile(path!));
  expect(zip.file('ui/engine/lge.c')).not.toBeNull();
  expect(zip.file('ui/assets/audio/cue_pickup.wav')).not.toBeNull();
  expect(await zip.file('ui/user/game_hooks.c')!.async('string')).toContain('game_on_update');
  const report = JSON.parse(await zip.file('ui/compression-report.json')!.async('string'));
  expect(report.spritePacked).toBeLessThan(report.spriteRaw);
  expect(report.mapPacked).toBeLessThan(report.mapRaw);
  const project = JSON.parse(await zip.file('project.lge.json')!.async('string'));
  expect(project.audio[0].bus).toBe('ui');
  expect(project.audio[0].gain).toBe(0.4);
});

test('the starter can be completed and narrow layouts expose the full canvas', async ({ page }) => {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
  const hero = page.getByTestId('viewport-player');
  const move = async (key: string, axis: 'left' | 'top', target: number, less: boolean) => {
    await page.keyboard.down(key);
    try {
      await expect
        .poll(
          () => hero.evaluate((el, axis) => parseFloat((el as HTMLElement).style[axis]), axis),
          { intervals: [20], timeout: 6000 },
        )
        [less ? 'toBeLessThan' : 'toBeGreaterThan'](target);
    } finally {
      await page.keyboard.up(key);
    }
  };
  await move('w', 'top', 63, true);
  await expect(page.getByTestId('viewport-score')).toContainText('1 / 3');
  await move('s', 'top', 124, false);
  await move('a', 'left', 80, true);
  await expect(page.getByTestId('viewport-score')).toContainText('2 / 3');
  await move('d', 'left', 218, false);
  await expect(page.getByTestId('viewport-score')).toContainText('3 / 3');
  await expect(page.getByTestId('viewport-objective')).toContainText('All crystals found');
  await page.getByLabel('Stop preview', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.getByLabel('Toggle inspector', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const s = (await page.getByTestId('stage').boundingBox())!;
      return s.x >= 0 && s.x + s.width <= 390;
    })
    .toBe(true);
  await page.getByLabel('Toggle inspector', { exact: true }).click();
  await expect(page.getByLabel('Object name')).toBeVisible();
  await page.screenshot({ path: 'evidence/compact-editor.png', fullPage: true });
});
