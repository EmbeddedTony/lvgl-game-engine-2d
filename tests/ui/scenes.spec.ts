import { test, expect } from '@playwright/test';
import { createSceneDemo } from '../../src/scene-demo';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createSceneDemo(),
  );
  await page.goto('/');
});
test('linked scene tree edits overrides, opens source, propagates source changes and reparents without moving', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('tree-hud/title').click();
  await expect(page.getByLabel('Override text')).toHaveValue('SCENE DEMO');
  await page.getByLabel('Override text').fill('MY HUD');
  await expect(page.getByTestId('viewport-hud/title')).toContainText('MY HUD');
  await page.getByRole('button', { name: 'Revert node overrides', exact: true }).click();
  await expect(page.getByTestId('viewport-hud/title')).toContainText('THE LITTLE GROVE');
  await page.getByRole('button', { name: 'Open source scene', exact: true }).click();
  await expect(page.getByLabel('Active scene')).toHaveValue('scene_hud');
  await page.getByTestId('tree-title').click();
  await page.getByLabel('Object text').fill('SOURCE UPDATED');
  await page.getByRole('button', { name: 'Back to Forest clearing', exact: false }).click();
  await expect(page.getByTestId('viewport-hud/title')).toContainText('SOURCE UPDATED');
  await page.getByTestId('tree-crystal_0').click();
  const crystal = page.getByTestId('viewport-crystal_0/gem');
  const before = await crystal.evaluate((el) => [
    (el as HTMLElement).style.left,
    (el as HTMLElement).style.top,
  ]);
  await page.getByLabel('Node parent').selectOption('hero');
  expect(
    await crystal.evaluate((el) => [(el as HTMLElement).style.left, (el as HTMLElement).style.top]),
  ).toEqual(before);
  await expect(
    page.getByLabel('Node parent').getByRole('option', { name: 'Crystal 1', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Node parent')).toHaveValue('');
  await page.screenshot({ path: 'evidence/scene-composition-editor.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('branch extraction, instancing, overrides, duplication and unpacking form one undoable workflow', async ({
  page,
}) => {
  await page.getByTestId('tree-stone_0').click();
  await page.getByRole('button', { name: 'Save branch as scene', exact: true }).click();
  await expect(page.getByLabel('Instance source')).toBeVisible();
  const sourceId = await page.getByLabel('Instance source').inputValue();
  await page.getByLabel('Duplicate object', { exact: true }).click();
  await expect(page.getByLabel('Instance source')).toHaveValue(sourceId);
  await page.getByRole('button', { name: 'Unpack to editable nodes', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue(/copy/);
  await expect(page.getByLabel('Instance source')).toHaveCount(0);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Instance source')).toHaveValue(sourceId);
  await page.getByRole('button', { name: 'Add object', exact: false }).first().click();
  await page.getByRole('button', { name: 'Instance scene…', exact: true }).click();
  await page.getByLabel('Find source scene').fill('Menu action');
  await page
    .getByRole('dialog', { name: 'Instance scene', exact: true })
    .getByRole('button', { name: 'Menu action', exact: false })
    .click();
  await expect(page.getByLabel('Instance source')).toHaveValue('scene_action');
});
test('composed game previews its real nested buttons, controller, collectibles and sequence rules', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Game flow', exact: true }).click();
  await page.getByRole('button', { name: 'Play game', exact: true }).click();
  await page.getByTestId('viewport-begin_button/action').click();
  await expect(page.getByTestId('viewport-hero/player')).toBeVisible();
  await page.getByTestId('stage').focus();
  await page.keyboard.down('w');
  await expect(page.getByTestId('viewport-hud/score')).toContainText('1 / 3');
  await page.keyboard.up('w');
  await page.getByLabel('Stop preview').click();
  await expect(page.getByLabel('Active scene')).toHaveValue('grove');
  await expect(page.getByTestId('viewport-hud/score')).toContainText('0 / 3');
});
