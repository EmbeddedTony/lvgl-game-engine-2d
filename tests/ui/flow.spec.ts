import { test, expect } from '@playwright/test';
import { createFlowDemo } from '../../src/flow-demo';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createFlowDemo(),
  );
  await page.goto('/');
});
test('scene library folders, stable rename/reorder, references, duplication and undo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Game flow', exact: true }).click();
  await page.getByLabel('New folder name').fill('Chapter 2');
  await page.getByLabel('Create scene folder').click();
  const option = page
    .getByLabel('Scene folder', { exact: true })
    .getByRole('option', { name: 'Chapter 2' });
  const id = await option.getAttribute('value');
  await page.getByLabel('Scene folder', { exact: true }).selectOption(id!);
  await page.getByLabel('Library scene name').fill('Forest level');
  await expect(page.getByLabel('Step 2 scene', { exact: true })).toHaveValue('grove');
  await expect(page.getByLabel('Delete scene', { exact: true })).toBeDisabled();
  await expect(page.getByText('Used by: Main journey.', { exact: false })).toBeVisible();
  await page.getByLabel('Move step 1 down').click();
  await expect(page.locator('.flow-step').first()).toHaveAttribute(
    'data-testid',
    'flow-step-step_grove',
  );
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.locator('.flow-step').first()).toHaveAttribute(
    'data-testid',
    'flow-step-step_title',
  );
  await page.getByLabel('Duplicate scene', { exact: true }).click();
  await expect(page.getByLabel('Library scene name')).toHaveValue('Forest level copy');
  await expect(page.getByLabel('Delete scene', { exact: true })).toBeEnabled();
  await page.getByLabel('Delete scene', { exact: true }).click();
  await expect(page.getByLabel('Library scene name')).toHaveValue('Forest level');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(
    page.locator('.flow-scene-name').filter({ hasText: 'Forest level copy' }),
  ).toBeVisible();
  await page.screenshot({ path: 'evidence/scene-organizer.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('sequence preview follows clicks, manual next, pause, loop and restores authoring scene', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Game flow', exact: true }).click();
  await page.getByRole('button', { name: 'Preview sequence', exact: true }).click();
  await expect(page.getByTestId('viewport-begin_button')).toBeVisible();
  await page.getByTestId('viewport-begin_button').click();
  await expect(page.getByTestId('viewport-player')).toBeVisible();
  await page.getByLabel('Pause', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next step', exact: false })).toBeDisabled();
  await page.getByLabel('Resume', { exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: false }).click();
  await expect(page.getByTestId('viewport-replay_button')).toBeVisible();
  await page.getByTestId('viewport-replay_button').click();
  await expect(page.getByTestId('viewport-begin_button')).toBeVisible();
  await page.getByLabel('Stop preview').click();
  await expect(page.getByLabel('Active scene')).toHaveValue('grove');
  await expect(page.getByTestId('viewport-player')).toBeVisible();
  await page.getByRole('button', { name: 'Game flow', exact: true }).click();
  await page.getByRole('button', { name: 'Play game', exact: true }).click();
  await expect(page.getByTestId('viewport-begin_button')).toBeVisible();
});
test('a button used by a sequence cannot be deleted through the object inspector', async ({
  page,
}) => {
  await page.getByLabel('Active scene').selectOption('scene_title');
  await page.getByTestId('tree-begin_button').click();
  await page.getByRole('button', { name: 'Delete object', exact: true }).click();
  await expect(page.getByText('This button advances a sequence.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('tree-begin_button')).toBeVisible();
});
test('sequence builder adds/removes scenes and configures explicit ending', async ({ page }) => {
  await page.getByRole('button', { name: 'Game flow', exact: true }).click();
  await page.getByRole('button', { name: 'New sequence', exact: true }).click();
  await page.getByLabel('Sequence name').fill('Tutorial');
  await page.getByRole('button', { name: 'Add scene to sequence', exact: true }).click();
  await page.getByLabel('Step 1 scene', { exact: true }).selectOption('scene_title');
  await page.getByLabel('Step 1 advance').selectOption('click');
  await expect(page.getByLabel('Step 1 button')).toHaveValue('begin_button');
  await page.getByRole('button', { name: 'Add scene to sequence', exact: true }).click();
  await page.getByLabel('Sequence ending').selectOption('scene');
  await page.getByLabel('Sequence end scene').selectOption('scene_results');
  const sequenceId = await page
    .getByLabel('Game entry', { exact: true })
    .getByRole('option', { name: 'Tutorial', exact: true })
    .getAttribute('value');
  await page.getByLabel('Game entry', { exact: true }).selectOption(sequenceId!);
  await expect(page.getByLabel('Delete sequence', { exact: true })).toBeDisabled();
  await page.getByLabel('Remove step 2').click();
  await expect(page.locator('.flow-step')).toHaveCount(1);
  await page.setViewportSize({ width: 760, height: 850 });
  await expect(page.getByLabel('Game entry', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
