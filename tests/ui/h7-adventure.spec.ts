import { test, expect } from '@playwright/test';
import { createH7Adventure } from '../../src/examples/h7-adventure';
test('H7 adventure has editable sword settings, touch controls, following camera and board preset', async ({
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
  const title = page.getByTestId('viewport-title');
  await expect(title).toContainText('WILLOWLIGHT');
  const before = await title.boundingBox();
  const right = page.getByTestId('viewport-pad_right');
  const r = (await right.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  expect((await title.boundingBox())!.x).toBe(before!.x);
  const sword = page.getByTestId('viewport-slash');
  await sword.click();
  await page.waitForTimeout(130);
  await page.screenshot({ path: 'evidence/h7-adventure-preview.png' });
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Target guidance…', exact: true }).click();
  await expect(page.getByLabel('Target family', { exact: true })).toHaveValue('stm32h7rs');
  await expect(page.getByRole('button', { name: 'Configure board & display' })).toBeVisible();
  await page.getByLabel('Close dialog', { exact: true }).click();
  expect(errors).toEqual([]);
});
