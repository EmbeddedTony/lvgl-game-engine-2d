import { test, expect } from '@playwright/test';

test('collider editing preserves artwork, groups undo, exposes hitbox presets and previews jumping', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Physics Playground', exact: true }).click();
  await expect(page.getByLabel('Physics body')).toHaveValue('character');
  await expect(page.getByLabel('Character movement')).toHaveValue('platformer');
  await expect(page.getByLabel('Collider width', { exact: true })).toHaveValue('16');
  await page.getByRole('button', { name: 'Edit collider in scene', exact: true }).click();
  const scale = await page
    .getByTestId('stage')
    .evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
  const handle = (await page.getByTestId('collider-handle-br').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 4 * scale,
    handle.y + handle.height / 2 + 2 * scale,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(page.getByLabel('Collider width', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('24');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Collider width', { exact: true })).toHaveValue('16');
  await page.getByRole('button', { name: 'Finish editing collider', exact: true }).click();
  await page.screenshot({ path: 'evidence/physics-workbench.png', fullPage: true });
  await page.getByRole('button', { name: '+ Hitbox', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('Hitbox');
  await expect(page.getByLabel('Physics body')).toHaveValue('area');
  await expect(page.getByLabel('Layer Hitbox', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Mask Hurtbox', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Mask Player', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Audio cue', { exact: true })).toBeVisible();
  await page.getByLabel('Undo', { exact: true }).click();
  await page.getByTestId('tree-player').click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const actor = page.getByTestId('viewport-player');
  await expect
    .poll(() => actor.evaluate((el) => parseFloat((el as HTMLElement).style.top)))
    .toBe(188);
  await page.getByTestId('stage').focus();
  await page.keyboard.down(' ');
  await expect
    .poll(() => actor.evaluate((el) => parseFloat((el as HTMLElement).style.top)))
    .toBeLessThan(180);
  await page.keyboard.up(' ');
  await page.getByLabel('Stop preview', { exact: true }).click();
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue('172');
  expect(errors).toEqual([]);
});
