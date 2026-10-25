import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { parseProject } from '../src/model';
import { generate } from '../src/exporter';
import {
  addInputPreset,
  makeInputChannel,
  previewInput,
  validInputs,
  inputRamBytes,
} from '../src/input/model';
import { applyCommands, queryProject } from '../src/automation/project-commands';
import { measureWorkload } from '../src/targets/analyze';
test('input presets round-trip, preserve stable IDs and expose types in a clean export', () => {
  const p = createStarter();
  p.inputs = addInputPreset({ sources: [], channels: [] }, 'ble');
  p.inputs = addInputPreset(p.inputs, 'adc');
  p.inputs.channels.push(makeInputChannel('temperature', 'adc', 'float'));
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  const files = generate(p, {}).files;
  assert.match(files['ui/ui_inputs.h'] as string, /UI_CHANNEL_BLE_X = 0/);
  assert.match(files['ui/generated/game_inputs.c'] as string, /\.type=LGE_VALUE_FLOAT/);
  assert.match(files['ui/engine/lge_config.h'] as string, /#define LGE_INPUT_MAX_CHANNELS 7/);
  assert.match(files['ui/CMakeLists.txt'] as string, /engine\/lge_input_codec.c/);
  assert.match(files['ui/INPUTS.md'] as string, /input_lock/);
  p.inputs.channels[0].name = 'My renamed stick';
  assert.match(generate(p, {}).files['ui/ui_inputs.h'] as string, /UI_CHANNEL_BLE_X = 0/);
  const legacy = generate(createStarter(), {}).files;
  assert.match(legacy['ui/generated/game_inputs.h'] as string, /#define GAME_INPUT_COUNT 0/);
  assert.equal(inputRamBytes(), 0);
  assert.equal(measureWorkload(p).inputRamBytes, inputRamBytes(p.inputs));
});
test('rejects unsafe calibration, ambiguous identifiers and mismatched binary types', () => {
  const config = addInputPreset({ sources: [], channels: [] }, 'ble');
  for (const change of [
    { center: 5000 },
    { min: 4095 },
    { deadzone: 1 },
    { timeoutMs: -1 },
    { timeoutMs: 1.5 },
    { pressThreshold: 0.3 },
    { type: 'float', max: Infinity },
    { type: 'bool' },
    { wire: { encoding: 'f32le', offset: 0, bit: 0 } },
    { wire: { encoding: 'u16le', offset: 63, bit: 0 } },
    { name: '' },
    { source: 'missing' },
  ]) {
    const invalid = structuredClone(config);
    Object.assign(invalid.channels[0], change);
    assert.equal(validInputs(invalid), false, JSON.stringify(change));
    assert.throws(
      () => parseProject(JSON.stringify({ ...createStarter(), inputs: invalid })),
      /Invalid/,
    );
  }
  const duplicate = structuredClone(config);
  duplicate.channels.push({ ...duplicate.channels[0], id: 'BLE_X' });
  assert.equal(validInputs(duplicate), false);
  assert.equal(validInputs({ sources: [null], channels: [] }), false);
  assert.equal(validInputs({ sources: [], channels: [null] }), false);
});
test('calibration is piecewise around center, inverted, unipolar and noise resistant', () => {
  const c = makeInputChannel('x', 'adc');
  assert.equal(previewInput(c, 2048), 0);
  assert.equal(previewInput(c, 2100), 0);
  assert.equal(previewInput(c, 4095), 1);
  assert.equal(previewInput(c, 0), -1);
  c.invert = true;
  assert.equal(previewInput(c, 4095), -1);
  c.invert = false;
  c.center = 0;
  c.deadzone = 0;
  assert.equal(previewInput(c, 0), 0);
  assert.equal(previewInput(c, 4095), 1);
});
test('agent commands configure inputs atomically and discover them', () => {
  const p = createStarter();
  const result = applyCommands(p, [{ command: 'input.preset', params: { kind: 'serial' } }]);
  assert.equal(p.inputs, undefined);
  assert.deepEqual(queryProject(result.project, 'input.list', {}), result.project.inputs);
  const second = applyCommands(result.project, [
    { command: 'input.preset', params: { kind: 'serial' } },
  ]);
  assert.equal(second.project.inputs?.sources[1].id, 'serial_2');
  assert.throws(
    () =>
      applyCommands(p, [
        { command: 'input.configure', params: { config: { sources: [], channels: [{}] } } },
      ]),
    /Invalid/,
  );
});
