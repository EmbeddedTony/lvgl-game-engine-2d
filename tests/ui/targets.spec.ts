import { test, expect } from '@playwright/test';
import { createStarter } from '../../src/assets';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((p) => {
    if (!localStorage.getItem('lvgl-game-engine.project.v1'))
      localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p));
  }, createStarter());
  await page.goto('/');
});

test('target planning is optional, updates resource advice, saves and undoes without blocking export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!));
  await page.getByRole('button', { name: 'Target guidance', exact: true }).click();
  const panel = page.getByTestId('target-guidance');
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('Target family', { exact: true })).toHaveValue('');
  expect((await stored()).target).toBeUndefined();
  await page.getByLabel('Find target family').fill('STM32');
  await expect(
    page.getByLabel('Target family', { exact: true }).locator('option[value="stm32n6"]'),
  ).toHaveCount(1);
  await expect(
    page.getByLabel('Target family', { exact: true }).locator('option[value="esp32"]'),
  ).toHaveCount(0);
  await page.getByLabel('Target family', { exact: true }).selectOption('stm32f0');
  await expect(panel.locator('[data-guidance="ram"]')).toBeVisible();
  await page.getByLabel('SD / eMMC capacity (MiB)', { exact: true }).fill('2048');
  await expect(panel.locator('[data-guidance="ram"]')).toBeVisible();
  await page.getByLabel('External RAM (KiB)', { exact: true }).fill('8192');
  await expect(panel.locator('[data-guidance="ram"]')).toHaveCount(0);
  await expect(panel.locator('[data-guidance="internal-ram"]')).toBeVisible();
  await page.getByLabel('Close dialog', { exact: true }).click();
  await page.getByLabel('Undo', { exact: true }).click();
  await page.getByRole('button', { name: 'Target guidance', exact: true }).click();
  await expect(page.getByLabel('External RAM (KiB)', { exact: true })).toHaveValue('0');
  await page.getByLabel('Close dialog', { exact: true }).click();
  await expect.poll(async () => (await stored()).target?.externalRamKiB).toBe(0);
  expect((await stored()).target.family).toBe('stm32f0');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Target guidance', exact: true })).toContainText(
    'STM32F0',
  );
  await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download LVGL package', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Open target guidance' }).click();
  await expect(panel.locator('[data-guidance="ram"]')).toBeVisible();
  await page.screenshot({ path: 'evidence/target-guidance-memory.png' });
  expect(errors).toEqual([]);
});

test('port capabilities stay separate from bandwidth and Linux/PC targets suppress MCU advice', async ({
  page,
}) => {
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Target guidance…', exact: true }).click();
  const panel = page.getByTestId('target-guidance');
  await page.getByLabel('Target family', { exact: true }).selectOption('stm32n6');
  await panel.locator('summary').filter({ hasText: 'Refresh & custom C effects' }).click();
  await page.getByLabel('Runtime rotation / scaling', { exact: true }).check();
  await page.getByLabel('Blur / convolution filters', { exact: true }).check();
  await page.getByLabel('Effective display payload (Mbit/s)', { exact: true }).fill('8');
  await expect(panel.locator('[data-guidance="vector"]')).toBeVisible();
  await expect(panel.locator('[data-guidance="transforms"]')).toBeVisible();
  await expect(panel.locator('[data-guidance="display-link"]')).toBeVisible();
  await panel.locator('summary').filter({ hasText: 'Acceleration enabled by your port' }).click();
  await expect(page.getByLabel('Port uses simd', { exact: true })).toBeDisabled();
  await page.getByLabel('Port uses dma2d', { exact: true }).check();
  await expect(panel.locator('[data-guidance="transforms"]')).toBeVisible();
  await page.getByLabel('Port uses graphics', { exact: true }).check();
  await expect(panel.locator('[data-guidance="transforms"]')).toHaveCount(0);
  await expect(panel.locator('[data-guidance="vector"]')).toBeVisible();
  await page.getByLabel('Port uses helium', { exact: true }).check();
  await expect(panel.locator('[data-guidance="vector"]')).toHaveCount(0);
  await expect(panel.locator('[data-guidance="display-link"]')).toBeVisible();
  await page.screenshot({ path: 'evidence/target-guidance-capabilities.png' });
  for (const family of ['embedded-linux', 'host-pc']) {
    await page.getByLabel('Target family', { exact: true }).selectOption(family);
    await expect(panel.locator('[data-guidance]')).toHaveCount(0);
    await expect(
      panel.getByText(/MCU memory, storage and accelerator warnings are suppressed/),
    ).toBeVisible();
  }
  await page.getByLabel('Target family', { exact: true }).selectOption('stm32f0');
  await page.getByLabel('Enable MCU guidance', { exact: true }).uncheck();
  await expect(panel.locator('[data-guidance]')).toHaveCount(0);
  await page.setViewportSize({ width: 760, height: 700 });
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
