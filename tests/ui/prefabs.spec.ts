import { test, expect } from '@playwright/test';
import { createSceneDemo } from '../../src/scene-demo';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
    createSceneDemo(),
  );
  await page.goto('/');
});
test('hierarchy drag parents, unparents, reorders, rejects cycles/inherited rows, and supports Undo', async ({
  page,
}) => {
  const row = (id: string) => page.getByTestId(`tree-${id}`).locator('..');
  const drag = async (
    source: string,
    target: string,
    placement: 'inside' | 'before' | 'after' = 'inside',
  ) => {
    const from = page.getByTestId(`tree-${source}`),
      to = page.getByTestId(`tree-${target}`);
    await from.scrollIntoViewIfNeeded();
    const start = (await from.boundingBox())!;
    await page.mouse.move(start.x + 50, start.y + 10);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 12, { steps: 5 });
    await to.scrollIntoViewIfNeeded();
    const end = (await to.boundingBox())!;
    await page.mouse.move(
      end.x + 50,
      end.y + (placement === 'before' ? 2 : placement === 'after' ? 21 : 10),
      { steps: 20 },
    );
    await page.mouse.up();
  };
  const crystal = page.getByTestId('viewport-crystal_0/gem');
  const position = () =>
    crystal.evaluate((el) => [(el as HTMLElement).style.left, (el as HTMLElement).style.top]);
  const before = await position();
  await drag('crystal_0', 'hero');
  await expect(page.getByLabel('Node parent')).toHaveValue('hero');
  expect(await position()).toEqual(before);
  await expect(row('crystal_0')).toHaveAttribute('aria-level', '2');
  await expect(row('hero/player')).toHaveAttribute('draggable', 'false');
  await drag('hero', 'crystal_0');
  await page.getByTestId('tree-hero').click();
  await expect(page.getByLabel('Node parent')).toHaveValue('');
  const data = await page.evaluateHandle(() => new DataTransfer());
  await row('crystal_0').dispatchEvent('dragstart', { dataTransfer: data });
  const root = page.getByLabel('Scene root drop target');
  await expect(root).toBeVisible();
  await root.dispatchEvent('dragover', { dataTransfer: data });
  await root.dispatchEvent('drop', { dataTransfer: data });
  await page.getByTestId('tree-crystal_0').click();
  await expect(page.getByLabel('Node parent')).toHaveValue('');
  expect(await position()).toEqual(before);
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Node parent')).toHaveValue('hero');
  await drag('stone_1', 'stone_0', 'before');
  expect(
    await page
      .getByTestId('tree-stone_1')
      .locator('..')
      .evaluate((el) =>
        el.nextElementSibling?.querySelector('[data-testid]')?.getAttribute('data-testid'),
      ),
  ).toBe('tree-stone_0');
  await drag('stone_1', 'stone_0', 'after');
  expect(
    await page
      .getByTestId('tree-stone_0')
      .locator('..')
      .evaluate((el) =>
        el.nextElementSibling?.querySelector('[data-testid]')?.getAttribute('data-testid'),
      ),
  ).toBe('tree-stone_1');
});
test('prefab authoring, shared source editing, reserve pool and transient preview reuse work together', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('tree-stone_0').click();
  await page.getByRole('button', { name: 'Create prefab from branch', exact: true }).click();
  const source = await page.getByLabel('Instance source').inputValue();
  await expect(page.getByText('Prefab instance', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Project folders' })
    .getByRole('button', { name: /^Prefabs/ })
    .click();
  await page.getByRole('list', { name: 'Prefabs assets' }).getByRole('listitem').first().click();
  await page.getByLabel('Prefab pool capacity').fill('2');
  await page.getByRole('button', { name: 'Create spawn pool', exact: true }).click();
  // The UI stays responsive while recovery saves asynchronously.
  await expect(page.getByLabel('Object name')).toHaveValue(/pool \(2\)/);
  await page.getByRole('button', { name: 'Edit prefab', exact: true }).click();
  await expect(page.getByLabel('Active scene')).toHaveValue(source);
  await page.getByTestId('tree-stone_0').click();
  await page.getByLabel('Object name').fill('Shared stone');
  await page.getByRole('button', { name: 'Back to Forest clearing', exact: false }).click();
  await expect(page.getByTestId('tree-stone_0/stone_0')).toContainText('Shared stone');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('.prefab-preview summary').click();
  await expect(page.getByText('0 / 2 copies active', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Spawn copy', exact: true }).click();
  await page.getByRole('button', { name: 'Spawn copy', exact: true }).click();
  await expect(page.getByText('2 / 2 copies active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spawn copy', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Despawn last', exact: true }).click();
  await page.getByRole('button', { name: 'Spawn copy', exact: true }).click();
  await expect(page.getByText('2 / 2 copies active', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'evidence/prefab-preview.png', fullPage: true });
  await page.getByLabel('Stop preview').click();
  expect(errors).toEqual([]);
});
