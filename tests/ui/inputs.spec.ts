import { test, expect } from '@playwright/test';
test('configure physical controllers, simulate calibration and persist valid drafts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
  await dialog.getByRole('button', { name: '+ BLE controller', exact: true }).click();
  await expect(dialog.getByLabel('Game binding', { exact: true })).toHaveValue('moveX');
  await expect(dialog.getByLabel('Packet encoding')).toHaveValue('u16le');
  await dialog.getByLabel('Channel name', { exact: true }).fill('Left stick horizontal');
  await dialog.getByLabel('Test raw value').fill('4095');
  await expect(dialog.locator('.input-preview-values')).toContainText('1.000');
  await dialog.getByRole('button', { name: '+ float', exact: true }).click();
  await dialog.getByLabel('Channel name', { exact: true }).fill('Temperature');
  await expect(dialog.getByLabel('Value type')).toHaveValue('float');
  await expect(dialog.getByLabel('Game binding', { exact: true })).toHaveValue('none');
  // Invalid drafts must never reach autosave or silently break project recovery.
  await dialog.getByLabel('Minimum', { exact: true }).fill('2');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').inputs
            ?.channels[3]?.min,
      ),
    )
    .toBe(-1);
  await dialog.getByLabel('Minimum', { exact: true }).fill('-1');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'evidence/physical-inputs-editor.png' });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').inputs?.channels
            .length,
      ),
    )
    .toBe(4);
  await page.reload();
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
  await expect(dialog.getByRole('button', { name: /Left stick horizontal/ })).toBeVisible();
  await dialog.getByRole('button', { name: /Action button/ }).click();
  await expect(dialog.getByLabel('Value type')).toHaveValue('bool');
  await dialog.getByLabel('Test button pressed').check();
  await expect(dialog.locator('.input-preview-values')).toContainText('1.000');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});
