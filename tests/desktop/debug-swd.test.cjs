const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SwdClient,
  descriptor,
  response,
  words,
  inputMask,
} = require('../../desktop/board/debug-swd.cjs');
const report = {
  debugSwd: {
    address: '0x2406e880',
    bytes: 512,
    version: 1,
    magic: '0x4c475357',
    buildTag: [1, 2, 3, 4],
  },
};
const state = () => {
  const w = Array(96).fill(0);
  w[0] = 0x4c475357;
  w[1] = 1;
  w[2] = w[95] = 2;
  w[84] = 1;
  w[85] = 2;
  w[86] = 3;
  w[87] = 4;
  return w;
};
const output = (w, address = 0x2406e900) =>
  '0x' + address.toString(16) + ' : ' + w.map((v) => v.toString(16).padStart(8, '0')).join(' ');
test('SWD identity and seqlocks reject stale or torn reports before RAM writes', async () => {
  const w = state();
  assert.equal(response(w, [1, 2, 3, 4]).ack, 0);
  w[95] = 4;
  assert.equal(response(w, [1, 2, 3, 4]), null);
  w[95] = 2;
  w[84] = 9;
  assert.throws(() => response(w, [1, 2, 3, 4]), /differs/);
  for (const address of ['0x08000000', '0x70000000', '0x24071f00', '0x2406e881'])
    assert.throws(() => descriptor({ ...report, debugSwd: { ...report.debugSwd, address } }));
  const calls = [];
  const client = new SwdClient({
    report,
    serial: '1234ABCD5678',
    programmer: '/programmer',
    run: async (file, args) => {
      calls.push(args);
      return { stdout: output(w) };
    },
  });
  await assert.rejects(client.command(1, [4]), /differs/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('-r32'));
});
test('SWD commits bounded payload last and waits for acknowledgment without halting or flashing', async () => {
  const calls = [],
    w = state();
  let committed;
  const client = new SwdClient({
    report,
    serial: '1234ABCD5678',
    programmer: '/programmer',
    run: async (file, args) => {
      calls.push(args);
      assert.ok(args.includes('mode=HOTPLUG'));
      const at = args.indexOf('-w32');
      if (at >= 0 && Number(args[at + 1]) === 0x2406e880 && Number(args[at + 2])) {
        committed = Number(args[at + 2]);
        w[3] = committed;
        w[8] = 4;
      }
      return { stdout: output(w) };
    },
  });
  const s = await client.command(1, [4], 5000);
  assert.equal(s.ack, committed);
  assert.equal(s.input, 4);
  const writes = calls.filter((a) => a.includes('-w32'));
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].slice(-3), ['-w32', '0x2406e880', '0']);
  assert.equal(Number(writes[1][writes[1].indexOf('-w32') + 1]), 0x2406e884);
  assert.equal(Number(writes[1].at(-1)), committed);
  for (const args of calls)
    for (const forbidden of ['-w', '-d', '-e', '-ob', '-rst', '-hardRst', '-halt', '-el'])
      assert.ok(!args.includes(forbidden));
});
test('SWD parses only memory rows, validates action aliases and surfaces USB failures', async () => {
  assert.deepEqual(words('progress 12345678\n' + output([1, 2, 3])), [1, 2, 3]);
  assert.equal(inputMask('up,jump,sword'), 52);
  assert.equal(inputMask('none'), 0);
  assert.throws(() => inputMask('fly'));
  const client = new SwdClient({
    report,
    serial: '1234ABCD5678',
    programmer: '/programmer',
    run: async () => ({ stdout: 'Error: ST-LINK transfer failed' }),
  });
  await assert.rejects(client.state(), /transfer failed/);
});

test('frame capture releases automation before returning and reports final state', async (t) => {
  const fs = require('node:fs/promises'),
    path = require('node:path'),
    os = require('node:os');
  const { run } = require('../../desktop/board/debug-swd.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-capture-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const buildReport = path.join(directory, 'build-report.json');
  await fs.writeFile(buildReport, JSON.stringify(report));
  const w = state(),
    mailbox = Array(32).fill(0),
    operations = [];
  w[40] = 0x90000000;
  const transport = async (_file, args) => {
    const write = args.indexOf('-w32');
    if (write >= 0) {
      const offset = (Number(args[write + 1]) - 0x2406e880) / 4;
      args.slice(write + 2).forEach((v, i) => (mailbox[offset + i] = Number(v)));
      if (offset === 0 && mailbox[0]) {
        const op = mailbox[1];
        operations.push(op);
        w[3] = mailbox[0];
        w[7] = op === 2 ? 1 : 0;
      }
      return { stdout: '' };
    }
    const upload = args.indexOf('--upload');
    if (upload >= 0) {
      await fs.writeFile(args[upload + 3], Buffer.alloc(800 * 480 * 2));
      return { stdout: '' };
    }
    const read = args.indexOf('-r32');
    return { stdout: output(w) };
  };
  const result = await run(
    'board.capture',
    { buildReport, serial: '1234ABCD5678', output: path.join(directory, 'frame.png') },
    {
      programmer: '/programmer',
      transport,
      acquire: async () => async () => {},
      png: () => Buffer.from('PNG'),
    },
  );
  assert.deepEqual(operations, [2, 4]);
  assert.equal(result.state.paused, true);
  assert.equal(result.releasedState.paused, false);
  assert.equal(await fs.readFile(result.path, 'utf8'), 'PNG');
});
