import { test, expect } from '@playwright/test';
import { createGameplayDemo } from '../../src/gameplay/demo';
test('Gameplay tools author state/scripts/frames, preserve Undo and play real branching dialogue without touching source', async ({
  page,
}) => {
  const p = createGameplayDemo(),
    errors: string[] = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log(e.stack);
  });
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    p,
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gameplay', exact: true })).toBeVisible();
  await page.getByLabel('Script name').fill('Mira’s edited request');
  await expect(page.getByLabel('Script name')).toHaveValue('Mira’s edited request');
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Script name')).toHaveValue('Mira’s request');
  await page.getByRole('button', { name: 'State & items', exact: true }).click();
  await expect(page.getByLabel('State name')).toHaveCount(6);
  await page.getByRole('button', { name: '+ State field', exact: true }).click();
  await expect(page.getByLabel('State name')).toHaveCount(7);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('State name')).toHaveCount(6);
  await page.getByRole('button', { name: 'Sprite animation', exact: true }).click();
  await expect(page.getByLabel('Animation frame 1')).toHaveCount(2);
  await page.screenshot({ path: 'evidence/gameplay-animation-editor.png' });
  await page.getByRole('button', { name: 'Event scripts', exact: true }).click();
  await page.screenshot({ path: 'evidence/gameplay-script-editor.png' });
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByTestId('tree-scout').click();
  await expect(page.getByLabel('Event trigger')).toHaveValue('interact');
  await expect(page.getByLabel('Event script')).toHaveValue('talk');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
  await page.getByTestId('stage').focus();
  await page.keyboard.press('e');
  await expect(page.getByTestId('viewport-story_text')).toContainText('Will you help');
  await expect(page.getByTestId('viewport-story_choice_0')).toContainText('I will help');
  const x = await page
    .getByTestId('viewport-player')
    .evaluate((el) => (el as HTMLElement).style.left);
  await page.keyboard.down('d');
  await page.waitForTimeout(150);
  await page.keyboard.up('d');
  await expect(page.getByTestId('viewport-player')).toHaveCSS('left', x);
  await page.getByTestId('viewport-story_continue').click();
  await expect(page.getByTestId('viewport-story_text')).toContainText('chest');
  await page.screenshot({ path: 'evidence/gameplay-dialogue-preview.png' });
  await expect(page.getByTestId('viewport-story_continue')).toContainText('Close');
  await page.getByTestId('viewport-story_continue').click();
  await expect(page.getByTestId('viewport-story_text')).toHaveCount(0);
  await page.locator('.session-monitor > summary').click();
  await expect(page.getByTestId('state-quest')).toHaveText('1');
  await page.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
  await page.locator('.session-monitor > summary').click();
  await page.getByLabel('Stop preview', { exact: true }).click();
  await expect(page.getByTestId('viewport-story_text')).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!),
  );
  expect(saved.gameplay.state[0].initial).toBe(0);
  expect(saved.scenes[0].nodes.find((n: { id: string }) => n.id === 'player').x).toBe(32);
  expect(errors).toEqual([]);
});
