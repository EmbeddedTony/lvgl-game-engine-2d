const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

test('ST-LINK ownership rejects a second operation and release cannot unlock a later owner', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-lock-test-'));
  // Exercise the real filesystem lock in an isolated temp root, so unit tests
  // never contend with a user who is debugging/flashing an actual board.
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../../desktop/board/probe-lock.cjs'), 'utf8'), {
    module,
    process,
    require: (name) => (name === 'node:os' ? { tmpdir: () => root } : require(name)),
  });
  const { acquireProbe } = module.exports;
  try {
    const first = await acquireProbe();
    try {
      await assert.rejects(acquireProbe(), /busy/);
    } finally {
      await first();
    }
    const second = await acquireProbe();
    try {
      await first();
      await assert.rejects(acquireProbe(), /busy/);
    } finally {
      await second();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
