import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hooks = `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *game,lge_event_t event,lge_node_t *node,void *user) {
 (void)game;(void)node;(void)user;
 if(event==LGE_EVENT_START){ ui_label_set_text(UI_NODE_TITLE,"NATIVE C RUNNING"); puts("AUTHORED C HOOK EXECUTED"); }
}
void game_on_update(lge_engine_t *game,float dt,void *user){(void)game;(void)dt;(void)user;}
`;
test('editor compiles and runs custom C with real frames, input, audio, pause/restart and cached rebuild', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'lge-native-ui-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await page.getByLabel('Native C code').fill(hooks);
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Native LVGL playtest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build & run', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    const panel = page.getByTestId('native-playtest'),
      canvas = page.getByTestId('native-game-canvas');
    await expect(panel).toHaveAttribute('data-phase', 'running');
    await expect.poll(() => canvas.getAttribute('data-frames')).not.toBe('0');
    await expect(page.getByTestId('native-output')).toContainText('AUTHORED C HOOK EXECUTED');
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const b = c.getContext('2d')!.getImageData(10, 10, 1, 1).data;
          return b[3];
        }),
      )
      .toBe(255);
    await canvas.focus();
    await canvas.press('w', { timeout: 1000 });
    await page.keyboard.down('w');
    await expect(page.getByTestId('native-runtime-state')).toHaveAttribute('data-score', '1');
    await page.keyboard.up('w');
    await expect
      .poll(() => page.getByTestId('native-runtime-state').getAttribute('data-audio-plays'))
      .not.toBe('0');
    await page.getByLabel('Pause native game', { exact: true }).click();
    await expect(page.getByLabel('Resume native game', { exact: true })).toBeVisible();
    await page.getByLabel('Resume native game', { exact: true }).click();
    await page.getByLabel('Restart native game', { exact: true }).click();
    await expect(page.getByTestId('native-runtime-state')).toHaveAttribute('data-score', '0');
    await page.screenshot({ path: 'evidence/native-playtest.png', fullPage: true });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await expect(panel).toHaveAttribute('data-phase', 'stopped');
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(panel).toHaveAttribute('data-phase', 'running');
    await expect(page.getByText('Cached build', { exact: true })).toBeVisible();
    await page.getByLabel('Close dialog', { exact: true }).click();
    await expect(page.getByLabel('Native C code')).toContainText('AUTHORED C HOOK EXECUTED');
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
test('compiler errors navigate to authored C and closing a playtest cancels its process', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'lge-native-error-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Explore The Little Grove' }).click();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await page.getByLabel('Native C code').fill('#include "ui.h"\nvoid game_on_event( {\n');
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'error');
    await expect(page.getByText('C compilation failed.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Open at line 2', exact: false }).first().click();
    await expect(page.getByLabel('Native C code')).toBeFocused();
    await page.getByLabel('Native C code').fill(hooks);
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await page.getByLabel('Close dialog', { exact: true }).click();
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
