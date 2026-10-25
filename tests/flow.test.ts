import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { createFlowDemo } from '../src/flow-demo';
import { parseProject, validate } from '../src/model';
import { currentStep, flowEntry, getFlow, sequenceNext, sceneReferences } from '../src/flow';
import { generate } from '../src/exporter';
import { uiIds } from '../src/ui-api';

test('legacy projects keep their entry and scene names/folders are not runtime identity', () => {
  const old = createStarter();
  assert.deepEqual(flowEntry(old), { scene: old.scenes[0].id, cursor: null });
  const p = createFlowDemo();
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
  const initial = flowEntry(p);
  assert.equal(initial.scene, 'scene_title');
  p.scenes.reverse();
  p.scenes.forEach((s) => (s.name = 'Same name'));
  p.flow!.folders[0].name = 'Renamed folder';
  assert.deepEqual(flowEntry(p), initial);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});
test('sequences reuse scenes, stable steps survive reorder, and hold/loop/end destinations are explicit', () => {
  const p = createFlowDemo(),
    seq = getFlow(p).sequences[0];
  let loc = flowEntry(p);
  assert.equal(currentStep(p, loc.cursor)?.advance, 'click');
  loc = sequenceNext(p, loc.cursor)!;
  assert.equal(loc.scene, 'grove');
  const cursor = loc.cursor!;
  seq.steps.reverse();
  assert.equal(currentStep(p, cursor)?.scene, 'grove');
  seq.steps.reverse();
  loc = sequenceNext(p, cursor)!;
  assert.equal(loc.scene, 'scene_results');
  assert.equal(sequenceNext(p, loc.cursor)?.scene, 'scene_title');
  seq.end = 'hold';
  assert.deepEqual(sequenceNext(p, loc.cursor), {
    scene: 'scene_results',
    cursor: null,
    reload: false,
  });
  seq.end = 'scene';
  seq.endScene = 'grove';
  assert.deepEqual(sequenceNext(p, loc.cursor), {
    scene: 'grove',
    cursor: null,
    reload: true,
  });
  assert.equal(sequenceNext(p, null), null);
  assert.deepEqual(sceneReferences(p, 'grove'), ['Main journey', 'Main journey ending']);
});
test('import rejects dangling flow references, invalid triggers, duplicate IDs and oversized tables', () => {
  for (const mutate of [
    (p: any) => (p.flow.entry.id = 'missing'),
    (p: any) => (p.scenes[0].folder = 'missing'),
    (p: any) => (p.flow.sequences[0].steps[0].scene = 'missing'),
    (p: any) => (p.flow.sequences[0].steps[0].button = 'title_heading'),
    (p: any) => (p.flow.sequences[0].steps[0].advance = 'timer'),
    (p: any) => p.flow.sequences[0].steps.push(p.flow.sequences[0].steps[0]),
    (p: any) =>
      (p.flow.sequences[0].steps = Array.from({ length: 65 }, (_, i) => ({
        ...p.flow.sequences[0].steps[0],
        id: 'step_' + i,
      }))),
    (p: any) => {
      p.flow.sequences[0].end = 'scene';
      p.flow.sequences[0].endScene = 'missing';
    },
  ]) {
    const p = createFlowDemo();
    mutate(p);
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
  const p = createFlowDemo();
  p.flow!.sequences[0].steps = [];
  assert.doesNotThrow(() => parseProject(JSON.stringify(p)));
  assert.ok(validate(p).some((i) => i.severity === 'error'));
});
test('export flow is immutable C data, independent of folders/names, with stable C API IDs', () => {
  const p = createFlowDemo(),
    files = generate(p, {}).files;
  assert.match(files['ui/ui_ids.h'] as string, /#define UI_SEQUENCE_JOURNEY "journey"/);
  assert.match(files['ui/ui_ids.h'] as string, /#define UI_STEP_TITLE "step_title"/);
  assert.match(files['ui/generated/game_flow.c'] as string, /LGE_FLOW_CLICK/);
  assert.match(
    files['ui/generated/game_flow.h'] as string,
    /#define GAME_ENTRY_SEQUENCE "journey"/,
  );
  const source = files['ui/generated/game_flow.c'];
  p.scenes.forEach((s) => {
    s.name = 'Renamed';
    delete s.folder;
  });
  p.flow!.folders = [];
  assert.equal(generate(p, {}).files['ui/generated/game_flow.c'], source);
});
test('C constant collision naming stays deterministic after scene/step reorder', () => {
  const p = createFlowDemo();
  p.flow!.sequences[0].steps.push({ id: 'title', scene: 'scene_title', advance: 'manual' });
  p.scenes.push({ ...structuredClone(p.scenes[0]), id: 'Scene_title' });
  const ids = uiIds(p);
  p.scenes.reverse();
  p.flow!.sequences[0].steps.reverse();
  assert.equal(uiIds(p), ids);
});
