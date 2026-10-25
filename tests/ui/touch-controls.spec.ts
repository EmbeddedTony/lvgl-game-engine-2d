import { test, expect } from '@playwright/test';
import { createH7Adventure } from '../../src/examples/h7-adventure';
import { createStarter } from '../../src/assets';

const storage = 'lvgl-game-engine.project.v1';
test('DK touchscreen option persists and hold/slide/outside release shares input with keyboard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createH7Adventure(),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const stage = page.getByTestId('stage');
  const camera = async (axis: 'x' | 'y') => Number(await stage.getAttribute(`data-camera-${axis}`));
  const start = { x: await camera('x'), y: await camera('y') };
  const right = (await page.getByTestId('viewport-pad_right').boundingBox())!;
  const up = (await page.getByTestId('viewport-pad_up').boundingBox())!;
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
  await page.mouse.down();
  await expect.poll(() => camera('x')).toBeGreaterThan(start.x + 10);
  // Leave the arrow while captured, cross a gap, and enter a different direction.
  await page.mouse.move(bounds.x + bounds.width * 0.25, right.y + right.height / 2);
  await page.waitForTimeout(100);
  const gap = await camera('x');
  await page.waitForTimeout(120);
  expect(await camera('x')).toBe(gap);
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2);
  await expect.poll(() => camera('y')).toBeLessThan(start.y - 10);
  await page.mouse.move(bounds.x + bounds.width + 20, bounds.y + bounds.height + 20);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const stopped = await camera('y');
  await page.waitForTimeout(120);
  expect(await camera('y')).toBe(stopped);
  await stage.focus();
  await page.keyboard.down('d');
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  const before = await camera('x');
  await expect.poll(() => camera('x')).toBeGreaterThan(before + 10);
  await page.keyboard.up('d');
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.getByLabel('Project settings', { exact: true }).click();
  const option = page.getByRole('dialog').getByRole('checkbox', { name: /^Touchscreen controls/ });
  await expect(option).toBeChecked();
  await option.uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('viewport-pad_right')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).scenes[0].touchControls,
        storage,
      ),
    )
    .toBe(false);
  await page.getByLabel('Project settings', { exact: true }).click();
  await option.check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('viewport-pad_right')).toBeVisible();
  expect(errors).toEqual([]);
});

test('enabling touch controls creates one editable preset and supports undo', async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createStarter(),
  );
  await page.goto('/');
  await page.getByLabel('Project settings', { exact: true }).click();
  const option = page.getByRole('dialog').getByRole('checkbox', { name: /^Touchscreen controls/ });
  await expect(option).not.toBeChecked();
  await option.check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('tree-touch_controls')).toBeVisible();
  await expect(page.getByTestId('viewport-pad_right')).toBeVisible();
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByTestId('tree-touch_controls')).toHaveCount(0);
  await page.getByLabel('Redo', { exact: true }).click();
  await expect(page.getByTestId('tree-touch_controls')).toBeVisible();
  await page.getByTestId('tree-pad_right').click();
  await expect(page.getByLabel('Controller input', { exact: true })).toHaveValue('right');
  await page.screenshot({ path: 'evidence/touch-controls-editor.png', fullPage: true });
});
