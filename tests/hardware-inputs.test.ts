import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addInputPreset, validInputs, inputRamBytes } from '../src/input/model';
import { controllerDraft, planController } from '../src/input/hardware/wizard';
import { hardwareSignature } from '../src/input/hardware/model';
import { hardwareFiles } from '../src/input/hardware/export';
import { InputLineDecoder, InputMonitorSession } from '../src/input/monitor/session';
import { parseProject, validate } from '../src/model';
const empty = { sources: [], channels: [] };
test('hardware wizard preserves IDs/calibration and other devices across updates and project round trips', () => {
  const base = addInputPreset(empty, 'ble'),
    d = controllerDraft(base),
    first = planController(base, d);
  assert.deepEqual(first.errors, []);
  assert(validInputs(first.config));
  const x = first.config.hardware!.pins[0].channel;
  first.config.channels.find((c) => c.id === x)!.center = 1923;
  const next = planController(first.config, controllerDraft(first.config)).config;
  assert.equal(next.channels.find((c) => c.id === x)!.center, 1923);
  assert.deepEqual(next.sources, first.config.sources);
  assert.deepEqual(
    next.channels.map((c) => c.id),
    first.config.channels.map((c) => c.id),
  );
  assert(addInputPreset(next, 'serial').hardware);
  const p = JSON.parse(readFileSync('examples/DKHardwareInputs.lge.json', 'utf8'));
  p.inputs = next;
  assert.deepEqual(parseProject(JSON.stringify(p)).inputs, next);
  assert.equal(validate(p).filter((i) => i.severity === 'error').length, 0);
  assert(inputRamBytes(next) > 1536);
});
test('reserved pins, duplicates, A4 solder routing, wrong types and malformed profiles fail closed', () => {
  const d = controllerDraft(empty);
  assert(planController(empty, { ...d, xPin: 'PA13' }).errors.length);
  assert(planController(empty, { ...d, yPin: d.xPin }).errors.length);
  assert(planController(empty, { ...d, xPin: 'PF13' }).errors.length);
  const a4 = planController(empty, { ...d, xPin: 'PF13', factoryA4Routing: true });
  assert.deepEqual(a4.errors, []);
  assert.match(
    hardwareFiles(a4.config)['ui/ports/hardware_inputs_config.c'],
    /\.adc=2,.adc_channel=ADC_CHANNEL_2/,
  );
  const c = planController(empty, d).config;
  for (const mutate of [
    (x: typeof c) => {
      x.hardware!.pins[0].pin = 'PB6';
    },
    (x: typeof c) => {
      x.channels[0].type = 'float';
    },
    (x: typeof c) => {
      x.hardware!.sampleHz = 100000 as 100;
    },
    (x: typeof c) => {
      x.hardware!.pins = [];
    },
  ]) {
    const copy = structuredClone(c);
    mutate(copy);
    assert(!validInputs(copy));
  }
});
test('exports provide actual driver config while calibration identity follows wiring, not JSON order', () => {
  const c = planController(empty, controllerDraft(empty)).config,
    sig = hardwareSignature(c.hardware!);
  const changed = structuredClone(c);
  changed.channels[0].center = 2024;
  assert.equal(hardwareSignature(changed.hardware!), sig);
  changed.hardware!.pins[0].pin = 'PC3';
  assert.notEqual(hardwareSignature(changed.hardware!), sig);
  const files = hardwareFiles(c);
  assert.match(files['ui/ports/hardware_inputs_config.h'], new RegExp(sig));
  assert.match(files['ui/ports/CONTROLLER_WIRING.md'], /CN11 pin 1/);
  const gpio = controllerDraft(c);
  gpio.joystick = false;
  const only = planController(c, gpio);
  assert.deepEqual(only.errors, []);
  assert.match(
    hardwareFiles(only.config)['ui/ports/hardware_inputs_config.h'],
    /LGE_DK_ADC_COUNT 0/,
  );
});
test('live serial identity is bounded, fragmented, source scoped and cleared on disconnect', () => {
  const c = planController(empty, controllerDraft(empty)).config,
    session = new InputMonitorSession(c),
    source = c.hardware!.source;
  const signature = hardwareSignature(c.hardware!);
  const text = new TextEncoder().encode('@lge_hardware=' + signature + '\n');
  new InputLineDecoder(session, source).feed(text, 100);
  session.tick(100);
  assert.equal(session.getSnapshot().hardwareProfiles[source], undefined);
  const decoder = new InputLineDecoder(session, source, true);
  for (const byte of text) decoder.feed(new Uint8Array([byte]), 200);
  session.tick(250);
  assert.deepEqual(session.getSnapshot().hardwareProfiles[source], { signature, ageMs: 50 });
  assert(session.hardwareReady(250));
  assert(!session.hardwareReady(1700));
  const rejected = session.getSnapshot().rejected;
  decoder.feed(new TextEncoder().encode('dk_touch_x=400\ndk_touch_y=240\ndk_button=false\n'), 251);
  session.tick(252);
  assert.equal(session.getSnapshot().rejected, rejected);
  session.disconnect(source);
  session.tick(300);
  assert.equal(session.getSnapshot().hardwareProfiles[source], undefined);
});
