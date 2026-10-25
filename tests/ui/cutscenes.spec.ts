import { test, expect } from '@playwright/test';
import { createGameplayDemo } from '../../src/gameplay/demo';
test('cutscene maker exposes staging, camera, completion and safe playback controls', async ({
  page,
}) => {
  const p = createGameplayDemo();
  p.scenes[0].camera2d = { worldWidth: 640, worldHeight: 480, follow: 'player', axis: 'both' };
  p.gameplay!.scripts.push({
    id: 'arrival',
    name: 'Meet the traveller',
    folder: 'Chapter I',
    kind: 'cutscene',
    blocking: true,
    skipTo: 'complete',
    actions: [
      { id: 'camera', type: 'camera', mode: 'pan', x: 100, y: 0, ms: 5000 },
      { id: 'actor', type: 'move', node: 'player', x: 100, y: 80, ms: 1200 },
      { id: 'line', type: 'say', speaker: 'Mira', text: 'You came back.', choices: [] },
      { id: 'complete', type: 'state', key: 'quest', operation: 'set', value: 1 },
      { id: 'end', type: 'end' },
    ],
  });
  p.scenes[0].nodes.find((n) => n.id === 'scout')!.events = [
    { id: 'talk', trigger: 'interact', script: 'arrival' },
  ];
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    p,
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Cutscene maker', exact: true }).click();
  await expect(page.getByLabel('Script name')).toHaveValue('Meet the traveller');
  await expect(page.getByRole('heading', { name: 'Direct the scene' })).toBeVisible();
  await expect(page.getByLabel('Camera cue')).toHaveValue('pan');
  await expect(page.getByLabel('Cutscene actor')).toHaveValue('player');
  await page.getByLabel('Cutscene ms').first().fill('4000');
  await expect(page.getByText('5.2 seconds of timed beats + player-paced dialogue')).toBeVisible();
  await page.screenshot({ path: 'evidence/willowlight-cutscene-maker.png', fullPage: true });
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
  await page.getByTestId('stage').focus();
  await page.keyboard.press('e');
  await expect(page.getByTestId('viewport-story_skip')).toBeVisible();
  await page.getByTestId('viewport-story_skip').click();
  await expect(page.getByTestId('viewport-story_skip')).toHaveCount(0);
  await page.locator('.session-monitor > summary').click();
  await expect(page.getByTestId('state-quest')).toHaveText('1');
  await page.getByLabel('Stop preview', { exact: true }).click();
  expect(errors).toEqual([]);
});
