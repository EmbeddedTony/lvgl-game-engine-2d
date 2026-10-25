import { test, expect } from '@playwright/test';
import { createSceneDemo } from '../../src/scene-demo';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((p) => {
    if (!localStorage.getItem('lvgl-game-engine.project.v1'))
      localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p));
  }, createSceneDemo());
  await page.goto('/');
});
test('dock resizing, collapse, focus and reset persist as layout preferences without editing the project', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await page.evaluate(() => localStorage.getItem('lvgl-game-engine.project.v1'));
  const left = page.getByRole('separator', { name: 'Resize hierarchy' });
  await left.focus();
  await page.keyboard.press('ArrowRight');
  await expect(left).toHaveAttribute('aria-valuenow', '236');
  const project = page.getByRole('separator', { name: 'Resize project dock' });
  await project.focus();
  await page.keyboard.press('ArrowUp');
  await expect(project).toHaveAttribute('aria-valuenow', '212');
  await page.getByLabel('Collapse project dock').click();
  await expect(page.getByRole('navigation', { name: 'Project folders' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('separator', { name: 'Resize hierarchy' })).toHaveAttribute(
    'aria-valuenow',
    '236',
  );
  await expect(page.getByLabel('Expand project dock')).toBeVisible();
  await page.getByLabel('Maximize viewport').click();
  await expect(page.locator('.left-panel')).toBeHidden();
  await expect(page.locator('.right-panel')).toBeHidden();
  await page.getByTestId('stage').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.left-panel')).toBeVisible();
  await page.getByRole('menubar').getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset editor layout' }).click();
  await expect(page.getByRole('separator', { name: 'Resize hierarchy' })).toHaveAttribute(
    'aria-valuenow',
    '220',
  );
  await expect(page.getByLabel('Collapse project dock')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lvgl-game-engine.project.v1'))).toBe(
    before,
  );
  await expect(page.getByLabel('Undo', { exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
test('Project folders select without placing assets; explicit actions and code navigation do real work', async ({
  page,
}) => {
  const readNodes = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).scenes[0].nodes.length,
    );
  const count = await readNodes();
  await page
    .getByRole('navigation', { name: 'Project folders' })
    .getByRole('button', { name: 'Sprites' })
    .click();
  await page.getByRole('listitem', { name: 'Little explorer.image' }).click();
  expect(await readNodes()).toBe(count);
  await page.getByRole('button', { name: 'Add to scene', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('Little explorer');
  await expect.poll(readNodes).toBe(count + 1);
  await page.getByLabel('Undo', { exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Project folders' })
    .getByRole('button', { name: 'Code' })
    .click();
  await page.getByRole('listitem', { name: 'ui.h', exact: true }).dblclick();
  await expect(page.getByLabel('Public API header')).toContainText('bool ui_init(void)'); // CodeMirror virtualizes offscreen declarations.
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Project folders' })
    .getByRole('button', { name: 'Scenes' })
    .click();
  await page.getByRole('listitem', { name: 'Character.scene' }).click();
  await page.getByRole('button', { name: 'Instance in scene', exact: false }).click();
  await expect(page.getByLabel('Instance source')).toHaveValue('scene_character');
  await page.getByRole('tab', { name: 'Console', exact: false }).click();
  await expect(page.getByRole('log', { name: 'Editor console' })).toContainText('Project ready');
  await page.getByLabel('Clear console messages').click();
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Editor console' })).toContainText('No messages');
});
test('scene documents, Game view, folding components and keyboard menus match the new workbench', async ({
  page,
}) => {
  await page
    .getByRole('tablist', { name: 'Scene documents' })
    .getByRole('tab', { name: 'Title', exact: true })
    .click();
  await expect(page.getByLabel('Active scene')).toHaveValue('scene_title');
  await page
    .getByRole('tablist', { name: 'Scene documents' })
    .getByRole('tab', { name: 'Forest clearing', exact: true })
    .click();
  await page.getByTestId('tree-hero/player').click();
  await page.getByRole('button', { name: 'Open source scene', exact: true }).click();
  await page.getByTestId('tree-player').click();
  await page.locator('summary').filter({ hasText: 'Transform' }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeHidden();
  await page.locator('summary').filter({ hasText: 'Transform' }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Forest clearing', exact: false }).click();
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByLabel('Native C code')).toBeVisible();
  await page.getByRole('button', { name: 'Game view', exact: true }).click();
  await expect(page.getByLabel('Stop preview')).toBeVisible();
  await expect(page.getByTestId('stage')).toBeFocused();
  await expect(page.locator('.canvas-rulers')).toBeHidden();
  await page.getByLabel('Pause', { exact: true }).click();
  await page.getByLabel('Resume', { exact: true }).click();
  await expect(page.getByTestId('stage')).toBeFocused();
  await page.getByRole('tab', { name: 'Console', exact: false }).click();
  const before = await page
    .getByTestId('viewport-hero/player')
    .evaluate((el) => (el as HTMLElement).style.top);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.up('ArrowUp');
  expect(
    await page.getByTestId('viewport-hero/player').evaluate((el) => (el as HTMLElement).style.top),
  ).toBe(before);
  await page.getByTestId('stage').focus();
  await page.keyboard.down('w');
  await expect(page.getByTestId('viewport-hud/score')).toContainText('1 / 3');
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByTestId('viewport-hud/score')).toContainText('0 / 3');
  const menu = page.getByRole('menubar').getByRole('menuitem', { name: 'Scene', exact: true });
  await menu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'Scene menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await page.screenshot({ path: 'evidence/workbench-composition.png', fullPage: true });
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});
