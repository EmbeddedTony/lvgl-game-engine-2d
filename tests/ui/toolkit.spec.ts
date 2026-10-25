import { test, expect } from '@playwright/test';
import { createToolkitDemo } from '../../src/gameplay/toolkit-demo';
test('2D Toolkit tools edit bounded patterns and linked RPG records with undo, previews and guarded deletion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createToolkitDemo(),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Bullet patterns', exact: true }).click();
  await expect(page.getByLabel('Pattern name')).toHaveValue('Gentle spiral');
  await expect(page.getByLabel('Bullet pattern live preview')).toBeVisible();
  await page.getByLabel('Bullets per burst').fill('12');
  await expect(page.getByLabel('Bullets per burst')).toHaveValue('12');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Bullets per burst')).toHaveValue('8');
  await expect(page.getByRole('button', { name: 'Delete pattern', exact: true })).toBeDisabled();
  await expect(page.getByText(/(?:16|24) active · 0 dropped/)).toBeVisible();
  await page.getByLabel('Pattern name').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'evidence/toolkit-pattern-editor.png' });
  await page.getByRole('button', { name: 'RPG database', exact: true }).click();
  await expect(page.getByLabel('RPG resource name')).toHaveValue('Amber potion');
  await expect(page.getByLabel('Item inventory stack')).toHaveValue('potions');
  await page.getByRole('button', { name: 'Actors & species · 2/128', exact: true }).click();
  await page.getByLabel('Preview level').fill('3');
  await expect(page.getByText('HP 52 · ATTACK 14 · DEFENSE 8 · SPEED 10')).toBeVisible();
  await page.getByRole('button', { name: 'Skills · 2/128', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete resource', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Encounter tables · 1/128', exact: true }).click();
  await page.getByRole('button', { name: '+ Encounter entry', exact: true }).click();
  await expect(page.getByLabel('Encounter actor 2')).toHaveValue('ranger');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Encounter actor 2')).toHaveCount(0);
  await page.screenshot({ path: 'evidence/toolkit-rpg-editor.png' });
  expect(errors).toEqual([]);
});
test('Scene inspector exposes ramps, prescribed platform paths and bullet emitters; play restores source', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createToolkitDemo(),
  );
  await page.goto('/');
  await page.getByTestId('tree-ramp').click();
  await expect(page.getByLabel('Floor shape', { exact: true })).toHaveValue('up');
  await page.getByTestId('tree-lift').click();
  await expect(page.getByLabel('Physics body')).toHaveValue('platform');
  await expect(page.getByLabel('Platform movement')).toHaveValue('path');
  await expect(page.getByLabel('Travel Y · px')).toHaveValue('-48');
  await page.getByLabel('Travel Y · px').fill('-64');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Travel Y · px')).toHaveValue('-48');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() =>
      page.getByTestId('viewport-lift').evaluate((el) => parseFloat((el as HTMLElement).style.top)),
    )
    .toBeLessThan(130);
  await page.getByLabel('Stop preview', { exact: true }).click();
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue('132');
  await page.getByLabel('Active scene').selectOption('bullet_lab');
  await page.getByTestId('tree-emitter').click();
  await page.getByText('Bullet emitter', { exact: true }).click();
  await expect(page.getByLabel('Object bullet pattern')).toHaveValue('spiral');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('[data-testid^="viewport-__projectile_"]').count())
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'evidence/toolkit-bullet-preview.png' });
  await page.getByLabel('Stop preview', { exact: true }).click();
  expect(errors).toEqual([]);
});
