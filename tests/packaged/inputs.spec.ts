import { test, expect, _electron as electron } from '@playwright/test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
test('standalone typed input editor, bundled CLI and real C controller simulation work without a server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-inputs-'));
  const bundle = resolve(
    process.env.LGE_INPUT_APP ?? 'release/physical-inputs-update/mac-arm64/LVGL Game Engine 2D.app',
    'Contents/MacOS',
  );
  const profile = join(root, 'profile');
  await mkdir(profile);
  const project = JSON.parse(await readFile('examples/PhysicalControllers.lge.json', 'utf8'));
  project.code = `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {
 (void)g;(void)n;(void)u;
 if(e==LGE_EVENT_START) {ui_input_set_int(UI_CHANNEL_ADC_X,4095);ui_input_set_float(UI_CHANNEL_TEMPERATURE,23.5f);ui_input_set_bool(UI_CHANNEL_ADC_ACTION,true);ui_input_set_bool(UI_CHANNEL_ADC_ACTION,false);}
}
void game_on_update(lge_engine_t *g,float dt,void *u) {
 (void)dt;(void)u;static bool logged;
 float value=0;lge_node_t *p=ui_find_node(UI_NODE_PLAYER);
 if(!logged && ui_input_read_float(UI_CHANNEL_TEMPERATURE,&value) && value==23.5f && p && p->velocity_x>80 && (lge_input_pressed(g)&UI_INPUT_ACTION)) {puts("TYPED PHYSICAL INPUTS IN NATIVE C");logged=true;}
}
`;
  const file = join(root, 'Inputs.lge.json');
  await writeFile(file, JSON.stringify(project));
  await writeFile(
    join(profile, 'recovery.json'),
    JSON.stringify({ text: JSON.stringify(project), path: file, dirty: false }),
  );
  const env = { ...process.env, LGE_PROFILE_DIR: profile, PATH: '/usr/bin:/bin' };
  const cli = async (args: string[]) =>
    JSON.parse(
      (
        await execute(join(bundle, 'lge'), args, {
          env,
          timeout: 40000,
          maxBuffer: 4 * 1024 * 1024,
        })
      ).stdout,
    );
  expect((await cli(['commands', '--query', 'input.'])).data.commands.length).toBe(3);
  expect((await cli(['input', 'list', '--project-path', file])).data.channels).toHaveLength(10);
  const app = await electron.launch({
    executablePath: join(bundle, 'LVGL Game Engine 2D'),
    args: [],
    env,
  });
  try {
    const page = await app.firstWindow();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    await page.getByLabel('Project settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Inputs & controllers…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inputs & controllers' });
    await expect(dialog.getByRole('button', { name: /Temperature/ })).toBeVisible();
    await dialog.getByRole('button', { name: /Temperature/ }).click();
    await expect(dialog.getByLabel('Value type')).toHaveValue('float');
    await page.screenshot({ path: 'evidence/physical-inputs-packaged.png' });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-playtest')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('native-output')).toContainText(
      'TYPED PHYSICAL INPUTS IN NATIVE C',
    );
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
