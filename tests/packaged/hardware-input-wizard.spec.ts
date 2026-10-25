import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hardwareSignature } from '../../src/input/hardware/model';
import { addInputPreset } from '../../src/input/model';
test('packaged wizard drives calibrated C bindings with generated hardware channels and protects Boot', async () => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), 'lge-hardware-wizard-')),
    profile = join(root, 'profile');
  await mkdir(profile);
  const p = JSON.parse(await readFile('examples/DKHardwareInputs.lge.json', 'utf8'));
  p.inputs = addInputPreset(p.inputs, 'ble');
  await writeFile(
    join(profile, 'recovery.json'),
    JSON.stringify({
      text: JSON.stringify(p),
      path: join(root, 'Controller.lge.json'),
      dirty: false,
    }),
  );
  const app = await electron.launch({
    executablePath: resolve(
      process.env.LGE_MONITOR_APP ??
        'release/hardware-input-wizard-update/mac-arm64/LVGL Game Engine 2D.app',
      'Contents/MacOS/LVGL Game Engine 2D',
    ),
    env: { ...process.env, LGE_PROFILE_DIR: profile },
    timeout: 15000,
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const ids = p.inputs.hardware.pins.map((v: { channel: string }) => v.channel);
    await page.addInitScript(
      ({ signature, ids }) => {
        let rx: ReadableStreamDefaultController<Uint8Array> | undefined;
        const state = { signature, x: 2048, y: 2048, button: false };
        (window as unknown as { controllerState: typeof state }).controllerState = state;
        Object.defineProperty(navigator, 'serial', {
          value: {
            requestPort: async () => ({
              open: async () => {},
              close: async () => {
                rx = undefined;
              },
              readable: new ReadableStream<Uint8Array>({
                start(c) {
                  rx = c;
                },
                cancel() {
                  rx = undefined;
                },
              }),
            }),
          },
        });
        setInterval(() => {
          if (rx)
            rx.enqueue(
              new TextEncoder().encode(
                `@lge_hardware=${state.signature}\n${ids[0]}=${state.x}\n${ids[1]}=${state.y}\n${ids[2]}=${state.button}\n`,
              ),
            );
        }, 50);
      },
      { signature: hardwareSignature(p.inputs.hardware), ids },
    );
    await page.reload();
    await page.getByLabel('Project settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
    const d = page.getByRole('dialog', { name: 'Inputs & controllers' });
    await d.getByRole('tab', { name: 'Hardware wizard' }).click();
    await expect(d.getByLabel('Joystick X pin', { exact: true })).toHaveValue('PC0');
    await d.getByRole('button', { name: 'Calibrate & test', exact: false }).click();
    await d.getByRole('button', { name: 'Connect serial', exact: true }).click();
    await expect(d.getByTestId('hardware-profile-status')).toContainText('profile matches');
    await d.getByLabel('Show game test', { exact: true }).check();
    await d.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(d.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await d.getByLabel('Drive native game with monitored inputs').check();
    const f = d.getByTestId('live-native-bindings');
    await expect(f).toHaveAttribute('data-x', '0');
    const state = (patch: Record<string, unknown>) =>
      page.evaluate(
        (patch) =>
          Object.assign(
            (window as unknown as { controllerState: Record<string, unknown> }).controllerState,
            patch,
          ),
        patch,
      );
    await state({ x: 4095, button: true });
    await expect(f).toHaveAttribute('data-x', '1');
    await expect(f).toHaveAttribute('data-actions', '16');
    await state({ x: 2000, button: false });
    await expect(d.getByTestId('live-input-' + ids[0]).locator('.live-raw')).toHaveText('2000');
    await d.getByRole('button', { name: 'Set center from live value' }).click();
    await d.getByRole('button', { name: 'Apply inputs & rebuild', exact: true }).click();
    await expect(d.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await d.getByLabel('Drive native game with monitored inputs').check();
    await expect(f).toHaveAttribute('data-x', '0');
    await expect(f).toContainText('2000 → 0.000');
    await d.locator('.live-monitor-values').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: 'evidence/hardware-wizard-packaged.png' });
    await state({ x: 4095 });
    await expect(f).toHaveAttribute('data-x', '1');
    await state({ signature: 'ffffffff' });
    await expect(d.getByTestId('hardware-profile-status')).toContainText('Waiting for matching');
    await expect(d.getByRole('button', { name: 'Set center from live value' })).toBeDisabled();
    await expect(f).toHaveAttribute('data-x', '0');
    await d.getByTestId('live-input-ble_x').getByRole('button').click();
    await d.getByText('Simulate this channel', { exact: true }).click();
    await d.getByLabel('Simulated live raw value').fill('4095');
    await expect(f).toHaveAttribute('data-x', '1');
    await d.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(f).toHaveAttribute('data-x', '0');
    await d.getByRole('button', { name: 'Stop game', exact: true }).click();
    await d.getByRole('button', { name: 'Generate firmware', exact: false }).click();
    await d.getByRole('button', { name: 'Open Build & flash', exact: true }).click();
    await expect(page.getByLabel('Install board bootloader', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Install board bootloader', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Stream inputs over ST-LINK serial')).toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
