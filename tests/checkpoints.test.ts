import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardFiles } from '../src/boards/export';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { createStarter } from '../src/assets';

test('H7 checkpoint C sources ship intact through the exporter and generic targets stay portable', () => {
  const files = boardFiles(createH7Adventure());
  for (const name of ['checkpoint_journal.h', 'checkpoint_journal.c', 'checkpoint_flash.h', 'checkpoint_flash.c'])
    assert.equal(files['ui/ports/' + name], readFileSync('ports/stm32h7s78/' + name, 'utf8'));
  assert.deepEqual(JSON.parse(files['ui/ports/board.json']).checkpoints, {
    backend: 'internal-flash-journal', address: '0x0800c000', bytes: 16384,
    protectedBootBytes: 49152, maxPacketBytes: 4096,
  });
  assert.deepEqual(boardFiles(createStarter()), {});
});
