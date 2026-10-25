import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { makeNode, parseProject, validate } from '../src/model';
import { generate } from '../src/exporter';
import {
  pixelPerfectEnabled,
  pixelZoom,
  renderPixel,
  spritePixelScale,
  viewportScale,
} from '../src/pixel-perfect';

test('integer physical-pixel fit works at normal, Retina and fractional OS scales without downsampling', () => {
  for (const ratio of [1, 1.25, 1.5, 2, 3]) {
    for (const available of [
      { width: 719, height: 537 },
      { width: 97, height: 63 },
    ]) {
      const scale = viewportScale(available, { width: 320, height: 240 }, ratio, true);
      assert.ok(Math.abs(scale * ratio - Math.round(scale * ratio)) < 1e-8);
      assert.ok(scale * ratio >= 1);
      if (scale * ratio > 1) {
        assert.ok(320 * scale <= available.width);
        assert.ok(240 * scale <= available.height);
      }
    }
  }
  assert.equal(pixelZoom(1.57, 2, true), 1.5);
  assert.equal(pixelZoom(1.57, 1, true), 1);
  assert.equal(
    viewportScale({ width: 719, height: 537 }, { width: 320, height: 240 }, 1, false),
    537 / 240,
  );
});

test('draw rounding matches C roundf after composing parents; does not quantize simulation values', () => {
  assert.deepEqual([-1.5, -0.5, -0.49, 0.49, 0.5, 1.5].map(renderPixel), [-2, -1, -0, 0, 1, 2]);
  const parent = 12.25,
    local = 3.25;
  assert.equal(renderPixel(parent + local), 16);
  assert.equal(parent + local, 15.5);
  assert.equal(spritePixelScale({ width: 8, height: 12 }, { width: 24, height: 36 }), 3);
  assert.equal(spritePixelScale({ width: 8, height: 12 }, { width: 12, height: 18 }), null);
  assert.equal(spritePixelScale({ width: 8, height: 12 }, { width: 16, height: 36 }), null);
  assert.equal(spritePixelScale({ width: 8, height: 12 }, { width: 4, height: 6 }), null);
});

test('pixel export bakes sprite variants; arbitrary sizes stay explicit and warn', () => {
  const p = createStarter();
  delete p.flow;
  const asset = {
    id: 'pixels',
    name: 'Pixels',
    width: 8,
    height: 8,
    pixels: Array.from({ length: 256 }, (_, i) => (i % 4 === 3 ? 255 : 80)),
  };
  p.sprites = [asset];
  p.scenes = [
    {
      ...p.scenes[0],
      music: '',
      nodes: [8, 16, 24, 12].map((size, i) =>
        makeNode('sprite', {
          id: `sprite_${i}`,
          asset: asset.id,
          width: size,
          height: size,
        }),
      ),
    },
  ];
  const { files, stats } = generate(p, {});
  assert.equal(
    (String(files['ui/generated/game_assets.c']).match(/const lv_image_dsc_t/g) ?? []).length,
    4,
  );
  assert.equal(stats.spriteRaw, (8 * 8 + 16 * 16 + 24 * 24 + 12 * 12) * 4);
  assert.match(String(files['ui/generated/game_data.h']), /GAME_PIXEL_PERFECT 1/);
  assert.equal(validate(p).filter((i) => i.message.includes('resamples')).length, 1);
  p.pixelPerfect = false;
  const off = generate(p, {});
  assert.equal(
    (String(off.files['ui/generated/game_assets.c']).match(/const lv_image_dsc_t/g) ?? []).length,
    4,
  );
  assert.match(String(off.files['ui/generated/game_data.h']), /GAME_PIXEL_PERFECT 0/);
  assert.equal(validate(p).filter((i) => i.message.includes('resamples')).length, 0);
});

test('legacy projects default to pixel perfect; explicit preference round-trips and malformed flags fail', () => {
  const p = createStarter();
  delete p.pixelPerfect;
  assert.equal(pixelPerfectEnabled(parseProject(JSON.stringify(p))), true);
  p.pixelPerfect = false;
  assert.equal(pixelPerfectEnabled(parseProject(JSON.stringify(p))), false);
  assert.throws(() => parseProject(JSON.stringify({ ...p, pixelPerfect: 'false' })), /Invalid/);
});
