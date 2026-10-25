import { test, expect } from '@playwright/test';

test('public edition creates 2D scenes with display presets and omits private templates', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /New project/ }).click();
  await expect(page.getByLabel('New display preset')).toBeVisible();
  await expect(page.getByLabel('3D project (experimental)')).toHaveCount(0);
  await page.getByLabel('New project name').fill('Public 2D project');
  await page.getByLabel('New display preset').selectOption('320x240');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Scene', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await expect(
    page.getByRole('menuitem').filter({ hasText: /3D|Seven Beacons|Briarwatch/ }),
  ).toHaveCount(0);
});
