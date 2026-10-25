import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRpgDemo } from '../../src/rpg/demo';
test('standalone RPG workspace builds canonical LVGL battles, saves and party menu input', async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'lge-rpg-')),
    p = createRpgDemo();
  p.code =
    p.code.replace('void game_on_update(', 'static void authored_update(') +
    `
#include <assert.h>
#include <stdio.h>
static unsigned phase;
void game_on_update(lge_engine_t*g,float dt,void*u){authored_update(g,dt,u);lge_rpg_t *r=ui_rpg();assert(r);
 if(!phase){assert(r->count==2&&r->party[0].hp==68);uint8_t save[512];size_t n=ui_save_size();assert(n<512&&ui_save_write(save,n));r->party[0].hp=1;assert(ui_save_read(save,n)&&r->party[0].hp==68);assert(ui_script_start("fight",NULL));phase=1;}
 else if(phase==1&&r->phase==LGE_BATTLE_COMMAND){unsigned target=4;while(target<8&&(!lge_party_member(r,target)||!lge_party_member(r,target)->hp))++target;assert(ui_battle_command(LGE_RPG_ATTACK,NULL,target));}
 else if(phase==1&&r->phase==LGE_BATTLE_VICTORY){assert(r->gold>20);puts("NATIVE RPG COMBAT XP GOLD SAVE PASSED");lge_battle_acknowledge(r);phase=2;}
 else if(phase==2&&ui_dialogue()){ui_dialogue_choose(0);}
 else if(phase==2&&!r->claimed&&!g->simulation_blocked){puts("NATIVE RPG RESULT BRANCH PASSED");phase=3;}
 else if(phase==3&&r->menu_open){puts("NATIVE RPG MENU INPUT PASSED");phase=4;}
}
`;
  const file = join(root, 'rpg.lge.json');
  await writeFile(file, JSON.stringify(p));
  const app = await electron.launch({
    executablePath: resolve(
      'release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS/LVGL Game Engine 2D',
    ),
    args: [],
    env: { ...process.env, LGE_PROFILE_DIR: join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('button', { name: /^Open a project/ }).click();
    await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
    await page.getByRole('button', { name: 'Party & battle', exact: true }).click();
    await expect(page.getByLabel('Party actor 1')).toHaveValue('hero');
    await page.getByRole('button', { name: 'Native LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Build & run', exact: true }).click();
    await expect(page.getByTestId('native-output')).toContainText(
      'NATIVE RPG RESULT BRANCH PASSED',
      { timeout: 20000 },
    );
    await page.getByTestId('native-game-canvas').focus();
    await page.keyboard.press('p');
    await expect(page.getByTestId('native-output')).toContainText('NATIVE RPG MENU INPUT PASSED');
    await page.screenshot({ path: 'evidence/packaged-rpg-native.png' });
    await page.getByRole('button', { name: 'Stop game', exact: true }).click();
    await page.getByLabel('Close dialog', { exact: true }).click();
    const folder = join(root, 'firmware');
    await mkdir(folder);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.getByRole('button', { name: 'Export to LVGL', exact: true }).click();
    await page.getByRole('button', { name: 'Export ui folder', exact: true }).click();
    await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    for (const f of ['lge_rpg.c', 'lge_rpg_ui.c', 'lge_rpg_save.c', 'lge_rpg_view.c'])
      expect(await readFile(join(folder, 'ui/engine', f), 'utf8')).toBe(
        await readFile(join('engine', f), 'utf8'),
      );
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
});
