import { test, expect } from '@playwright/test';
import { createRpgDemo } from '../../src/rpg/demo';
import { pngRgba } from '../../scripts/png';
test('party and status authoring, turn menus, combat result dialogue and session checkpoints', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createRpgDemo(),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Party & battle', exact: true }).click();
  await expect(page.getByLabel('Party actor 1')).toHaveValue('hero');
  await page.getByLabel('Starting gold').fill('30');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Starting gold')).toHaveValue('20');
  await expect(page.getByLabel('Status name 1')).toHaveValue('Poison');
  await expect(
    page.getByRole('button', { name: 'Delete status', exact: true }).first(),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Event scripts', exact: true }).click();
  await page.getByLabel('Action 1 type', { exact: true }).selectOption('end');
  await page.getByRole('button', { name: 'Party & battle', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Disable party system', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Undo', { exact: true }).click();
  await page.screenshot({ path: 'evidence/rpg-party-editor.png' });
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByTestId('viewport-battle_button').click();
  await expect(page.getByTestId('viewport-rpg_title')).toContainText('turn');
  await page.getByTestId('viewport-rpg_option_0').click();
  await expect(page.getByTestId('viewport-rpg_option_0')).toContainText('HP');
  await page.screenshot({ path: 'evidence/rpg-battle-preview.png' });
  for (let i = 0; i < 30; i++) {
    const before = await page.getByTestId('viewport-rpg_title').textContent();
    await page.getByTestId('viewport-rpg_option_0').click();
    await expect(page.getByTestId('viewport-rpg_title')).not.toHaveText(before!);
    if ((await page.getByTestId('viewport-rpg_title').textContent()) === 'Victory') break;
    await expect(page.getByTestId('viewport-rpg_option_0')).toHaveText('Attack');
    await page.getByTestId('viewport-rpg_option_0').click();
    await expect(page.getByTestId('viewport-rpg_option_0')).toContainText('HP');
  }
  await expect(page.getByTestId('viewport-rpg_title')).toHaveText('Victory');
  await page.getByTestId('viewport-rpg_option_0').click();
  await expect(page.getByTestId('viewport-story_text')).toContainText('path is clear');
  // Dialogue confirms reveal first, then closes; wait for the completed page.
  await expect(page.getByTestId('viewport-story_continue')).toContainText('Close');
  await page.getByTestId('stage').focus();
  await page.keyboard.press('e');
  await expect(page.getByTestId('viewport-story_text')).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(page.getByTestId('viewport-rpg_title')).toContainText('gold');
  await page.screenshot({ path: 'evidence/rpg-party-preview.png' });
  await page.keyboard.press('p');
  await expect(page.getByTestId('viewport-rpg_title')).toHaveCount(0);
  await page.locator('.session-monitor>summary').click();
  await page.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
  await page.getByRole('button', { name: 'Restore checkpoint', exact: true }).click();
  expect(errors).toEqual([]);
});
test('batch import detects ACE animation blocks and downsizes before applying atomically', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('tree-terrain').click();
  await page.getByRole('menuitem', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import tileset…', exact: true }).click();
  const pixels = new Uint8Array(512 * 384 * 4);
  for (let y = 0; y < 384; y++)
    for (let x = 0; x < 512; x++)
      pixels.set([x % 256, y % 256, (x + y) % 256, 255], (y * 512 + x) * 4);
  await page.getByTestId('tileset-file').setInputFiles([
    { name: 'Pond A1.png', mimeType: 'image/png', buffer: pngRgba(512, 384, pixels) },
    {
      name: 'Props.png',
      mimeType: 'image/png',
      buffer: pngRgba(32, 32, Array(32 * 32 * 4).fill(255)),
    },
  ]);
  await expect(page.getByLabel('Tileset layout')).toHaveValue('ace-a1');
  await expect(page.getByLabel('Tile size', { exact: true })).toHaveValue('32');
  await page.getByLabel('Output tile size').selectOption('16');
  await page.getByRole('button', { name: 'Add selection & next sheet', exact: true }).click();
  await expect(page.getByLabel('Tileset name')).toHaveValue('Props');
  await page.getByLabel('Tile size', { exact: true }).fill('32');
  await page.getByLabel('Output tile size').selectOption('0');
  await page.getByLabel('After tileset import').selectOption('selected-layer');
  await page.getByRole('button', { name: 'Import 2 tilesets', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').tilesets?.length,
      ),
    )
    .toBe(2);
  const sets = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').tilesets,
  );
  const maps = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!)
      .scenes[0].nodes.filter((n: any) => n.tilemap)
      .map((n: any) => n.tilemap.tileSize),
  );
  expect(maps).toEqual([32, 16, 32]);
  expect(sets[0].tileSize).toBe(16);
  expect(sets[0].terrains).toHaveLength(1);
  expect(sets[0].tiles.some((t: any) => t.animation?.frames.length === 4)).toBe(true);
});

test('atlas selection creates an editable shared tile animation with undo', async ({ page }) => {
  const { createTilesetDemo } = await import('../../src/tileset-demo');
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createTilesetDemo(),
  );
  await page.goto('/');
  await page.getByTestId('tree-terrain').click();
  await page.getByRole('tab', { name: 'Tilemap', exact: true }).click();
  const atlas = page.getByRole('grid', { name: 'Tile atlas' });
  const first = (await atlas.getByRole('gridcell').nth(0).boundingBox())!,
    second = (await atlas.getByRole('gridcell').nth(1).boundingBox())!;
  await page.mouse.move(first.x + 16, first.y + 16);
  await page.mouse.down();
  await page.mouse.move(second.x + 16, second.y + 16);
  await page.mouse.up();
  await page.getByText('Animated tiles', { exact: true }).click();
  await page.getByRole('button', { name: 'Animate selection · 2 frames', exact: true }).click();
  await expect(page.getByLabel('Tile animation frame 2')).toHaveValue('workshop_t2');
  await page.getByLabel('Tile animation FPS').fill('4');
  await expect(page.getByLabel('Tile animation FPS')).toHaveValue('4');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Tile animation FPS')).toHaveValue('6');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).scenes[0].nodes[0]
            .tilemap.animations?.[1]?.frames.length,
      ),
    )
    .toBe(2);
});
