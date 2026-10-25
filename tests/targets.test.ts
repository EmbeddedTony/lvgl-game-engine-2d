import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { makeNode, parseProject } from '../src/model';
import { generate } from '../src/exporter';
import { packSprite, resizeSprite } from '../src/compression';
import { families, familyById, catalogDate } from '../src/targets/catalog';
import { targetDefaults, validTarget } from '../src/targets/model';
import { analyzeTarget, imageBudget, measureWorkload } from '../src/targets/analyze';

test('catalog has broad sourced MCU coverage without conflating SIMD, NPUs and graphics hardware', () => {
  const mcu = families.filter((f) => f.kind === 'mcu' && f.id !== 'generic');
  assert.ok(mcu.length >= 60);
  assert.ok(new Set(mcu.map((f) => f.vendor)).size >= 13);
  assert.equal(new Set(families.map((f) => f.id)).size, families.length);
  for (const f of families) {
    assert.ok(f.reference && f.notes && f.core);
    assert.ok(f.source.startsWith('https://'));
    assert.ok(Number.isInteger(f.ramKiB) && Number.isInteger(f.nvmKiB));
  }
  assert.match(catalogDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(familyById('stm32n6')!.helium, true);
  assert.equal(familyById('stm32h7')!.helium, undefined);
  assert.equal(familyById('esp32-s3')!.helium, undefined);
  assert.match(familyById('esp32-s3')!.simd!, /not Arm Helium/);
  assert.equal(familyById('mcxn')!.graphics, undefined);
  assert.equal(familyById('stm32u5-graphics')!.ramKiB, 2560);
  assert.equal(familyById('stm32f4')!.dma2d, undefined);
  assert.ok(familyById('stm32f4-graphics')!.dma2d);
});
test('reference assumptions are opt-in, persist, and reject malformed types and unknown families', () => {
  const p = createStarter();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.equal(analyzeTarget(p, measureWorkload(p)).active, false);
  p.target = targetDefaults('stm32h7');
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  for (const bad of [
    { family: 'not_a_family' },
    { ramKiB: -1 },
    { fps: 0 },
    { bufferCount: '1' },
    { buffers: ['partial'] },
    { enabled: 'yes' },
    { effects: ['invented'] },
    { acceleration: ['helium', 'helium'] },
    { redrawPercent: 101 },
  ]) {
    assert.equal(validTarget({ ...p.target, ...bad }), false);
    assert.throws(
      () => parseProject(JSON.stringify({ ...p, target: { ...p.target, ...bad } })),
      /Invalid/,
    );
  }
});
test('RAM separates partial/full buffers, decoder expansion, internal use and external RAM', () => {
  const p = createStarter();
  p.target = targetDefaults('stm32f0');
  const work = measureWorkload(p);
  let r = analyzeTarget(p, work);
  assert.equal(r.frameBytes, 320 * 240 * 2);
  assert.equal(r.drawBytes, 320 * 40 * 2);
  assert.ok(r.alerts.some((a) => a.id === 'ram'));
  p.target.buffers = 'double';
  r = analyzeTarget(p, work);
  assert.equal(r.drawBytes, 2 * r.frameBytes);
  p.target.externalRamKiB = 8192;
  r = analyzeTarget(p, work);
  assert.equal(
    r.alerts.some((a) => a.id === 'ram'),
    false,
  );
  assert.ok(r.alerts.some((a) => a.id === 'internal-ram'));
  p.target.decode = 'scanline';
  assert.equal(analyzeTarget(p, work).decodeBytes, 0);
  p.target.buffers = 'partial';
  p.target.partialRows = 2048;
  p.target.bufferCount = 2;
  assert.equal(analyzeTarget(p, work).drawBytes, 2 * r.frameBytes);
  const withoutScanout = analyzeTarget(p, work).ramBytes;
  p.target.scanoutBuffers = 2;
  assert.equal(analyzeTarget(p, work).ramBytes - withoutScanout, 2 * r.frameBytes);
});

function audioProject() {
  const p = createStarter(),
    data = Buffer.alloc(160044);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24);
  data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(160000, 40);
  p.audio = [
    { ...p.audio[0], data: data.toString('base64'), sampleRate: 16000, channels: 1, duration: 5 },
  ];
  p.target = targetDefaults('generic');
  return p;
}
test('SD audio capacity never substitutes for RAM or compiled-image flash; shared external flash is counted once', () => {
  const p = audioProject(),
    work = measureWorkload(p),
    c = p.target!;
  c.ramKiB = 16;
  c.nvmKiB = 16;
  const initial = analyzeTarget(p, work);
  assert.equal(work.audioBytes, 160044);
  c.audioStorage = 'sd';
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'audio-storage'));
  c.sdMiB = 8;
  let r = analyzeTarget(p, work);
  assert.equal(
    r.alerts.some((a) => a.id === 'audio-storage'),
    false,
  );
  assert.equal(r.ramBytes, initial.ramBytes);
  assert.equal(r.graphicsBytes, initial.graphicsBytes);
  assert.equal(r.nvmBytes, initial.nvmBytes - work.audioBytes);
  assert.ok(r.alerts.some((a) => a.id === 'nvm'));
  c.nvmKiB = 128;
  c.externalFlashKiB = 256;
  c.reserveNvmKiB = 256;
  c.audioStorage = 'external-flash';
  r = analyzeTarget(p, work);
  assert.equal(
    r.alerts.some((a) => a.id === 'audio-storage'),
    false,
  );
  assert.ok(r.alerts.some((a) => a.id === 'shared-flash'));
});
test('effective display bandwidth warnings respond to redraw and cannot be removed by a GPU', () => {
  const p = createStarter();
  p.width = 800;
  p.height = 480;
  p.target = targetDefaults('stm32n6');
  p.target.displayMbps = 40;
  p.target.acceleration = ['graphics', 'helium', 'dma2d'];
  const work = measureWorkload(p);
  const r = analyzeTarget(p, work);
  assert.equal(r.transferMbps, (800 * 480 * 2 * 30 * 8) / 1e6);
  assert.ok(r.alerts.some((a) => a.id === 'display-link'));
  p.target.redrawPercent = 5;
  assert.equal(
    analyzeTarget(p, work).alerts.some((a) => a.id === 'display-link'),
    false,
  );
});
test('Helium and GPU recommendations require separately confirmed port integrations', () => {
  const p = createStarter();
  p.target = targetDefaults('stm32f4');
  p.target.effects = ['transforms', 'blur'];
  const work = measureWorkload(p);
  let r = analyzeTarget(p, work);
  assert.ok(r.alerts.some((a) => a.id === 'vector' && a.suggestion.includes('STM32N6')));
  p.target.acceleration = ['helium'];
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'unconfirmed-helium'));
  p.target = { ...targetDefaults('stm32n6'), effects: ['transforms', 'blur'] };
  r = analyzeTarget(p, work);
  assert.ok(r.alerts.some((a) => a.id === 'vector'));
  assert.ok(r.alerts.some((a) => a.id === 'transforms'));
  p.target.acceleration = ['helium'];
  r = analyzeTarget(p, work);
  assert.equal(
    r.alerts.some((a) => a.id === 'vector'),
    false,
  );
  assert.ok(r.alerts.some((a) => a.id === 'transforms'));
  p.target.acceleration.push('graphics');
  assert.equal(
    analyzeTarget(p, work).alerts.some((a) => a.id === 'transforms'),
    false,
  );
});
test('Linux, host and paused MCU guidance suppress routine advice without changing measurements', () => {
  const p = audioProject();
  p.width = 2048;
  p.height = 2048;
  const work = measureWorkload(p);
  for (const id of ['embedded-linux', 'host-pc']) {
    p.target = { ...targetDefaults(id), effects: ['blur', 'transforms'], displayMbps: 1 };
    const r = analyzeTarget(p, work);
    assert.equal(r.active, false);
    assert.deepEqual(r.alerts, []);
    assert.ok(r.frameBytes > 0 && r.work.audioBytes > 0);
  }
  p.target = { ...targetDefaults('stm32f0'), enabled: false };
  assert.deepEqual(analyzeTarget(p, work).alerts, []);
});
test('storage estimates are conservative, scenes use peak RAM, and export remains advisory', () => {
  const p = createStarter();
  for (const a of p.sprites)
    for (const [w, h] of [
      [1, 1],
      [5, 7],
      [32, 32],
      [64, 48],
    ])
      assert.ok(imageBudget(a, w, h) >= packSprite(resizeSprite(a, w, h)).data.length);
  const one = measureWorkload(p);
  p.scenes.push({ ...p.scenes[0], id: 'second', nodes: structuredClone(p.scenes[0].nodes) });
  const two = measureWorkload(p);
  assert.equal(two.largestDecode, one.largestDecode);
  assert.equal(two.visibleNodes, one.visibleNodes);
  assert.equal(two.imageBytes, one.imageBytes);
  assert.ok(two.tableBytes > one.tableBytes);
  p.target = targetDefaults('stm32f0');
  const { files, stats } = generate(p, {}),
    report = JSON.parse(String(files['ui/target-guidance.json']));
  assert.ok(report.active && report.alerts.some((a: any) => a.id === 'ram'));
  assert.ok(report.work.imageBytes >= stats.spritePacked);
  assert.deepEqual(report.exactExportPayload, stats);
  assert.ok(files['ui/ui.c']); // Budget warnings never prevent export.
  const original = p.sprites[0];
  const changed = { ...original, pixels: original.pixels.map((v, i) => (i % 4 === 3 ? 127 : v)) };
  p.sprites[0] = changed;
  p.scenes[0].nodes.push(makeNode('sprite', { asset: changed.id, width: 320, height: 240 }));
  assert.ok(measureWorkload(p).blendPixels > 0);
});

test('large maps and rounded shapes warn about CPU work independently of memory and DMA2D', () => {
  const p = createStarter();
  p.target = targetDefaults('stm32h7');
  p.target.acceleration = ['dma2d'];
  const w = measureWorkload(p);
  w.mapVisitedCells = 10000;
  w.roundedPixels = 200000;
  let r = analyzeTarget(p, w);
  assert.ok(r.alerts.some((a) => a.id === 'map-traversal'));
  assert.ok(r.alerts.some((a) => a.id === 'rounded-shapes'));
  p.target = targetDefaults('stm32n6');
  p.target.acceleration = ['graphics'];
  r = analyzeTarget(p, w);
  assert.equal(
    r.alerts.some((a) => a.id === 'rounded-shapes'),
    false,
  );
  assert.ok(r.alerts.some((a) => a.id === 'map-traversal'));
});

test('copy-only DMA and operation-limited pixel processors do not count as general GPUs', () => {
  const p = createStarter();
  p.target = targetDefaults('esp32-p4');
  p.target.effects = ['transforms'];
  p.target.acceleration = ['dma2d'];
  const w = measureWorkload(p);
  w.coverage = 2000000;
  w.roundedPixels = 200000;
  let r = analyzeTarget(p, w);
  assert.ok(r.alerts.some((a) => a.id === 'draw-load'));
  p.target.acceleration.push('graphics');
  r = analyzeTarget(p, w);
  assert.equal(
    r.alerts.some((a) => a.id === 'draw-load'),
    false,
  );
  assert.ok(r.alerts.some((a) => a.id === 'transforms'));
  assert.ok(r.alerts.some((a) => a.id === 'rounded-shapes'));
});
