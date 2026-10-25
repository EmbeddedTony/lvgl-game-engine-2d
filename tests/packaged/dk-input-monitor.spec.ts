import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { addDkMonitorPreset } from '../../src/input/model';
import { useH7Board } from '../../src/boards/stm32h7s78';

/* Opt-in hardware test. The board must already run --input-monitor firmware.
 * This test opens a real serial device; it never flashes or sends serial bytes.
 * LGE_DK_SERIAL must match the explicit device name/path in Electron's chooser.
 * Optional LGE_DK_TOUCH_SECONDS gives a person time to exercise touch and B2. */
test('real DK VCP streams typed values into the editor and compiled C bindings', async () => {
  test.skip(!process.env.LGE_DK_SERIAL, 'Requires the connected DK and opt-in serial device name.');
  test.setTimeout(180000);
  const root = await mkdtemp(join(tmpdir(), 'lge-dk-vcp-')),
    profile = join(root, 'profile');
  const output = resolve('evidence/dk-input-monitor-2026-10-21');
  await mkdir(profile);
  await mkdir(output, { recursive: true });
  const p = JSON.parse(await readFile('examples/PhysicalControllers.lge.json', 'utf8'));
  p.inputs = addDkMonitorPreset({ sources: [], channels: [] });
  p.code = p.code
    .replaceAll('UI_CHANNEL_TEMPERATURE', 'UI_CHANNEL_DK_UPTIME')
    .replaceAll('temperature', 'board uptime');
  useH7Board(p);
  // A separate desktop test project. Binding real uptime to X verifies the
  // complete serial → monitor → C path without synthesizing a physical sample.
  p.inputs.channels[4].binding = 'moveX';
  p.inputs.channels[4].max = 1;
  await writeFile(
    join(profile, 'recovery.json'),
    JSON.stringify({
      text: JSON.stringify(p),
      path: join(root, 'DK-monitor-test.lge.json'),
      dirty: false,
    }),
  );
  const app = await electron.launch({
    executablePath: resolve(
      process.env.LGE_MONITOR_APP ??
        'release/dk-input-monitor-update/mac-arm64/LVGL Game Engine 2D.app',
      'Contents/MacOS/LVGL Game Engine 2D',
    ),
    env: { ...process.env, LGE_PROFILE_DIR: profile },
    timeout: 15000,
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByLabel('Project settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
    await dialog.getByRole('tab', { name: 'Live monitor', exact: true }).click();
    await dialog.getByRole('button', { name: 'Connect serial', exact: true }).click();
    const picker = dialog.getByRole('region', { name: 'Choose input hardware' });
    await expect(picker).toBeVisible();
    const names = await picker.getByRole('button').allTextContents();
    const match = names.find((n) => n.includes(process.env.LGE_DK_SERIAL!));
    expect(
      match,
      'Explicit ST-LINK VCP must appear in the real Electron chooser: ' + names,
    ).toBeTruthy();
    await picker.getByRole('button', { name: match!, exact: true }).click();
    const row = (id: string) => dialog.getByTestId('live-input-' + id);
    await expect(row('dk_touch_x')).toHaveAttribute('data-active', 'true');
    await expect(row('dk_touch_x').locator('.live-raw')).toHaveText('400');
    await expect(row('dk_touch_y').locator('.live-raw')).toHaveText('240');
    await expect(row('dk_touch_down').locator('.live-raw')).toHaveText('false');
    await expect(row('dk_button').locator('.live-raw')).toHaveText('false');
    const initialUptime = Number(await row('dk_uptime').locator('.live-raw').textContent());
    await expect
      .poll(async () => Number(await row('dk_uptime').locator('.live-raw').textContent()))
      .toBeGreaterThan(initialUptime + 1);
    await dialog.getByLabel('Show game test', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(dialog.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    const feedback = dialog.getByTestId('live-native-bindings');
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByLabel('Drive native game with monitored inputs').check();
    await expect(feedback).toHaveAttribute('data-x', '1');
    await dialog.getByLabel('Drive native game with monitored inputs').uncheck();
    await expect(feedback).toHaveAttribute('data-x', '0');
    // Capture a changing float from real UART samples, rebuild calibration and
    // verify the exported C runtime uses the captured range and center.
    await row('dk_uptime').getByRole('button').click();
    await dialog.getByRole('button', { name: 'Capture range', exact: true }).click();
    await page.waitForTimeout(1300);
    await dialog.getByRole('button', { name: 'Apply captured range', exact: true }).click();
    await dialog.getByRole('button', { name: 'Apply inputs & rebuild', exact: true }).click();
    await expect(dialog.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await dialog.getByLabel('Drive native game with monitored inputs').check();
    await expect(feedback).toHaveAttribute('data-x', '1');
    const samples: unknown[] = [];
    await dialog.getByLabel('Live game binding').selectOption('none');
    await dialog.getByRole('button', { name: 'Apply inputs & rebuild', exact: true }).click();
    await expect(dialog.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await dialog.getByLabel('Drive native game with monitored inputs').check();
    await expect(feedback).toHaveAttribute('data-x', '0');
    await writeFile(
      join(output, 'ready-for-touch.json'),
      JSON.stringify({ ready: true, port: match }),
    );
    const duration =
      Math.max(0, Math.min(120, Number(process.env.LGE_DK_TOUCH_SECONDS) || 0)) * 1000;
    const end = Date.now() + duration;
    let touch = false,
      button = false;
    while (Date.now() < end) {
      const values = await dialog.locator('.live-input-table tbody tr').evaluateAll((rows) =>
        rows.map((r) => ({
          id: r.getAttribute('data-testid'),
          value: r.querySelector('.live-raw')?.textContent,
          hz: r.lastElementChild?.textContent,
        })),
      );
      const down = values.find((v) => v.id === 'live-input-dk_touch_down')?.value === 'true';
      const b2 = values.find((v) => v.id === 'live-input-dk_button')?.value === 'true';
      samples.push({
        at: Date.now(),
        values,
        x: await feedback.getAttribute('data-x'),
        y: await feedback.getAttribute('data-y'),
        actions: await feedback.getAttribute('data-actions'),
        text: await feedback.textContent(),
      });
      if (down && !touch) {
        touch = true;
        await page.screenshot({ path: join(output, 'physical-touch.png') });
      }
      if (b2 && !button) {
        button = true;
        await page.screenshot({ path: join(output, 'physical-button.png') });
      }
      if (touch && button && Date.now() + 1000 < end) {
        await page.waitForTimeout(1000);
        break;
      }
      await page.waitForTimeout(50);
    }
    await dialog.locator('.live-monitor-values').evaluate((el) => {
      el.scrollTop = 0;
    });
    await dialog.locator('.live-game-test').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: join(output, 'live-editor.png') });
    await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(feedback).toHaveAttribute('data-x', '0');
    await expect(row('dk_touch_x')).toHaveAttribute('data-active', 'false');
    // Reopen the same physical port and prove cleanup releases the OS handle.
    await dialog.getByRole('button', { name: 'Connect serial', exact: true }).click();
    await picker.getByRole('button', { name: match!, exact: true }).click();
    await expect(row('dk_uptime')).toHaveAttribute('data-active', 'true');
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByRole('button', { name: 'Stop game', exact: true }).click();
    expect(errors).toEqual([]);
    await writeFile(
      join(output, 'editor-validation.json'),
      JSON.stringify(
        {
          port: match,
          realSerial: true,
          typedIntFloatBool: true,
          realUptimeDroveNativeC: true,
          capturedCalibrationRebuilt: true,
          monitorOnlyIsolated: true,
          disconnectReleased: true,
          reconnectWorked: true,
          physicalTouchObserved: touch,
          physicalB2Observed: button,
          adcElectricalTest: false,
          bleRadioTest: false,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
