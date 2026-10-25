import { test, expect, type Page } from '@playwright/test';
import { makeNode, type Project } from '../../src/model';
const project: Project = {
  version: 1,
  name: 'Navigation lab',
  width: 320,
  height: 240,
  colorDepth: 16,
  pixelPerfect: true,
  sprites: [],
  audio: [],
  code: '',
  scenes: [
    {
      id: 'world',
      name: 'World',
      background: '#203035',
      objective: '',
      completion: '',
      music: '',
      camera2d: { worldWidth: 2048, worldHeight: 1024, follow: 'hero', axis: 'both' },
      nodes: [
        makeNode('rect', { id: 'ground', x: 0, y: 0, width: 2048, height: 1024, color: '#346c44' }),
        makeNode('rect', {
          id: 'hero',
          name: 'Hero',
          x: 1400,
          y: 700,
          width: 16,
          height: 16,
          color: '#edb84f',
        }),
        makeNode('rect', { id: 'far', x: 1800, y: 850, width: 32, height: 48, color: '#487bdd' }),
        makeNode('rect', {
          id: 'negative',
          x: -80,
          y: -60,
          width: 32,
          height: 32,
          color: '#dd4848',
        }),
      ],
    },
  ],
};
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!));
async function pan(page: Page, button: 'right' | 'middle' | 'left', dx: number, dy: number) {
  const b = (await page.getByTestId('scene-viewport').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down({ button });
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up({ button });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    project,
  );
  await page.goto('/');
});
test('manual zoom survives resize, layout and authoring updates; Scene view restores after Play', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByLabel('Zoom', { exact: true }).selectOption('2');
  await page.setViewportSize({ width: 1390, height: 960 });
  await page.getByRole('separator', { name: 'Resize inspector' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.getByTestId('tree-hero').click();
  await page.getByLabel('Object name', { exact: true }).fill('Renamed hero');
  await page.waitForTimeout(900);
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Stop preview', { exact: true }).click();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('2');
  expect(errors).toEqual([]);
});
test('RMB, MMB and Space drag pan the view rather than objects, with no Undo or project changes', async ({
  page,
}) => {
  const before = await saved(page);
  await page.getByTestId('tree-hero').click();
  await page.getByLabel('Frame selected', { exact: true }).click();
  const initial = (await page.getByTestId('viewport-hero').boundingBox())!;
  await pan(page, 'right', 60, 40);
  const after = (await page.getByTestId('viewport-hero').boundingBox())!;
  expect(after.x - initial.x).toBeCloseTo(60, 0);
  expect(after.y - initial.y).toBeCloseTo(40, 0);
  await expect(page.getByLabel('Object name', { exact: true })).toHaveValue('Hero');
  await pan(page, 'middle', -30, -20);
  const b = (await page.getByTestId('scene-viewport').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.down('Space');
  await pan(page, 'left', 20, 10);
  await page.keyboard.up('Space');
  await page.waitForTimeout(750);
  expect(await saved(page)).toEqual(before);
  await expect(page.getByLabel('Undo', { exact: true })).toBeDisabled();
});
test('wheel zooms both ways at the pointer; framing exposes all distant and negative assets with bounded raster memory', async ({
  page,
}) => {
  await page.getByLabel('Frame all', { exact: true }).click();
  const viewport = page.getByTestId('scene-viewport'),
    v = (await viewport.boundingBox())!;
  for (const id of ['hero', 'far', 'negative']) {
    const b = (await page.getByTestId(`viewport-${id}`).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(v.x);
    expect(b.y).toBeGreaterThanOrEqual(v.y);
    expect(b.x + b.width).toBeLessThanOrEqual(v.x + v.width);
    expect(b.y + b.height).toBeLessThanOrEqual(v.y + v.height);
  }
  const zoom = page.getByLabel('Zoom', { exact: true }),
    oldZoom = Number(await zoom.inputValue());
  const stage = page.getByTestId('stage'),
    before = (await stage.boundingBox())!,
    point = { x: v.x + v.width * 0.57, y: v.y + v.height * 0.43 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(oldZoom);
  const nextZoom = Number(await zoom.inputValue()),
    next = (await stage.boundingBox())!;
  expect(Math.abs((point.x - before.x) / oldZoom - (point.x - next.x) / nextZoom)).toBeLessThan(4);
  expect(Math.abs((point.y - before.y) / oldZoom - (point.y - next.y) / nextZoom)).toBeLessThan(4);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeLessThan(nextZoom);
  const pixels = await page
    .getByTestId('scene-pixels')
    .evaluate((el) => (el as HTMLCanvasElement).width * (el as HTMLCanvasElement).height);
  expect(pixels).toBeLessThan((v.width + 32) * (v.height + 32));
  await expect(page.getByLabel('Undo', { exact: true })).toBeDisabled();
  await page.screenshot({ path: 'evidence/scene-navigation.png', fullPage: true });
});

test('framing shortcuts respect text input and Escape ends a captured pan', async ({ page }) => {
  await page.getByTestId('tree-hero').click();
  const viewport = page.getByTestId('scene-viewport'),
    box = (await viewport.boundingBox())!,
    zoom = page.getByLabel('Zoom', { exact: true });
  await viewport.focus();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('f');
  const framedZoom = Number(await zoom.inputValue());
  await page.keyboard.press('Home');
  await expect.poll(async () => Number(await zoom.inputValue())).toBeLessThan(framedZoom);
  const overviewZoom = await zoom.inputValue();
  await page.getByLabel('Object name', { exact: true }).focus();
  await page.keyboard.press('f');
  await page.keyboard.press('Home');
  await expect(zoom).toHaveValue(overviewZoom);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
  await expect(viewport).toHaveClass(/view-panning/);
  await page.keyboard.press('Escape');
  const pan = await viewport.getAttribute('data-view-pan-x');
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
  await page.mouse.up({ button: 'right' });
  await expect(viewport).not.toHaveClass(/view-panning/);
  await expect(viewport).toHaveAttribute('data-view-pan-x', pan!);
});
