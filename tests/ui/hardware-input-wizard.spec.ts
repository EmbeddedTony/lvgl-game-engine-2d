import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { hardwareSignature } from '../../src/input/hardware/model';
test('DK hardware wizard checks pins, generates bindings, verifies firmware and captures joystick calibration', async ({
  page,
}) => {
  const p = JSON.parse(await readFile('examples/DKHardwareInputs.lge.json', 'utf8'));
  delete p.inputs;
  await page.addInitScript((project) => {
    if (!localStorage.getItem('lvgl-game-engine.project.v1'))
      localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(project));
    let rx: ReadableStreamDefaultController<Uint8Array>;
    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: async () => ({
          open: async () => {},
          close: async () => {},
          readable: new ReadableStream<Uint8Array>({
            start(c) {
              rx = c;
            },
          }),
        }),
      },
    });
    (window as unknown as { sendHardware: (text: string) => void }).sendHardware = (text) =>
      rx.enqueue(new TextEncoder().encode(text));
  }, p);
  await page.goto('/');
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
  await dialog.getByRole('tab', { name: 'Hardware wizard' }).click();
  await expect(dialog.getByRole('heading', { name: 'Wire a joystick and buttons' })).toBeVisible();
  await dialog.getByLabel('Joystick Y pin', { exact: true }).selectOption('PC0');
  await expect(dialog.getByRole('alert')).toContainText('assigned more than once');
  await expect(dialog.getByRole('button', { name: 'Generate controller bindings' })).toBeDisabled();
  await dialog.getByLabel('Joystick Y pin', { exact: true }).selectOption('PC2');
  await dialog.getByLabel('Joystick X pin', { exact: true }).selectOption('PF13');
  await expect(dialog.getByRole('alert')).toContainText('Confirm A4 factory solder routing');
  await dialog.getByLabel('A4 uses factory routing').check();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByLabel('Joystick X pin', { exact: true }).selectOption('PC0');
  await dialog.getByLabel('Button 1 pin', { exact: true }).selectOption('PF1');
  await dialog.getByLabel('Button 1 wiring', { exact: true }).selectOption('up:true');
  await expect(dialog.getByLabel('Joystick X pin').locator('option[value="PC1"]')).toHaveAttribute(
    'disabled',
    '',
  );
  await page.screenshot({ path: 'evidence/hardware-wizard-pins.png' });
  await dialog.getByRole('button', { name: 'Generate controller bindings' }).click();
  await expect(dialog.getByRole('table', { name: 'Generated hardware bindings' })).toContainText(
    'CN11 pin 1',
  );
  await dialog.getByText('Generated C pin definitions', { exact: true }).click();
  await expect(dialog.locator('.hardware-generated pre')).toContainText('ADC_CHANNEL_10');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).inputs),
    )
    .toBeTruthy();
  const config = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).inputs,
  );
  expect(config.hardware.pins[2]).toMatchObject({ pin: 'PF1', activeLow: true, pull: 'up' });
  const signature = hardwareSignature(config.hardware),
    x = config.hardware.pins[0].channel,
    y = config.hardware.pins[1].channel;
  await dialog.getByRole('button', { name: 'Calibrate & test', exact: true }).click();
  await dialog.getByRole('button', { name: 'Connect serial', exact: true }).click();
  const send = (text: string) =>
    page.evaluate(
      (t) => (window as unknown as { sendHardware: (text: string) => void }).sendHardware(t),
      text,
    );
  await send(`@lge_hardware=00000000\n${x}=2048\n${y}=2048\n`);
  await expect(dialog.getByTestId('hardware-profile-status')).toContainText('Waiting for matching');
  await expect(dialog.getByRole('button', { name: 'Set center from live value' })).toBeDisabled();
  await send(`@lge_hardware=${signature}\n${x}=2050\n${y}=2048\n`);
  await expect(dialog.getByTestId('hardware-profile-status')).toContainText('profile matches');
  await dialog.getByRole('button', { name: 'Set center from live value' }).click();
  await dialog.getByRole('button', { name: 'Capture range', exact: true }).click();
  await send(`${x}=2047\n${x}=2052\n`);
  await expect(dialog.getByRole('button', { name: 'Apply captured range' })).toBeDisabled();
  await send(`${x}=500\n${x}=3500\n`);
  await dialog.getByRole('button', { name: 'Apply captured range' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).inputs.channels.find(
            (c: { id: string }) => c.id === id,
          ),
        x,
      ),
    )
    .toMatchObject({ min: 500, center: 2050, max: 3500 });
  await page.screenshot({ path: 'evidence/hardware-wizard-calibration.png' });
  await dialog.getByRole('button', { name: 'Choose pins', exact: false }).click();
  await dialog.getByLabel('Joystick X pin', { exact: true }).selectOption('PC3');
  await dialog.getByRole('button', { name: 'Generate controller bindings' }).click();
  await dialog.getByRole('button', { name: 'Calibrate & test', exact: true }).click();
  await expect(dialog.getByTestId('hardware-profile-status')).toContainText('Waiting for matching');
  await expect(dialog.getByRole('button', { name: 'Set center from live value' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).inputs.hardware.pins[0]
            .pin,
      ),
    )
    .toBe('PC3');
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).inputs.hardware.pins[0]
          .pin,
    ),
  ).toBe('PC3');
});
