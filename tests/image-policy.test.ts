import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createStarter } from '../src/assets';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { packSprite } from '../src/compression';
import { imagePackingPolicy } from '../src/rendering/image-policy';
import { generate } from '../src/exporter';
import { measureWorkload, imageBudget } from '../src/targets/analyze';

test('NeoChrom cooking bypasses indexed texture layouts while preserving every RGBA pixel and odd row stride', () => {
  const asset = {
    id: 'colors',
    name: '32 colors with alpha',
    width: 35,
    height: 40,
    pixels: Array.from({ length: 35 * 40 }, (_, i) => [
      (i % 32) * 7,
      (i % 32) * 5,
      (i % 32) * 3,
      i % 3 ? 255 : 100,
    ]).flat(),
  };
  assert.equal(packSprite(asset).format, 'I8');
  const direct = packSprite(asset, 'direct');
  assert.equal(direct.format, 'ARGB8888');
  assert.equal(direct.stride, 35 * 4);
  assert.deepEqual(
    direct.data,
    asset.pixels.flatMap((v, i, pixels) =>
      i % 4 === 0 ? [pixels[i + 2], pixels[i + 1], v, pixels[i + 3]] : [],
    ),
  );
  assert.equal(imageBudget(asset, 35, 40, undefined, 'direct'), direct.data.length);
});

test('opaque direct images retain all bytes and only proven opaque maps advertise coverage', () => {
  const a = { id: 'opaque', name: 'Opaque', width: 1, height: 1, pixels: [19, 35, 67, 255] };
  assert.deepEqual(packSprite(a, 'direct'), {
    format: 'XRGB8888',
    data: [67, 35, 19, 255],
    stride: 4,
    rawBytes: 4,
  });
  assert.equal(packSprite({ ...a, pixels: [19, 35, 67, 254] }, 'direct').format, 'ARGB8888');
  const p = createH7Adventure();
  const map = p.scenes[0].nodes.find((n) => n.tilemap)!.tilemap!;
  map.cells.fill(1);
  delete map.animations;
  const data = () => String(generate(p, {}).files['ui/generated/game_data.c']);
  assert.match(data(), /\.opaque=true/);
  map.cells[0] = 0;
  assert.doesNotMatch(data(), /\.opaque=true/);
  map.cells[0] = 1;
  p.sprites.push({ ...a, id: 'alpha', pixels: [19, 35, 67, 127] });
  map.animations = { 1: { frames: [map.tiles[0], 'alpha'], fps: 4 } };
  assert.doesNotMatch(data(), /\.opaque=true/);
  assert.equal(measureWorkload(p).terrainCacheBytes, 0);
});

test('H7 image descriptors, manifests, GPU configuration and guidance agree on direct-color payloads', () => {
  const p = createH7Adventure();
  const output = generate(p, {});
  const manifest = JSON.parse(String(output.files['ui/image-manifest.json']));
  assert.equal(imagePackingPolicy(p), 'direct');
  assert.equal(manifest.packing, 'direct');
  assert.equal(manifest.alignment, 16);
  assert.ok(manifest.images.length > 80);
  for (const image of manifest.images) {
    assert.ok(['ARGB8888', 'XRGB8888'].includes(image.format));
    assert.equal(image.stride, image.width * 4);
    assert.equal(image.bytes, image.stride * image.height);
  }
  const source = String(output.files['ui/generated/game_assets.c']);
  assert.doesNotMatch(source, /LV_COLOR_FORMAT_I[1248]\b/);
  assert.match(source, /LGE_IMAGE_ALIGN static const uint8_t/);
  assert.match(source, /__attribute__\(\(aligned\(16\)\)\)/);
  assert.equal(output.stats.spritePacked, output.stats.spriteRaw);
  assert.equal(
    manifest.images.reduce((n: number, image: { bytes: number }) => n + image.bytes, 0),
    output.stats.spritePacked,
  );
  assert.ok(measureWorkload(p).imageBytes >= output.stats.spritePacked);
  assert.match(String(output.files['ui/lv_conf_acceleration.h']), /LV_DRAW_BUF_ALIGN 16/);
  assert.match(String(output.files['ui/lv_conf_acceleration.h']), /LV_ATTRIBUTE_MEM_ALIGN_SIZE 16/);
});

test('software projects retain compact indexed export; NeoChrom cooking does not modify authored assets', () => {
  const p = createStarter();
  const before = JSON.stringify(p.sprites);
  const compact = generate(p, {});
  assert.equal(imagePackingPolicy(p), 'compact');
  assert.ok(compact.stats.spritePacked < compact.stats.spriteRaw);
  p.rendering = {
    backend: 'software',
    compositor: 'neochrom',
    helium: false,
    stm32Hal: 'stm32u5xx_hal.h',
  };
  const direct = generate(p, {});
  assert.equal(direct.stats.spritePacked, direct.stats.spriteRaw);
  assert.equal(JSON.stringify(p.sprites), before);
});

test('board builder rejects legacy/invalid GPU image contracts before any SDK or programmer operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-image-contract-'));
  try {
    const ui = join(root, 'ui');
    await mkdir(join(ui, 'ports'), { recursive: true });
    await writeFile(join(ui, 'ports/board.json'), JSON.stringify({ board: 'stm32h7s78-dk' }));
    for (const manifest of [
      null,
      { packing: 'compact', alignment: 16, images: [] },
      { packing: 'direct', alignment: 1, images: [] },
      {
        packing: 'direct',
        alignment: 16,
        images: [{ symbol: 'bad', format: 'I8', width: 32, height: 32, stride: 32, bytes: 2048 }],
      },
      {
        packing: 'direct',
        alignment: 16,
        images: [{ symbol: 'bad', format: 'ARGB8888', width: 3, height: 5, stride: 3, bytes: 15 }],
      },
    ]) {
      if (manifest) await writeFile(join(ui, 'image-manifest.json'), JSON.stringify(manifest));
      const result = spawnSync(
        'python3',
        [resolve('scripts/build-stm32h7s78.py'), '--ui', ui, '--out', join(root, 'out')],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Re-export|current editor/);
      assert.doesNotMatch(result.stdout, /Cloning|programming|Erasing/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('prepared board application checks option bytes without programming or unlocking flash', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import ast,re
from pathlib import Path
script=ast.parse(Path('scripts/build-stm32h7s78.py').read_text())
fn=next(n for n in script.body if isinstance(n,ast.FunctionDef) and n.name=='prepare_application_main')
scope={'re':re}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'build-stm32h7s78.py','exec'),scope)
source='void before(void) {}\\nstatic void MX_FLASH_Init(void)\\n{\\n if (1) { HAL_FLASH_Unlock(); HAL_FLASHEx_OBProgram(&old); }\\n}\\nvoid after(void) {}\\n'
prepared=scope['prepare_application_main'](source)
assert prepared.startswith('void before(void) {}') and prepared.endswith('void after(void) {}\\n')
assert 'HAL_FLASHEx_OBGetConfig(&configuration)' in prepared
for forbidden in ['HAL_FLASHEx_OBProgram(', 'HAL_FLASH_OB_Unlock(', 'HAL_FLASH_Unlock(']: assert forbidden not in prepared
try:
 scope['prepare_application_main'](source+'void unsafe(void) { HAL_FLASH_Unlock(); }')
except RuntimeError: pass
else: raise AssertionError('Unrelated write path was accepted')
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});
