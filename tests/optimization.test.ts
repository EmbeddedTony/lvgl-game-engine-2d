import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packTilemap, decodeRle } from '../src/compression';
import { createStarter } from '../src/assets';
import { makeNode } from '../src/model';
import { generate } from '../src/exporter';
import { measureWorkload, analyzeTarget } from '../src/targets/analyze';
import { targetDefaults } from '../src/targets/model';

test('indexed RLE preserves large streams and counts seek flash when selecting a codec', () => {
  const cells = Array.from({ length: 90000 }, (_, i) => Math.floor(i / 300) % 3);
  const packed = packTilemap(cells);
  assert.equal(packed.codec, 'rle16');
  assert.deepEqual(decodeRle(packed.data, cells.length), cells);
  assert.equal(packed.seek.length, 19);
  assert.ok(packed.seek.at(-1)! > 65535);
  for (let i = 0; i < packed.seek.length; i++) assert.equal(packed.seek[i], i * 16 * 300);
  assert.equal(packed.bytes, packed.data.length * 2 + packed.seek.length * 4);
  const marginal = packTilemap(
    Array.from({ length: 69 }, (_, i) => Math.floor(Math.min(i, 67) / 4) % 2),
  );
  assert.equal(marginal.codec, 'raw8'); // RLE alone wins, but its index would lose.
  assert.deepEqual(marginal.seek, []);
});
test('export/guidance share indexed payload bytes and visible tile-window costs', () => {
  const p = createStarter(),
    n = p.scenes[0].nodes.find((n) => n.tilemap)!;
  n.tilemap!.columns = 128;
  n.tilemap!.rows = 128;
  n.tilemap!.cells = Array.from({ length: 16384 }, (_, i) => Math.floor(i / 16) % 2);
  n.width = 128 * n.tilemap!.tileSize;
  n.height = 128 * n.tilemap!.tileSize;
  const { files, stats } = generate(p, {}),
    work = measureWorkload(p);
  assert.match(String(files['ui/generated/game_data.c']), /\.run_seek=map_0_seek/);
  assert.equal(stats.mapPacked, packTilemap(n.tilemap!.cells).bytes);
  assert.equal(work.mapBytes, stats.mapPacked);
  assert.ok(work.mapVisitedCells <= 21 * 16);
});
test('software-FPU and memory-bandwidth advice is MCU-only and does not block export', () => {
  const p = createStarter();
  p.target = targetDefaults('stm32f0');
  for (let i = 0; i < 10; i++) p.scenes[0].nodes.push(makeNode('area', { id: `area_${i}` }));
  const work = measureWorkload(p);
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'software-float'));
  work.coverage = 800 * 480 * 3;
  p.target = targetDefaults('stm32h7');
  p.target.externalRamKiB = 8192;
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'external-memory-traffic'));
  assert.ok(generate(p, {}).files['ui/ui.c']);
  p.target = targetDefaults('host-pc');
  assert.equal(analyzeTarget(p, work).alerts.length, 0);
});

test('export sizes node storage for all resolved scenes and reserved slots', () => {
  const p = createStarter(),
    work = measureWorkload(p),
    capacity = analyzeTarget(p, work).nodeCapacity;
  assert.ok(capacity >= work.maxNodes && capacity <= 128);
  assert.match(
    String(generate(p, {}).files['ui/engine/lge_config.h']),
    new RegExp(`#define LGE_MAX_NODES ${capacity}\\b`),
  );
  p.scenes.push({
    ...p.scenes[0],
    id: 'larger',
    nodes: [
      ...p.scenes[0].nodes,
      ...Array.from({ length: 18 }, (_, i) => makeNode('rect', { id: `extra_${i}` })),
    ],
  });
  const larger = analyzeTarget(p, measureWorkload(p));
  assert.ok(larger.nodeCapacity > capacity);
  assert.match(
    String(generate(p, {}).files['ui/engine/lge_config.h']),
    new RegExp(`#define LGE_MAX_NODES ${larger.nodeCapacity}\\b`),
  );
});
