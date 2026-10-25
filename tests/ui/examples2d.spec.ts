import { test, expect } from '@playwright/test';
import { createStarter } from '../../src/assets';
for (const [menu, title, speaker] of [
  ['Open Side Scroller - Amber Trail', 'AMBER TRAIL', 'PIP'],
  ['Open Adventure - Willowlight', 'WILLOWLIGHT', 'MIRA'],
]) {
  test(`${title} opens from Help with editable visible dialogue and a playable 2D scene`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
      createStarter(),
    );
    await page.goto('/');
    await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
    await page
      .getByRole('menu', { name: 'Help menu' })
      .getByRole('menuitem', { name: menu, exact: true })
      .click();
    await expect(page.getByTestId('viewport-dialogue_text')).toContainText(
      title === 'AMBER TRAIL' ? 'Space or Up' : 'Find three stones',
    );
    await expect(page.getByTestId('viewport-dialogue_speaker')).toContainText(speaker);
    await page.screenshot({
      path: `evidence/${title === 'AMBER TRAIL' ? 'amber-trail' : 'willowlight'}-editor.png`,
    });
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).name),
      )
      .toBe(
        title === 'AMBER TRAIL'
          ? 'Amber Trail - Side Scroller'
          : 'Willowlight - Top-down Adventure',
      );
    await page.getByTestId('tree-dialogue_text').click();
    await page.getByLabel('Object text', { exact: true }).fill('An editable dialogue textbox.');
    await expect(page.getByTestId('viewport-dialogue_text')).toContainText(
      'An editable dialogue textbox.',
    );
    await page.getByLabel('Undo', { exact: true }).click();
    await expect(page.getByTestId('viewport-dialogue_text')).toContainText(
      title === 'AMBER TRAIL' ? 'Space or Up' : 'Find three stones',
    );
    const initial = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!),
    );
    if (title === 'AMBER TRAIL') {
      await page.locator('.camera2d-controls > summary').click();
      await page.getByLabel('Editor camera X', { exact: true }).focus();
      await page.keyboard.press('End');
      await expect(page.getByTestId('stage')).toHaveAttribute('data-camera-x', '448');
      await expect(page.getByTestId('viewport-dialogue_text')).toHaveCSS('left', '18px');
      await page.locator('.camera2d-controls > summary').click();
    }
    await page.getByLabel('Play journey', { exact: true }).click();
    await expect(page.getByLabel('Stop preview', { exact: true })).toBeVisible();
    await expect(page.getByTestId('viewport-dialogue_speaker')).toContainText(speaker);
    await page.getByTestId('stage').focus();
    await page.keyboard.down('d');
    if (title === 'AMBER TRAIL')
      await expect
        .poll(async () => Number(await page.getByTestId('stage').getAttribute('data-camera-x')))
        .toBeGreaterThan(48);
    else
      await expect
        .poll(async () =>
          parseFloat(
            await page
              .getByTestId('viewport-player')
              .evaluate((el) => (el as HTMLElement).style.left),
          ),
        )
        .toBeGreaterThan(64);
    await page.keyboard.up('d');
    await page.screenshot({
      path: `evidence/${title === 'AMBER TRAIL' ? 'amber-trail' : 'willowlight'}-preview.png`,
    });
    await page.getByLabel('Stop preview', { exact: true }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!),
    );
    expect(saved.scenes[0].nodes.find((n: { id: string }) => n.id === 'player').x).toBe(
      initial.scenes[0].nodes.find((n: { id: string }) => n.id === 'player').x,
    );
    expect(errors).toEqual([]);
  });
}
