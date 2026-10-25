import { test, expect } from '@playwright/test';
async function openMonitor(page: import('@playwright/test').Page, kind = 'ADC joystick') {
  await page.goto('/');
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
  await dialog.getByRole('button', { name: '+ ' + kind, exact: true }).click();
  await dialog.getByRole('tab', { name: 'Live monitor', exact: true }).click();
  return dialog;
}
test('serial acquisition, live center/range calibration, timeout and port cleanup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let stream: ReadableStreamDefaultController<Uint8Array>;
    const state = window as unknown as { feed: (s: string) => void; inputCloses: number };
    state.inputCloses = 0;
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        async requestPort() {
          return Object.assign(new EventTarget(), {
            readable: new ReadableStream({
              start(c) {
                stream = c;
              },
            }),
            async open() {},
            async close() {
              state.inputCloses++;
            },
          });
        },
      },
    });
    state.feed = (s: string) => stream.enqueue(new TextEncoder().encode(s));
  });
  const dialog = await openMonitor(page);
  await dialog.getByRole('button', { name: 'Connect serial', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { feed: (s: string) => void }).feed(
      'adc_x=2000\nadc_y=2048\nadc_action=false\n',
    ),
  );
  const row = dialog.getByTestId('live-input-adc_x');
  await expect(row.locator('.live-raw')).toHaveText('2000');
  await dialog.getByRole('button', { name: 'Set center from live value' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').inputs
            ?.channels[0]?.center,
      ),
    )
    .toBe(2000);
  await page.evaluate(() =>
    (window as unknown as { feed: (s: string) => void }).feed('adc_x=2000\n'),
  );
  await expect(row).toHaveAttribute('data-active', 'true');
  await dialog.getByRole('button', { name: 'Capture range', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { feed: (s: string) => void }).feed('adc_x=600\n'),
  );
  await expect(row.locator('.live-raw')).toHaveText('600');
  await page.evaluate(() =>
    (window as unknown as { feed: (s: string) => void }).feed('adc_x=3400\n'),
  );
  await expect(row.locator('.live-raw')).toHaveText('3400');
  await dialog.getByRole('button', { name: 'Apply captured range' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1') ?? '{}').inputs
          ?.channels[0];
        if (!c) return [];
        return [c.min, c.center, c.max];
      }),
    )
    .toEqual([600, 2000, 3400]);
  await expect(row).toHaveAttribute('data-active', 'false');
  await expect(row).toContainText('Timed out');
  await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { inputCloses: number }).inputCloses))
    .toBe(1);
  await expect(row).toContainText('Disconnected');
  await dialog.getByRole('button', { name: 'Connect serial', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Disconnect', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { inputCloses: number }).inputCloses))
    .toBe(2);
});
test('BLE notifications decode configured fields and a lost link releases the source', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const characteristic = Object.assign(new EventTarget(), {
      value: new DataView(new ArrayBuffer(5)),
      async startNotifications() {},
      async stopNotifications() {},
    });
    const device = Object.assign(new EventTarget(), {
      name: 'BLE test pad',
      gatt: {
        connected: false,
        async connect() {
          this.connected = true;
          return {
            async getPrimaryService() {
              return {
                async getCharacteristic() {
                  return characteristic;
                },
              };
            },
          };
        },
        disconnect() {
          this.connected = false;
        },
      },
    });
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        async requestDevice() {
          return device;
        },
      },
    });
    Object.assign(window, {
      notify: (bytes: number[]) => {
        characteristic.value = new DataView(Uint8Array.from(bytes).buffer);
        characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
      },
      loseLink: () => device.dispatchEvent(new Event('gattserverdisconnected')),
    });
  });
  const dialog = await openMonitor(page, 'BLE controller');
  await dialog.getByLabel('Monitor transport').selectOption('ble');
  await dialog.getByLabel('BLE service UUID').fill('180f');
  await dialog.getByLabel('BLE characteristic UUID').fill('2a19');
  await dialog.getByRole('button', { name: 'Connect BLE', exact: true }).click();
  await expect(dialog).toContainText('BLE test pad');
  await page.evaluate(() =>
    (window as unknown as { notify: (b: number[]) => void }).notify([255, 15, 0, 8, 1]),
  );
  await expect(dialog.getByTestId('live-input-ble_x').locator('.live-raw')).toHaveText('4095');
  await expect(dialog.getByTestId('live-input-ble_action').locator('.live-raw')).toHaveText('true');
  await dialog.getByLabel('Show game test', { exact: true }).check();
  await page.screenshot({ path: 'evidence/live-input-monitor-browser.png' });
  await page.evaluate(() => (window as unknown as { loseLink: () => void }).loseLink());
  await expect(dialog.getByTestId('live-input-ble_x')).toHaveAttribute('data-active', 'false');
  await expect(dialog.getByTestId('live-input-ble_x')).toContainText('Disconnected');
});
