const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const { normalizeFiles } = require('../export-folder.cjs');
const { PacketDecoder, TYPES, diagnosticLines } = require('./protocol.cjs');
const execute = promisify(execFile);
const SOURCES = [
  'ui.c',
  'generated/game_data.c',
  'generated/game_assets.c',
  'generated/game_flow.c',
  'generated/game_inputs.c',
  'engine/lge_inputs.c',
  'engine/lge_input_codec.c',
  'user/game_hooks.c',
  'engine/lge.c',
  'engine/lge_physics.c',
  'engine/lge_melee.c',
  'engine/lge_gameplay.c',
  'engine/lge_rpg.c',
  'engine/lge_rpg_ui.c',
  'engine/lge_rpg_save.c',
  'engine/lge_rpg_view.c',
  'engine/lge_story.c',
  'engine/lge_lvgl.c',
  'engine/lge_tile_cache.c',
  'engine/lge_flow.c',
];
const HEADERS = [
  'ui.h',
  'ui_ids.h',
  'game.h',
  'generated/game_data.h',
  'generated/game_flow.h',
  'generated/game_inputs.h',
  'ui_inputs.h',
  'engine/lge_inputs.h',
  'engine/lge_input_codec.h',
  'engine/lge.h',
  'engine/lge_melee.h',
  'engine/lge_gameplay.h',
  'engine/lge_rpg.h',
  'engine/lge_rpg_view.h',
  'engine/lge_story.h',
  'engine/lge_lvgl.h',
  'engine/lge_tile_cache.h',
  'engine/lge_lvgl_compat.h',
  'engine/lge_flow.h',
  'engine/lge_config.h',
];
const MAX_LOG = 32768;
function terminate(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
}
const id = (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const gain = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const cleanEnv = () => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'en_US.UTF-8',
  TMPDIR: require('node:os').tmpdir(),
});

/** Owns one build/run session. Electron and React are adapters, not dependencies of this service. */
class NativePlaytestService {
  constructor({ sdkRoot, cacheRoot, emit, compiler = '/usr/bin/clang', heartbeatMs = 5000 }) {
    Object.assign(this, { sdkRoot, cacheRoot, emit, compiler, heartbeatMs });
    this.session = null;
  }
  async capabilities() {
    try {
      const sdk = JSON.parse(await fs.readFile(path.join(this.sdkRoot, 'sdk.json'), 'utf8'));
      if (sdk.available === false) return { available: false, reason: sdk.reason };
      if (sdk.platform !== process.platform || sdk.arch !== process.arch)
        throw new Error('This native SDK does not match this computer.');
      await execute(this.compiler, ['--version'], {
        env: cleanEnv(),
        timeout: 5000,
        maxBuffer: 65536,
      });
      await fs.access(path.join(this.sdkRoot, 'liblvgl.a'));
      return { available: true, lvgl: sdk.lvgl, platform: sdk.platform, arch: sdk.arch };
    } catch (error) {
      return {
        available: false,
        reason:
          error.code === 'ENOENT'
            ? 'Native playtesting requires the bundled SDK and Apple Command Line Tools. Install the tools with xcode-select --install.'
            : error.message,
      };
    }
  }
  send(session, event) {
    if (this.session === session && !session.cancelled) this.emit({ runId: session.id, ...event });
  }
  status(session, phase, message, extra = {}) {
    session.phase = phase;
    this.send(session, { kind: 'status', phase, message, logs: session.logs, ...extra });
  }
  log(session, chunk) {
    session.logs = (session.logs + chunk.toString()).slice(-MAX_LOG);
    if (!session.logTimer)
      session.logTimer = setTimeout(() => {
        session.logTimer = null;
        this.send(session, { kind: 'log', text: session.logs });
      }, 100);
  }
  async start(request) {
    if (this.session) throw new Error('Stop the current playtest before starting another.');
    if (
      !request ||
      !Number.isInteger(request.width) ||
      request.width < 16 ||
      request.width > 2048 ||
      !Number.isInteger(request.height) ||
      request.height < 16 ||
      request.height > 2048 ||
      !['entry', 'scene', 'sequence'].includes(request.target?.kind) ||
      (request.target.kind !== 'entry' && !id(request.target.id))
    )
      throw new Error('Invalid playtest settings.');
    const files = normalizeFiles(request.entries);
    for (const name of [...SOURCES, ...HEADERS])
      if (!files.has(name)) throw new Error(`Playtest is missing ${name}.`);
    const capabilities = await this.capabilities();
    if (!capabilities.available) throw new Error(capabilities.reason);
    // Recheck after the asynchronous preflight so concurrent starts cannot both acquire ownership.
    if (this.session) throw new Error('A playtest is already starting.');
    const session = {
      id: randomUUID(),
      logs: '',
      cancelled: false,
      child: null,
      phase: 'building',
      request,
      framePending: false,
      lastHeartbeat: Date.now(),
    };
    this.session = session;
    session.task = Promise.resolve()
      .then(() => this.buildAndRun(session, files))
      .catch((error) => {
        if (!session.cancelled)
          this.status(session, 'error', error.message, {
            diagnostics: diagnosticLines(session.logs, session.uiRoot || ''),
          });
      })
      .finally(() => {
        clearTimeout(session.logTimer);
        clearInterval(session.watchdog);
        if (this.session === session) this.session = null;
      });
    this.status(session, 'building', 'Compiling your C against LVGL…');
    return { runId: session.id };
  }
  async compile(session, args, cwd) {
    await new Promise((resolve, reject) => {
      const child = spawn(this.compiler, args, {
        cwd,
        env: cleanEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      session.child = child;
      const timeout = setTimeout(() => {
        terminate(child, 'SIGKILL');
      }, 30000);
      child.stdout.on('data', (data) => this.log(session, data));
      child.stderr.on('data', (data) => this.log(session, data));
      child.on('error', reject);
      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        session.child = null;
        if (session.cancelled) reject(new Error('Build cancelled.'));
        else if (code === 0) resolve();
        else
          reject(
            new Error(
              signal
                ? 'The compiler timed out or was stopped.'
                : 'C compilation failed. Review the diagnostics below.',
            ),
          );
      });
    });
  }
  async buildAndRun(session, files) {
    await fs.mkdir(this.cacheRoot, { recursive: true, mode: 0o700 });
    const sdk = await fs.readFile(path.join(this.sdkRoot, 'sdk.json'));
    const host = await fs.readFile(path.join(this.sdkRoot, 'host.c'));
    const hash = createHash('sha256').update(sdk).update(host);
    for (const name of [...SOURCES, ...HEADERS].sort())
      hash
        .update(name)
        .update('\0')
        .update(String(files.get(name).length))
        .update('\0')
        .update(files.get(name));
    const key = hash.digest('hex');
    const build = path.join(this.cacheRoot, key),
      executable = path.join(build, 'game');
    session.uiRoot = path.join(build, 'ui');
    let cached = false;
    try {
      await fs.access(executable, fs.constants.X_OK);
      cached = true;
    } catch {}
    if (!cached) {
      await fs.mkdir(session.uiRoot, { recursive: true, mode: 0o700 });
      for (const name of [...SOURCES, ...HEADERS]) {
        const target = path.join(session.uiRoot, name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, files.get(name));
      }
      await fs.writeFile(path.join(build, 'host.c'), host);
      if (session.cancelled) return;
      const output = path.join(build, `game-${session.id}.building`);
      await this.compile(
        session,
        [
          '-std=c99',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-g',
          '-O0',
          '-DLV_CONF_INCLUDE_SIMPLE',
          '-DLGE_DESKTOP_PLAYTEST=1',
          '-I',
          this.sdkRoot,
          '-isystem',
          path.join(this.sdkRoot, 'include'),
          '-I',
          session.uiRoot,
          path.join(build, 'host.c'),
          ...SOURCES.map((name) => path.join(session.uiRoot, name)),
          path.join(this.sdkRoot, 'liblvgl.a'),
          '-lm',
          '-o',
          output,
        ],
        build,
      );
      if (session.cancelled) {
        await fs.rm(output, { force: true });
        return;
      }
      await fs.chmod(output, 0o700);
      await fs.rename(output, executable);
    }
    if (session.cancelled) return;
    await fs.utimes(build, new Date(), new Date());
    await this.prune(key);
    this.status(
      session,
      'building',
      cached ? 'Using the cached build…' : 'Build passed. Starting LVGL…',
      { cached },
    );
    await this.run(session, executable, build, cached);
  }
  async prune(current) {
    const builds = [];
    for (const name of await fs.readdir(this.cacheRoot)) {
      if (name === current || !/^[a-f0-9]{64}$/.test(name)) continue;
      const file = path.join(this.cacheRoot, name),
        stat = await fs.lstat(file);
      if (stat.isDirectory() && !stat.isSymbolicLink()) builds.push({ file, time: stat.mtimeMs });
    }
    builds.sort((a, b) => b.time - a.time);
    for (const build of builds.slice(7)) await fs.rm(build.file, { recursive: true, force: true });
  }
  async run(session, executable, cwd, cached) {
    const target = session.request.target;
    const data = await fs.readFile(path.join(session.uiRoot, 'generated/game_data.c'), 'utf8');
    const schema = data.match(/\.schema=UINT32_C\((\d+)\)/)?.[1];
    const saveRoot = path.join(this.cacheRoot, 'saves');
    await fs.mkdir(saveRoot, { recursive: true, mode: 0o700 });
    await new Promise((resolve, reject) => {
      const child = spawn(executable, target.kind === 'entry' ? [] : [target.kind, target.id], {
        cwd,
        env: {
          ...cleanEnv(),
          ...(schema ? { LGE_SAVE_PATH: path.join(saveRoot, schema + '.sav') } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        detached: true,
      });
      session.child = child;
      session.stage = 'game';
      session.lastHeartbeat = Date.now();
      let announced = false,
        failure = null,
        audioCount = 0,
        audioWindow = Date.now();
      const fail = (error) => {
        failure = error;
        terminate(child, 'SIGKILL');
      };
      const decoder = new PacketDecoder(
        session.request.width * session.request.height * 4,
        (type, data) => {
          if (session.cancelled) return;
          if (type === TYPES.FRAME) {
            if (session.framePending)
              throw new Error('Native renderer exceeded the frame acknowledgement limit.');
            session.framePending = true;
            this.send(session, {
              kind: 'frame',
              width: session.request.width,
              height: session.request.height,
              pixels: Uint8Array.from(data),
            });
          } else if (type === TYPES.INPUTS) {
            if (
              !data ||
              !Array.isArray(data.channels) ||
              data.channels.length > 32 ||
              !Number.isInteger(data.actions) ||
              data.actions < 0 ||
              data.actions > 127 ||
              ![data.x, data.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1) ||
              !data.channels.every(
                (c) =>
                  Number.isInteger(c.channel) &&
                  c.channel >= 0 &&
                  c.channel < 32 &&
                  typeof c.active === 'boolean' &&
                  Number.isFinite(c.normalized) &&
                  Math.abs(c.normalized) <= 1.00001 &&
                  (c.value === null || typeof c.value === 'boolean' || Number.isFinite(c.value)),
              )
            )
              throw new Error('Invalid native input telemetry.');
            this.send(session, { kind: 'inputs', ...data });
          } else if (type === TYPES.STATE) {
            if (
              !data ||
              !['scene', 'sequence', 'step'].every((k) => data[k] === '' || id(data[k])) ||
              typeof data.paused !== 'boolean' ||
              !uint(data.score) ||
              !uint(data.total)
            )
              throw new Error('Invalid native game state.');
            session.lastHeartbeat = Date.now();
            if (!announced) {
              announced = true;
              this.status(session, 'running', 'Running your generated C with LVGL.', { cached });
            }
            this.send(session, { kind: 'game', ...data });
          } else {
            if (Date.now() - audioWindow >= 1000) {
              audioCount = 0;
              audioWindow = Date.now();
            }
            if (++audioCount > 1024)
              throw new Error(
                'Audio command rate exceeded the playtest limit. Check your C hooks.',
              );
            if (
              !data ||
              !['play', 'stop', 'pause', 'gain'].includes(data.op) ||
              (data.op === 'pause' ? typeof data.paused !== 'boolean' : !uint(data.voice)) ||
              (data.op === 'play' &&
                (!id(data.cue) || !gain(data.gain) || typeof data.loop !== 'boolean')) ||
              (data.op === 'gain' && !gain(data.gain))
            )
              throw new Error('Invalid native audio command.');
            this.send(session, { kind: 'audio', command: data });
          }
        },
      );
      child.stdio[3].on('data', (data) => {
        try {
          decoder.push(data);
        } catch (error) {
          fail(error);
        }
      });
      child.stdout.on('data', (data) => this.log(session, data));
      child.stderr.on('data', (data) => this.log(session, data));
      child.stdin.on('error', () => {});
      child.on('error', reject);
      session.watchdog = setInterval(() => {
        if (Date.now() - session.lastHeartbeat > this.heartbeatMs)
          fail(
            new Error(
              'The game stopped responding. Check C hooks for blocking work or infinite loops.',
            ),
          );
      }, 500);
      child.on('close', (code, signal) => {
        clearInterval(session.watchdog);
        session.child = null;
        if (failure) reject(failure);
        else if (!session.cancelled && code !== 0)
          reject(
            new Error(
              `Game process exited ${signal ? 'with ' + signal : 'with code ' + code}. See the C output below.`,
            ),
          );
        else {
          if (!session.cancelled) this.status(session, 'stopped', 'Game stopped.');
          resolve();
        }
      });
    });
  }
  control(runId, command) {
    const s = this.session;
    if (!s || s.id !== runId || s.stage !== 'game' || !s.child?.stdin?.writable) return false;
    // Do not drop the one frame acknowledgement when input is backpressured.
    if (s.child.stdin.writableLength > 16384 && command?.op !== 'frame-ack') return false;
    let line;
    if (command?.op === 'input-monitor' && typeof command.enabled === 'boolean')
      line = `M ${+command.enabled}`;
    else if (
      command?.op === 'physical-disconnect' &&
      Number.isInteger(command.device) &&
      command.device >= 0 &&
      command.device < 8
    )
      line = `X ${command.device}`;
    else if (command?.op === 'physical-input') {
      const samples = command.samples;
      if (!Array.isArray(samples) || !samples.length || samples.length > 32)
        throw new Error('Invalid physical input batch.');
      const seen = new Set();
      const parts = samples.map((s) => {
        if (
          !s ||
          !Number.isInteger(s.channel) ||
          s.channel < 0 ||
          s.channel >= 32 ||
          seen.has(s.channel) ||
          !['int', 'float', 'bool'].includes(s.type) ||
          (s.pulse !== undefined && typeof s.pulse !== 'boolean') ||
          (s.type === 'bool' ? typeof s.value !== 'boolean' : !Number.isFinite(s.value)) ||
          (s.type === 'int' &&
            (!Number.isInteger(s.value) || s.value < -2147483648 || s.value > 2147483647)) ||
          (s.type === 'float' && !Number.isFinite(Math.fround(s.value))) ||
          (s.pulse && s.type !== 'bool')
        )
          throw new Error('Invalid physical input sample.');
        seen.add(s.channel);
        return `${s.channel} ${['int', 'float', 'bool'].indexOf(s.type)} ${s.type === 'bool' ? +s.value : s.value} ${s.pulse ? 1 : 0}`;
      });
      line = `V ${samples.length} ${parts.join(' ')}`;
    } else if (
      command?.op === 'input' &&
      Number.isInteger(command.mask) &&
      command.mask >= 0 &&
      command.mask <= 127
    )
      line = `I ${command.mask}`;
    else if (
      command?.op === 'pointer' &&
      Number.isInteger(command.x) &&
      command.x >= 0 &&
      command.x < s.request.width &&
      Number.isInteger(command.y) &&
      command.y >= 0 &&
      command.y < s.request.height &&
      typeof command.down === 'boolean'
    )
      line = `T ${command.x} ${command.y} ${+command.down}`;
    else if (command?.op === 'pause' && typeof command.paused === 'boolean')
      line = `P ${+command.paused}`;
    else if (command?.op === 'complete' && uint(command.voice)) line = `D ${command.voice}`;
    else if (command?.op === 'frame-ack') {
      if (!s.framePending) return false;
      s.framePending = false;
      line = 'A';
    } else if (command?.op === 'next') line = 'N';
    else if (command?.op === 'collision-debug' && typeof command.enabled === 'boolean')
      line = `C ${command.enabled ? 1 : 0}`;
    else if (command?.op === 'reset') line = 'R';
    else throw new Error('Invalid native playtest control.');
    s.child.stdin.write(line + '\n');
    return true;
  }
  dispose() {
    const s = this.session;
    if (!s) return;
    s.cancelled = true;
    clearTimeout(s.logTimer);
    clearInterval(s.watchdog);
    terminate(s.child, 'SIGKILL');
  }
  async stop(runId) {
    const s = this.session;
    if (!s || (runId && s.id !== runId)) return;
    // Mark cancelled before killing, so output from an old run can never reach a new one.
    s.cancelled = true;
    const child = s.child;
    if (child) terminate(child, 'SIGTERM');
    const kill = setTimeout(() => terminate(child, 'SIGKILL'), 500);
    await s.task;
    clearTimeout(kill);
    if (this.session === s) this.session = null;
    this.emit({
      runId: s.id,
      kind: 'status',
      phase: 'stopped',
      message: 'Game stopped.',
      logs: s.logs,
    });
  }
}
module.exports = { NativePlaytestService };
