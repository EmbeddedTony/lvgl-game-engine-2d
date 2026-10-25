import { test, expect, type Page } from '@playwright/test';
import { workshopSheet } from '../../src/tileset-demo';
import { pngRgba } from '../../scripts/png';

test('PNG import preserves native 32px detail and resets a queued sheet after explicit reduction', async ({
  page,
}) => {
  const pixels = Array.from({ length: 32 * 32 }, (_, i) => [
    i % 256,
    Math.floor(i / 32) * 7,
    (i * 31) % 256,
    255,
  ]).flat();
  const file = { name: 'Native 32 A5.png', mimeType: 'image/png', buffer: pngRgba(32, 32, pixels) };
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import tileset…', exact: true }).click();
  await page
    .getByTestId('tileset-file')
    .setInputFiles([file, { ...file, name: 'Second 32 A5.png' }]);
  await expect(page.getByLabel('Tileset name', { exact: true })).toHaveValue('Native 32 A5');
  await page.getByLabel('Tile size', { exact: true }).fill('32');
  await expect(page.getByLabel('Output tile size', { exact: true })).toHaveValue('0');
  await page.getByLabel('Output tile size', { exact: true }).selectOption('16');
  await expect(page.getByRole('status').filter({ hasText: 'keeps 25%' })).toBeVisible();
  await page.getByRole('button', { name: 'Add selection & next sheet', exact: true }).click();
  await expect(page.getByLabel('Tileset name', { exact: true })).toHaveValue('Second 32 A5');
  await page.getByLabel('Tile size', { exact: true }).fill('32');
  await expect(page.getByLabel('Output tile size', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: /Import 2 tilesets/ }).click();
  await expect.poll(async () => (await snapshot(page)).tilesets?.length).toBe(2);
  const sets = (await snapshot(page)).tilesets;
  expect(sets[0].tileSize).toBe(16);
  expect(sets[1].tileSize).toBe(32);
  expect(sets[1].tiles[0].pixels).toEqual(pixels);
});

async function importSheet(page: Page, action = 'new-layer') {
  await page.getByRole('menuitem', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import tileset…', exact: true }).click();
  const sheet = workshopSheet();
  await page.getByTestId('tileset-file').setInputFiles({
    name: 'World.png',
    mimeType: 'image/png',
    buffer: pngRgba(sheet.width, sheet.height, sheet.pixels),
  });
  await page.getByText('Margins & spacing', { exact: true }).click();
  for (const label of ['Margin X', 'Margin Y', 'Spacing X', 'Spacing Y'])
    await page.getByLabel(label, { exact: true }).fill('1');
  await expect(page.getByText('6 / 255 unique tiles', { exact: true })).toBeVisible();
  await page.getByLabel('After tileset import').selectOption(action);
}
async function snapshot(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}'),
  );
}
async function geometry(page: Page) {
  const box = (await page.getByTestId('stage').boundingBox())!;
  const scale = await page
    .getByTestId('stage')
    .evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
  return (c: number, r: number) => ({
    x: box.x + (c + 0.5) * 16 * scale,
    y: box.y + (r + 0.5) * 16 * scale,
  });
}
test('import slices a real sheet; stamp, rectangle, fill, picker, erase, shared collision and undo work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await importSheet(page);
  await page.screenshot({ path: 'evidence/tileset-importer.png', fullPage: true });
  await page.getByRole('button', { name: 'Import 6 tiles', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('World layer');
  await expect(page.getByRole('tab', { name: 'Tilemap', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const atlas = page.getByRole('grid', { name: 'Tile atlas' });
  await expect(atlas.getByRole('gridcell')).toHaveCount(8);
  const first = (await atlas.getByRole('gridcell').nth(0).boundingBox())!,
    second = (await atlas.getByRole('gridcell').nth(1).boundingBox())!;
  await page.mouse.move(first.x + 18, first.y + 18);
  await page.mouse.down();
  await page.mouse.move(second.x + 18, second.y + 18);
  await page.mouse.up();
  await expect(page.getByText('2 × 1 stamp · 16px', { exact: true })).toBeVisible();
  let point = await geometry(page),
    a = point(1, 1),
    b = point(8, 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  const map = async () =>
    (await snapshot(page)).scenes?.[0]?.nodes.find((n: any) => n.name === 'World layer')
      ?.tilemap ?? {
      cells: [],
      solidTiles: [],
    };
  await expect.poll(async () => (await map()).cells.slice(21, 29)).toEqual(Array(8).fill(1));
  expect((await map()).cells[29]).toBe(2);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect.poll(async () => (await map()).cells.filter(Boolean).length).toBe(0);
  await atlas.getByRole('gridcell').nth(1).click();
  await page.getByLabel('Rectangle tool', { exact: true }).click();
  point = await geometry(page);
  a = point(2, 2);
  b = point(4, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('tile-paint-ghost')).toContainText('3 × 2');
  expect((await map()).cells.filter(Boolean).length).toBe(0);
  await page.mouse.up();
  await expect.poll(async () => (await map()).cells.filter((v: number) => v === 2).length).toBe(6);
  await page.getByLabel('Pick tile tool', { exact: true }).click();
  point = await geometry(page);
  a = point(3, 2);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByLabel('Brush tool', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  a = point(3, 2);
  await page.mouse.click(a.x, a.y, { button: 'right' });
  expect((await map()).cells[43]).toBe(2);
  await page.keyboard.press('e');
  await page.mouse.click(a.x, a.y);
  await expect.poll(async () => (await map()).cells[43]).toBe(0);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect.poll(async () => (await map()).cells[43]).toBe(2);
  await page.getByLabel('Undo', { exact: true }).click();
  await page.getByLabel('Flood fill tool', { exact: true }).click();
  point = await geometry(page);
  a = point(0, 0);
  await page.mouse.click(a.x, a.y);
  await expect.poll(async () => (await map()).cells.every((v: number) => v === 2)).toBe(true);
  await page.getByLabel('Solid tile selection', { exact: true }).check();
  await expect.poll(async () => (await map()).solidTiles).toContain(2);
  await page.screenshot({ path: 'evidence/tileset-painter.png', fullPage: true });
  const project = await snapshot(page);
  expect(project.sprites).toHaveLength(7);
  expect(project.tilesets[0].tiles).toHaveLength(6);
  await page.reload();
  await expect.poll(async () => (await snapshot(page)).tilesets?.[0]?.tiles[1]?.solid).toBe(true);
  expect(errors).toEqual([]);
});
test('resource browsing is non-destructive and mismatched tile sizes require a matching new layer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('tree-terrain').click();
  await importSheet(page, 'resource');
  await page.getByRole('button', { name: 'Import 6 tiles', exact: true }).click();
  await expect(page.locator('.tilemap-hint')).toContainText(
    '16px tiles need a matching layer. Use New layer.',
  );
  await expect(
    page.getByRole('button', { name: 'Use tileset on this layer', exact: true }),
  ).toBeDisabled();
  // Recovery is debounced; do not read an absent or pre-import document.
  await expect.poll(async () => (await snapshot(page)).tilesets?.length).toBe(1);
  const before = (await snapshot(page)).scenes[0].nodes.length;
  await page.getByRole('button', { name: 'New layer', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('World layer');
  await expect.poll(async () => (await snapshot(page)).scenes[0].nodes.length).toBe(before + 1);
  expect(
    (await snapshot(page)).scenes[0].nodes.find((n: any) => n.name === 'World layer').tilemap
      .tileSize,
  ).toBe(16);
});
