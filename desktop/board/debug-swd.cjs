const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomInt } = require('node:crypto');
const { acquireProbe } = require('./probe-lock.cjs');
const { metrics, strip } = require('./protocol.cjs');
const execute = promisify(execFile);
const MAGIC = 0x4c475357;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (v) => '0x' + (v >>> 0).toString(16);
function words(output) {
  const result = [];
  for (const row of strip(output).split(/\r?\n/)) {
    const match = row.match(/^\s*0x[\da-f]{8}\s*:\s*((?:[\da-f]{8}\s*)+)$/i);
    if (match) for (const value of match[1].trim().split(/\s+/)) result.push(parseInt(value, 16));
  }
  return result;
}
const float = (word) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(word);
  return b.readFloatLE();
};
const bits = (number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(number);
  return b.readUInt32LE();
};
function response(w, tag) {
  if (w.length !== 96 || w[0] !== MAGIC || w[1] !== 1 || w[2] % 2 || w[2] !== w[95]) return null;
  if (tag.some((value, i) => value !== w[84 + i]))
    throw Error('Running firmware differs from this build report. No command was sent.');
  const text = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) text.writeUInt32LE(w[24 + i], i * 4);
  return {
    ack: w[3],
    result: w[4],
    uptimeMs: w[5],
    leaseRemainingMs: w[6],
    paused: !!w[7],
    input: w[8],
    dimension: w[9],
    simulationTicks: w[10],
    position: w.slice(11, 13).map(float),
    velocity: w.slice(14, 16).map(float),
    health: w[23],
    framebuffer: w[40],
    scene: text.toString('utf8').split('\0')[0],
  };
}
function descriptor(report) {
  const d = report.debugSwd,
    address = Number(d?.address);
  if (
    !d ||
    d.version !== 1 ||
    d.bytes !== 512 ||
    d.magic !== hex(MAGIC) ||
    !Number.isInteger(address) ||
    address % 32 ||
    address < 0x2406c000 ||
    address + 512 > 0x24072000 ||
    !Array.isArray(d.buildTag) ||
    d.buildTag.length !== 4 ||
    d.buildTag.some((v) => !Number.isInteger(v) || v < 0 || v > 0xffffffff)
  )
    throw Error(
      'This build has no valid SWD mailbox. Build with --debug-swd and use its build-report.json.',
    );
  return { address, tag: d.buildTag };
}
class SwdClient {
  constructor({ report, serial, programmer, run = execute }) {
    if (!/^[a-z0-9]{8,64}$/i.test(serial)) throw Error('Select an ST-LINK serial with --serial.');
    if (typeof programmer !== 'string' || !path.isAbsolute(programmer))
      throw Error('Choose an absolute CubeProgrammer executable path.');
    this.report = report;
    this.serial = serial;
    this.programmer = programmer;
    this.run = run;
    Object.assign(this, descriptor(report));
  }
  async tool(args, timeout = 15000) {
    const r = await this.run(
      this.programmer,
      ['-c', 'port=SWD', `sn=${this.serial}`, 'mode=HOTPLUG', 'freq=1000', ...args],
      { timeout, maxBuffer: 2 * 1024 * 1024 },
    );
    const output = strip((r.stdout || '') + '\n' + (r.stderr || ''));
    if (/ST-LINK error|Error\s*:|DEV_[A-Z_]*ERR|Unable to|failed/i.test(output))
      throw Error('SWD transfer failed: ' + output.slice(-1800));
    return output;
  }
  async state() {
    for (let i = 0; i < 5; i++) {
      const state = response(
        words(await this.tool(['-r32', hex(this.address + 128), '0x180'])),
        this.tag,
      );
      if (state) return state;
    }
    throw Error('No coherent SWD state. Check the firmware is running and matches the report.');
  }
  async command(op, args = [], lease = 5000) {
    if (
      !Number.isInteger(op) ||
      op < 1 ||
      op > 9 ||
      args.length > 28 ||
      args.some((v) => !Number.isInteger(v) || v < 0 || v > 0xffffffff) ||
      !Number.isInteger(lease) ||
      lease < 100 ||
      lease > 120000
    )
      throw Error('Invalid SWD command.');
    const before = await this.state();
    let seq = randomInt(1, 0xffffffff);
    if (seq === before.ack) seq = seq === 0xfffffffe ? 1 : seq + 1;
    const packet = Array(31).fill(0);
    packet[0] = op;
    packet[1] = lease;
    args.forEach((v, i) => (packet[i + 2] = v));
    packet[30] = seq;
    // Invalidate first, write payload+matching tail, commit last. All writes are
    // confined to the host-owned mailbox; never flash/control registers.
    await this.tool(['-w32', hex(this.address), '0']);
    await this.tool(['-w32', hex(this.address + 4), ...packet.map(hex)]);
    await this.tool(['-w32', hex(this.address), hex(seq)]);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const state = await this.state();
      if (state.ack === seq) {
        if (state.result)
          throw Error(
            `Game rejected SWD command (${state.result === 1 ? 'invalid arguments' : 'unsupported in this scene'}).`,
          );
        return state;
      }
      await wait(20);
    }
    throw Error(
      'Game did not acknowledge SWD command; input/pause automatically expire with the lease.',
    );
  }
  async telemetry() {
    const address = Number(this.report.telemetryAddress);
    if (!Number.isInteger(address) || address < 0x2406c000 || address + 48 > 0x24072000)
      throw Error('Invalid telemetry range.');
    return metrics(await this.tool(['-r32', hex(address), '0x30']));
  }
}
const number = (p, key, low, high, fallback) => {
  const value = p[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    throw Error(`${key} must be ${low}..${high}.`);
  return value;
};
function inputMask(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 127) return value;
  const actions = {
    left: 1,
    right: 2,
    up: 4,
    down: 8,
    jump: 16,
    action: 16,
    sword: 32,
    talk: 32,
    interact: 32,
    lock: 64,
    menu: 64,
    none: 0,
  };
  if (typeof value !== 'string' || !value.trim())
    throw Error('Use input action names or mask 0..127.');
  return value
    .toLowerCase()
    .split(/[,+\s]+/)
    .reduce((mask, key) => {
      if (!(key in actions)) throw Error('Unknown input: ' + key);
      return mask | actions[key];
    }, 0);
}
async function run(command, p, { programmer, png, transport, acquire = acquireProbe }) {
  const report = JSON.parse(await fs.readFile(path.resolve(p.buildReport), 'utf8'));
  const client = new SwdClient({
    report,
    serial: p.serial,
    programmer: p.programmer || programmer,
    run: transport,
  });
  const unlock = await acquire();
  try {
    const duration = number(p, 'durationMs', 100, 120000, 5000);
    if (command === 'board.status')
      return {
        state: await client.state(),
        display: await client.telemetry(),
      };
    if (command === 'board.input') return await client.command(1, [inputMask(p.actions)], duration);
    if (command === 'board.warp')
      return await client.command(
        6,
        [bits(number(p, 'x', -1000, 1000)), bits(number(p, 'y', -1000, 1000)), 0],
        duration,
      );
    const op = { 'board.pause': 2, 'board.resume': 3, 'board.release': 4, 'board.reload': 5 }[
      command
    ];
    if (op) return await client.command(op, [], duration);
    if (command === 'board.capture') {
      const target = path.resolve(p.output);
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-swd-capture-'));
      let captured;
      try {
        await client.command(2, [], 60000);
        await wait(200);

        const lcd = true;
        if (p.surface !== undefined && p.surface !== 'display')
          throw Error('surface must be display.');
        const state = await client.state();
        const width = 800,
          height = 480,
          address = state.framebuffer;
        const size = width * height * 2;
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 1 ||
          height < 1 ||
          width > 800 ||
          height > 480 ||
          !Number.isInteger(address) ||
          address % 2 ||
          !(
            (address >= 0x90000000 && address + size <= 0x92000000) ||
            (!lcd && address >= 0x24000000 && address + size <= 0x2406c000)
          )
        )
          throw Error('Invalid framebuffer range.');
        const binary = path.join(temp, 'frame.bin');
        await client.tool(['--upload', hex(address), hex(size), binary], 30000);
        const raw = await fs.readFile(binary);
        if (raw.length !== size) throw Error('Incomplete framebuffer capture.');
        const rgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          const c = raw.readUInt16LE(i * 2);
          rgba[i * 4] = (((c >> 11) & 31) * 255) / 31;
          rgba[i * 4 + 1] = (((c >> 5) & 63) * 255) / 63;
          rgba[i * 4 + 2] = ((c & 31) * 255) / 31;
          rgba[i * 4 + 3] = 255;
        }
        await fs.writeFile(target, png(width, height, rgba), { flag: 'wx' });
        captured = {
          path: target,
          width,
          height,
          surface: 'display',
          state: await client.state(),
        };
        return captured;
      } finally {
        try {
          const released = await client.command(4);
          if (captured) captured.releasedState = released;
        } finally {
          await fs.rm(temp, { recursive: true, force: true });
        }
      }
    }
    if (command === 'board.benchmark') {
      const seconds = number(p, 'seconds', 3, 60, 10),
        mask = inputMask(p.actions ?? 'up');
      const samples = [];
      let releasedState;
      try {
        await client.command(1, [mask], Math.min(120000, Math.ceil(seconds * 1000) + 15000));
        const until = Date.now() + seconds * 1000;
        do {
          const state = await client.state(),
            display = await client.telemetry();
          samples.push({ state, display });
          if (Date.now() < until) await wait(500);
        } while (Date.now() < until);
      } finally {
        releasedState = await client.command(4);
      }
      const displays = samples.map((s) => s.display).filter(Boolean);
      const firstDisplay = displays[0],
        lastDisplay = displays.at(-1);
      const displayElapsed =
        displays.length > 1 ? (lastDisplay.uptimeMs - firstDisplay.uptimeMs) >>> 0 : 0;
      const result = {
        actions: mask,
        releasedState,
        displayFps: displayElapsed
          ? (((lastDisplay.frames - firstDisplay.frames) >>> 0) * 1000) / displayElapsed
          : null,
        sampleCount: samples.length,
        positionChanged: samples.some(
          (s) => JSON.stringify(s.state.position) !== JSON.stringify(samples[0].state.position),
        ),
        samples,
      };
      if (p.output)
        await fs.writeFile(path.resolve(p.output), JSON.stringify(result, null, 2) + '\n', {
          flag: 'wx',
        });
      return result;
    }
    throw Error('Unknown SWD command.');
  } finally {
    await unlock();
  }
}
module.exports = { SwdClient, descriptor, response, words, inputMask, run };
