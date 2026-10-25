import { test, expect } from '@playwright/test';
import { pngRgba } from '../../scripts/png';
test('layered character import creates one NPC, preserves ordered layers, edits visibility and survives undo/reload', async ({
  page,
}) => {
  const pixels = new Uint8Array(512 * 512 * 4);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 6; col++)
      for (let y = 24; y < 40; y++)
        for (let x = 24; x < 40; x++)
          pixels.set([120, 80, 30, 255], ((row * 64 + y) * 512 + col * 64 + x) * 4);
  const coat = Uint8Array.from(pixels);
  for (let i = 0; i < coat.length; i += 4) if (coat[i + 3]) coat.set([30, 90, 220, 255], i);
  const files = ['char_a_p1_0bas_humn_v01.png', 'char_a_p1_2clo_lnpl_v01.png'].map(
    (name, index) => ({
      name,
      mimeType: 'image/png',
      buffer: pngRgba(512, 512, index ? coat : pixels),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Sprite animation', exact: true }).click();
  await page.getByText('Import layered character', { exact: true }).click();
  await page.getByLabel('Layered character name').fill('Test Ranger');
  await page.getByLabel('Character display scale').selectOption('2');
  await page.getByTestId('character-layer-files').setInputFiles(files);
  await expect(page.getByText(/Front cloak · char_a_p1/)).toBeVisible();
  await page.getByRole('button', { name: 'Create animated NPC', exact: true }).click();
  const snapshot = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}'));
  await expect.poll(async () => (await snapshot()).gameplay?.animations?.length).toBe(8);
  const clip = page
    .locator('.gameplay-state')
    .filter({ has: page.getByRole('textbox', { name: 'Animation clip name' }) })
    .first();
  await clip.getByText('Layers · bottom to top', { exact: true }).click();
  const preview = page.getByAltText('Test Ranger / idle Down composed frame');
  const before = await preview.getAttribute('src');
  await page.getByLabel('Test Ranger / idle Down layer 2 visible', { exact: true }).uncheck();
  await expect(preview).not.toHaveAttribute('src', before!);
  await expect
    .poll(async () => (await snapshot()).gameplay.animations[0].layers[1].visible)
    .toBe(false);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect
    .poll(async () => (await snapshot()).gameplay.animations[0].layers[1].visible)
    .toBe(true);
  expect(
    (await snapshot()).scenes[0].nodes.filter((n: any) => n.name === 'Test Ranger'),
  ).toHaveLength(1);
  const npc = (await snapshot()).scenes[0].nodes.find((n: any) => n.name === 'Test Ranger');
  expect([npc.width, npc.height]).toEqual([64, 96]);
  expect(npc.physics.box).toEqual({ x: 18, y: 60, width: 28, height: 18 });
  await page.reload();
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Sprite animation', exact: true }).click();
  await expect(page.getByLabel('Animation clip name')).toHaveCount(8);
});
