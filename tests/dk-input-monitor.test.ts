import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDkMonitorPreset, canAddDkMonitor, validInputs } from '../src/input/model';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { generate } from '../src/exporter';
import { parseArguments } from '../src/cli/arguments';

test('DK preset matches firmware wire IDs, releases touch axes and avoids duplicate wire IDs', () => {
  const inputs = addDkMonitorPreset({ sources: [], channels: [] });
  assert(validInputs(inputs));
  assert.deepEqual(
    inputs.channels.map((c) => [c.id, c.type, c.binding]),
    [
      ['dk_touch_x', 'int', 'moveX'],
      ['dk_touch_y', 'int', 'moveY'],
      ['dk_touch_down', 'bool', 'none'],
      ['dk_button', 'bool', 'action'],
      ['dk_uptime', 'float', 'none'],
    ],
  );
  assert(!canAddDkMonitor(inputs));
  assert.equal(addDkMonitorPreset(inputs), inputs);
  const p = createH7Adventure();
  p.inputs = inputs;
  const files = generate(p, {}).files;
  assert.match(String(files['ui/ports/input_monitor.c']), /USART_CR1_TXEIE_TXFNFIE/);
  assert.match(String(files['ui/ports/INPUT_MONITOR.md']), /115200/);
  assert.match(String(files['ui/generated/game_inputs.h']), /#define GAME_INPUT_COUNT 5/);
  assert.equal(
    parseArguments(['build', '--input-monitor', '--output', 'firmware']).params.inputMonitor,
    true,
  );
});
