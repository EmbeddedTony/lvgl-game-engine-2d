import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
test('standalone monitor drives actual C bindings, isolates monitor-only mode and rebuilds captured calibration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-live-monitor-')),
    profile = join(root, 'profile');
  await mkdir(profile);
  const p = JSON.parse(await readFile('examples/PhysicalControllers.lge.json', 'utf8'));
  p.code =
    p.code.replace('void game_on_update(', 'void old_update(') +
    `
void game_on_update(lge_engine_t *g,float dt,void *u){old_update(g,dt,u);static bool logged;lge_node_t *n=ui_find_node(UI_NODE_PLAYER);if(!logged && n && n->velocity_x>80){puts("MONITORED MOVEMENT IN C");logged=true;}}
`;
  await writeFile(
    join(profile, 'recovery.json'),
    JSON.stringify({ text: JSON.stringify(p), path: join(root, 'Inputs.lge.json'), dirty: false }),
  );
  const app = await electron.launch({
    timeout: 15000,
    executablePath: resolve(
      process.env.LGE_MONITOR_APP ??
        'release/live-input-monitor-update/mac-arm64/LVGL Game Engine 2D.app',
      'Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByLabel('Project settings', { exact: true }).click({ timeout: 10000 });
    await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
    await dialog.getByRole('tab', { name: 'Live monitor', exact: true }).click();
    expect(
      await page.evaluate(() => ({
        serial: !!(navigator as unknown as { serial?: unknown }).serial,
        ble: !!(navigator as unknown as { bluetooth?: unknown }).bluetooth,
      })),
    ).toEqual({ serial: true, ble: true });
    // Test chooser IPC against the packaged main process, without opening hardware.
    await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.session.emit(
        'select-serial-port',
        { preventDefault() {} },
        [{ portId: 'test-uart', displayName: 'Test UART' }],
        wc,
        (id: string) => {
          (globalThis as unknown as { selectedPort: string }).selectedPort = id;
        },
      );
    });
    await dialog.getByRole('button', { name: 'Test UART', exact: true }).click();
    expect(
      await app.evaluate(() => (globalThis as unknown as { selectedPort: string }).selectedPort),
    ).toBe('test-uart');
    await dialog.getByText('Simulate this channel', { exact: true }).click();
    await dialog.getByLabel('Simulated live raw value').fill('4095');
    await expect(dialog.getByTestId('live-input-adc_x').locator('.live-normalized')).toHaveText(
      '1.000',
    );
    await dialog.getByLabel('Show game test', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(dialog.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    const feedback = dialog.getByTestId('live-native-bindings');
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByLabel('Drive native game with monitored inputs').check();
    await expect(feedback).toHaveAttribute('data-x', '1');
    await expect(dialog.getByTestId('native-output')).toContainText('MONITORED MOVEMENT IN C');
    await dialog.getByLabel('Drive native game with monitored inputs').uncheck();
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByLabel('Simulated live raw value').fill('2000');
    await expect(dialog.getByTestId('live-input-adc_x').locator('.live-raw')).toHaveText('2000');
    await dialog.getByRole('button', { name: 'Set center from live value' }).click();
    await expect(dialog).toContainText('Input settings changed.');
    await dialog.getByRole('button', { name: 'Apply inputs & rebuild', exact: true }).click();
    await expect(dialog.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(dialog.locator('.native-input-stale')).toHaveCount(0);
    await dialog.getByLabel('Drive native game with monitored inputs').check();
    await expect(feedback).toContainText('2000 → 0.000');
    await dialog.getByLabel('Simulated live raw value').fill('4095');
    await expect(feedback).toHaveAttribute('data-x', '1');
    await dialog.locator('.live-monitor-values').evaluate((el) => {
      el.scrollTop = 0;
    });
    await dialog.locator('.live-game-test').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: 'evidence/live-input-monitor-packaged.png' });
    await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(feedback).toHaveAttribute('data-x', '0');
    await dialog.getByRole('button', { name: 'Stop game', exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
