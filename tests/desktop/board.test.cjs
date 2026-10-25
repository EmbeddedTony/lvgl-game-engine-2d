const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm, mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { probes, metrics } = require('../../desktop/board/protocol.cjs');
const { BoardService } = require('../../desktop/board/service.cjs');
test('probe parser excludes inaccessible USB probes and retains explicit serial selection', () => {
  assert.deepEqual(probes('ST-LINK SN : \n Board Name : \n'), []);
  assert.deepEqual(
    probes(
      'ST-LINK SN : 1234ABCD5678\n Board Name : STM32H7S78-DK\nST-LINK SN : ABCD12345678\n Board Name : Other',
    ),
    [
      { serial: '1234ABCD5678', board: 'STM32H7S78-DK' },
      { serial: 'ABCD12345678', board: 'Other' },
    ],
  );
});
test('live metrics accepts only versioned complete even-sequence snapshots', () => {
  const words = [0x4c47454d, 1, 2, 1000, 30, 30000, 6000, 1000, 450, 1, 200000, 2];
  const text = (a) => '0x2406E800 : ' + a.map((n) => n.toString(16).padStart(8, '0')).join(' ');
  assert.equal(metrics(text(words)).fps, 30);
  assert.equal(metrics(text(words)).gpuIrqs, 450);
  const torn = [...words];
  torn[11] = 4;
  assert.equal(metrics(text(torn)), null);
  torn[11] = 2;
  torn[2] = 3;
  assert.equal(metrics(text(torn)), null);
});
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'lge-board-'));
  try {
    await mkdir(join(root, 'build'));
    const hashes = {};
    for (const name of ['boot.bin', 'appli.bin']) {
      const b = Buffer.from(name);
      await writeFile(join(root, 'build', name), b);
      hashes[name] = createHash('sha256').update(b).digest('hex');
    }
    const calls = [],
      events = [];
    const service = new BoardService({
      root,
      acquire: async () => async () => {},
      script: '/build.py',
      sdkCache: '/sdk',
      emit: (e) => events.push(e),
      run: async () => ({ stdout: 'ST-LINK SN : 1234ABCD5678\nBoard Name : STM32H7S78-DK\n' }),
    });
    service.capabilities = async () => ({
      tools: { programmer: '/programmer', loader: '/loader' },
      config: {},
    });
    service.command = async (file, args) => {
      calls.push(args);
      return 'Device ID : 0x485\n';
    };
    service.startMonitor = async () => {
      calls.push(['monitor']);
    };
    service.build = { id: 'build1', out: root, hashes, report: { telemetryAddress: '0x2406e800' } };
    await fn({ service, root, calls, events });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('flash verifies the selected H7RS, external application and optional boot before resetting; never mass erases', () =>
  fixture(async ({ service, calls }) => {
    await service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: true });
    await service.task;
    assert.equal(service.phase, 'flashed');
    assert.equal(calls.length, 5);
    assert.ok(calls[1].includes('0x70000000'));
    assert.ok(calls[1].includes('-el'));
    assert.ok(calls[1].includes('-v'));
    assert.ok(calls[2].includes('0x08000000'));
    assert.ok(calls[3].includes('-hardRst'));
    for (const c of calls) {
      assert.ok(!c.includes('-e'));
      assert.ok(!c.includes('-ob'));
      assert.ok(!c.includes('-rdu'));
    }
  }));
test('wrong MCU blocks all writes and reset', () =>
  fixture(async ({ service, calls }) => {
    service.command = async (_f, args) => {
      calls.push(args);
      return 'Device ID : 0x450';
    };
    await service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: true });
    await service.task;
    assert.equal(service.phase, 'error');
    assert.equal(calls.length, 1);
  }));
test('large campaigns get enough time for external programming and verification', () =>
  fixture(async ({ service, root }) => {
    const bytes = Buffer.alloc(9 * 1024 * 1024, 0x5a);
    await writeFile(join(root, 'build/appli.bin'), bytes);
    service.build.hashes['appli.bin'] = createHash('sha256').update(bytes).digest('hex');
    const deadlines = [];
    service.command = async (_file, args, _config, timeout) => {
      if (args.includes('-w')) deadlines.push(timeout);
      return 'Device ID : 0x485';
    };
    await service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false });
    await service.task;
    assert.equal(service.phase, 'flashed');
    assert.deepEqual(deadlines, [348000]);
  }));
test('application-only flash preserves the installed bootloader and avoids erase/option-byte operations', () =>
  fixture(async ({ service, calls }) => {
    await service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false });
    await service.task;
    assert.equal(service.phase, 'flashed');
    const writes = calls.filter((args) => args.includes('-w'));
    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes('0x70000000'));
    assert.ok(writes[0].includes('-v'));
    for (const args of calls) {
      assert.ok(!args.includes('0x08000000'));
      assert.ok(!args.includes('-e') && !args.includes('-ob') && !args.includes('-rdu'));
    }
  }));

test('hardware wizard firmware refuses bootloader replacement before touching the probe', () =>
  fixture(async ({ service, calls }) => {
    service.build.report.hardwareInputs = { source: 'controller', sampleHz: 100 };
    await assert.rejects(
      service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: true }),
      /preserve.*bootloader/,
    );
    assert.equal(calls.length, 0);
    await service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false });
    await service.task;
    assert.equal(calls.filter((a) => a.includes('-w')).length, 1);
    assert(!calls.some((a) => a.includes('0x08000000')));
  }));
test('stale, modified firmware and missing selected probe refuse to flash', () =>
  fixture(async ({ service, root, calls }) => {
    await assert.rejects(service.flash({ id: 'old', serial: '1234ABCD5678', installBoot: false }));
    await writeFile(join(root, 'build/appli.bin'), 'modified');
    await assert.rejects(
      service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false }),
      /changed/,
    );
    assert.equal(calls.length, 0);
  }));

test('a second flash cannot enter while probe preflight is awaiting tools', () =>
  fixture(async ({ service }) => {
    let release;
    const gate = new Promise((r) => (release = r));
    const caps = service.capabilities;
    service.capabilities = async () => {
      await gate;
      return caps();
    };
    const first = service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false });
    await assert.rejects(
      service.flash({ id: 'build1', serial: '1234ABCD5678', installBoot: false }),
      /already running/,
    );
    release();
    await first;
    await service.task;
  }));

test('invalid terrain budgets are rejected before any board operation', () =>
  fixture(async ({ service, calls }) => {
    for (const terrainCacheKiB of [-1, 1, 65536, '2048'])
      await assert.rejects(
        service.start([], { renderer: 'neochrom', fps: 30, terrainCacheKiB }),
        /Invalid board build options/,
      );
    assert.equal(calls.length, 0);
    assert.equal(service.job, null);
  }));

test('serial monitor is opt-in, validates its option and forwards the firmware flag', () =>
  fixture(async ({ service, calls }) => {
    await assert.rejects(
      service.start([], { renderer: 'neochrom', fps: 30, inputMonitor: 'yes' }),
      /Invalid board build options/,
    );
    service.job = 'monitor-build';
    service.command = async (_file, args) => {
      calls.push(args);
      throw Error('build invocation captured');
    };
    await assert.rejects(
      service.buildFirmware(
        'monitor-build',
        new Map(),
        { renderer: 'neochrom', fps: 30, inputMonitor: true },
        { tools: { python: '/python' }, config: {} },
      ),
      /build invocation captured/,
    );
    assert(calls[0].includes('--input-monitor'));
    calls.length = 0;
    await assert.rejects(
      service.buildFirmware(
        'monitor-build',
        new Map(),
        { renderer: 'neochrom', fps: 30 },
        { tools: { python: '/python' }, config: {} },
      ),
      /build invocation captured/,
    );
    assert(!calls[0].includes('--input-monitor'));
  }));
