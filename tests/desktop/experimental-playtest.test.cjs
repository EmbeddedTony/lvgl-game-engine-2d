const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { NativePlaytestService } = require('../../desktop/playtest/service.cjs');
test('experimental SDK reports its limitation before probing a platform compiler', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-experimental-sdk-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const reason = 'Native LVGL is unavailable in this experimental platform build.';
  await fs.writeFile(path.join(root, 'sdk.json'), JSON.stringify({ available: false, reason }));
  const service = new NativePlaytestService({
    sdkRoot: root,
    cacheRoot: path.join(root, 'cache'),
    emit() {},
    compiler: path.join(root, 'no-compiler'),
  });
  assert.deepEqual(await service.capabilities(), { available: false, reason });
});
