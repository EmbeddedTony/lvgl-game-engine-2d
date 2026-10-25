import { test, expect, type Page } from '@playwright/test';
import { pixelColors, pixelProject } from '../helpers/pixel-project';

async function aligned(page: Page) {
  return page.getByTestId('stage').evaluate((el) => {
    const b = el.getBoundingClientRect(),
      d = devicePixelRatio;
    return [b.left * d, b.top * d, (b.width * d) / 320, (b.height * d) / 240].every(
      (v) => Math.abs(v - Math.round(v)) < 1 / 32,
    );
  });
}

for (const ratio of [1, 1.25, 2])
  test.describe(`pixel viewport at ${ratio}× device scale`, () => {
    test.use({ deviceScaleFactor: ratio });
    test('whole physical pixels stay aligned and render exact sprite blocks and tile seams', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(
        (p) => localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p)),
        pixelProject(),
      );
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByLabel('Pixel perfect', { exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.getByLabel('Zoom', { exact: true }).selectOption(String(2 / ratio));
      await expect.poll(() => aligned(page)).toBe(true);
      await expect
        .poll(() =>
          page.getByTestId('scene-pixels').evaluate((c) => {
            const canvas = c as HTMLCanvasElement;
            return canvas
              .getContext('2d')!
              .getImageData(
                16 - parseFloat(canvas.style.left || '0'),
                16 - parseFloat(canvas.style.top || '0'),
                1,
                1,
              ).data[3];
          }),
        )
        .toBe(255);
      await expect
        .poll(() =>
          page.getByTestId('scene-pixels').evaluate((c) => {
            const canvas = c as HTMLCanvasElement;
            return canvas
              .getContext('2d')!
              .getImageData(
                49 - parseFloat(canvas.style.left || '0'),
                33 - parseFloat(canvas.style.top || '0'),
                1,
                1,
              ).data[3];
          }),
        )
        .toBe(255);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const box = (await page.getByTestId('stage').boundingBox())!;
      const png = await page.screenshot({
        path: `evidence/pixel-perfect-${ratio}.png`,
        scale: 'device',
      });
      expect(await page.getByTestId('stage').boundingBox()).toEqual(box);
      const mismatches = await page.evaluate(
        async ({ bytes, left, top, colors }) => {
          const bitmap = await createImageBitmap(
            new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
          );
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          let failures = 0;
          const samples: unknown[] = [];
          for (const item of [
            { x: 16, y: 16, width: 16, height: 16, artScale: 2 },
            { x: 49, y: 33, width: 16, height: 8, artScale: 1 },
          ]) {
            const pixels = ctx.getImageData(
              left + item.x * 2,
              top + item.y * 2,
              item.width * 2,
              item.height * 2,
            ).data;
            for (let y = 0; y < item.height * 2; y++)
              for (let x = 0; x < item.width * 2; x++) {
                const expected =
                  colors[
                    (Math.floor(x / (2 * item.artScale)) % 2) +
                      (Math.floor(y / (2 * item.artScale)) % 2) * 2
                  ];
                const offset = (y * item.width * 2 + x) * 4;
                if (expected.some((v, k) => pixels[offset + k] !== v)) {
                  failures++;
                  if (
                    samples.length < 8 &&
                    !samples.some(
                      (s: any) => s.actual.join() === [...pixels.slice(offset, offset + 4)].join(),
                    )
                  )
                    samples.push({
                      item: item.x,
                      x,
                      y,
                      actual: [...pixels.slice(offset, offset + 4)],
                      expected,
                    });
                }
              }
          }
          return { failures, samples };
        },
        {
          bytes: [...png],
          left: Math.round(box.x * ratio),
          top: Math.round(box.y * ratio),
          colors: pixelColors,
        },
      );
      expect(mismatches).toEqual({ failures: 0, samples: [] });
      await page.setViewportSize({ width: 1391, height: 967 });
      await expect.poll(() => aligned(page)).toBe(true);
      await page.getByRole('separator', { name: 'Resize inspector' }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => aligned(page)).toBe(true);
      await page.getByRole('button', { name: 'Game view', exact: true }).click();
      await expect.poll(() => aligned(page)).toBe(true);
      await page.getByLabel('Stop preview').click();
      expect(errors).toEqual([]);
    });
  });

test('sprite scales preserve aspect, custom sizes warn, and rendering preference saves and undoes', async ({
  page,
}) => {
  await page.addInitScript((p) => {
    if (!localStorage.getItem('lvgl-game-engine.project.v1'))
      localStorage.setItem('lvgl-game-engine.project.v1', JSON.stringify(p));
  }, pixelProject());
  await page.goto('/');
  await page.getByTestId('tree-art').click();
  await page.getByLabel('Sprite pixel scale', { exact: true }).selectOption('3');
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('24');
  await expect(page.getByLabel('Height', { exact: true })).toHaveValue('24');
  await page.getByLabel('Width', { exact: true }).fill('23');
  await expect(
    page.getByText('Uneven source pixels. Choose a whole scale to preserve the artwork.'),
  ).toBeVisible();
  await page.getByLabel('Sprite pixel scale', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('Height', { exact: true })).toHaveValue('8');
  await page.getByLabel('Pixel perfect', { exact: true }).click();
  await expect(page.getByLabel('Pixel perfect', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByLabel('Undo', { exact: true }).click();
  await expect(page.getByLabel('Pixel perfect', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Project settings', { exact: true }).click();
  await page.getByRole('checkbox', { name: /^Pixel perfect rendering/ }).uncheck();
  await expect(page.getByRole('checkbox', { name: /^Pixel perfect rendering/ })).not.toBeChecked();
  await page.getByLabel('Close dialog', { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('lvgl-game-engine.project.v1')!).pixelPerfect,
      ),
    )
    .toBe(false);
  await page.reload();
  await expect(page.getByLabel('Pixel perfect', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByLabel('Fit viewport', { exact: true }).click();
  const scale = Number(await page.getByTestId('stage').getAttribute('data-physical-scale'));
  expect(Math.abs(scale - Math.round(scale))).toBeGreaterThan(0.01);
});
