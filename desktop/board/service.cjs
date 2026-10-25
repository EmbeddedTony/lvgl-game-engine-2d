const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const { normalizeFiles } = require('../export-folder.cjs');
const { atomicWrite } = require('../storage.cjs');
const { acquireProbe } = require('./probe-lock.cjs');
const { strip, probes, metrics } = require('./protocol.cjs');
const execute = promisify(execFile);
const DEFAULT_PROGRAMMER =
  '/Applications/STM32CubeProgrammer.app/Contents/Resources/bin/STM32_Programmer_CLI';
const LOADER = 'MX66UW1G45G_STM32H7S78-DK.stldr';
const cleanPath = (p) =>
  typeof p === 'string' && p.length <= 4096 && !p.includes('\0') && (!p || path.isAbsolute(p));
class BoardService {
  constructor({ root, script, sdkCache, emit, run = execute, acquire = acquireProbe }) {
    Object.assign(this, { root, script, sdkCache, emit, run, acquire });
    this.phase = 'idle';
    this.logs = '';
    this.job = null;
    this.build = null;
    this.monitor = null;
  }
  env(config = {}) {
    return {
      ...process.env,
      PATH: [
        config.toolchainBin,
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        process.env.PATH,
      ]
        .filter(Boolean)
        .join(path.delimiter),
      PYTHONUNBUFFERED: '1',
    };
  }
  async settings() {
    return JSON.parse(
      await fs.readFile(path.join(this.root, 'tools.json'), 'utf8').catch(() => '{}'),
    );
  }
  async configure(config) {
    if (this.job) throw Error('Wait for the current board operation.');
    if (
      !config ||
      Object.keys(config).some((k) => !['programmer', 'toolchainBin'].includes(k)) ||
      !Object.values(config).every(cleanPath)
    )
      throw Error('Choose absolute tool paths.');
    await atomicWrite(path.join(this.root, 'tools.json'), JSON.stringify(config));
    return this.capabilities();
  }
  async capabilities() {
    const config = await this.settings();
    const find = async (name, candidates = []) => {
      for (const candidate of [
        ...candidates,
        ...this.env(config)
          .PATH.split(path.delimiter)
          .map((d) => path.join(d, name)),
      ])
        if (
          candidate &&
          (await fs.access(candidate, fs.constants.X_OK).then(
            () => true,
            () => false,
          ))
        )
          return candidate;
      return null;
    };
    const programmer = await find(
      process.platform === 'win32' ? 'STM32_Programmer_CLI.exe' : 'STM32_Programmer_CLI',
      [config.programmer, DEFAULT_PROGRAMMER],
    );
    const loader = programmer
      ? path.join(path.dirname(programmer), 'ExternalLoader', LOADER)
      : null;
    const tools = {
      python: await find('python3'),
      cmake: await find('cmake'),
      ninja: await find('ninja'),
      git: await find('git'),
      programmer,
      loader:
        loader &&
        (await fs.access(loader).then(
          () => loader,
          () => null,
        )),
    };
    return {
      config,
      tools,
      phase: this.phase,
      logs: this.logs,
      build: this.build,
      monitoring: !!this.monitor,
    };
  }
  status(phase, message, extra = {}) {
    this.phase = phase;
    this.emit({ type: 'status', phase, message, ...extra });
  }
  log(s) {
    this.logs = (this.logs + strip(String(s))).slice(-120000);
    this.emit({ type: 'log', text: strip(String(s)).slice(-16000) });
  }
  async scan() {
    const caps = await this.capabilities();
    if (!caps.tools.programmer)
      throw Error('Install STM32CubeProgrammer or choose its CLI in Tool settings.');
    const unlock = await this.acquire();
    let r;
    try {
      r = await this.run(caps.tools.programmer, ['-l', 'st-link'], {
        env: this.env(caps.config),
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
    } finally {
      await unlock();
    }
    const detected = probes(r.stdout);
    if (
      !detected.length &&
      /USBDeviceOpen|DEV_CONNECT_ERR/i.test(r.stdout + ' ' + (r.stderr || ''))
    ) {
      this.log(r.stdout + ' ' + (r.stderr || ''));
      throw Error(
        'CubeProgrammer cannot open ST-LINK USB. Check accessory permission, the cable and other debugger sessions.',
      );
    }
    return detected;
  }
  async command(file, args, config, timeout = 180000) {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, {
        env: this.env(config),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
      this.child = child;
      let output = '';
      const timer = setTimeout(() => {
        this.kill(child);
        reject(Error('Board command timed out.'));
      }, timeout);
      const data = (s) => {
        output = (output + s).slice(-2 * 1024 * 1024);
        this.log(s);
      };
      child.stdout.on('data', data);
      child.stderr.on('data', data);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
        code === 0
          ? resolve(output)
          : reject(Error(`Board tool exited with code ${code}. See the build log.`));
      });
    });
  }
  kill(child) {
    try {
      process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  async start(entries, options) {
    if (this.job) throw Error('A board operation is already running.');
    if (
      !options ||
      !['neochrom', 'software'].includes(options.renderer) ||
      ![30, 60].includes(options.fps) ||
      ![0, 32, 128, 512, 2048].includes(options.terrainCacheKiB ?? 0) ||
      (options.inputMonitor !== undefined && typeof options.inputMonitor !== 'boolean')
    )
      throw Error('Invalid board build options.');
    const files = normalizeFiles(entries);
    if (JSON.parse(files.get('ports/board.json')?.toString() || '{}').board !== 'stm32h7s78-dk')
      throw Error('Configure STM32H7S78-DK in Target guidance first.');
    const id = randomUUID();
    this.job = id;
    try {
      const caps = await this.capabilities();
      if (this.job !== id || this.cancelledJob === id) throw Error('Build cancelled.');
      for (const name of ['python', 'cmake', 'ninja', 'git'])
        if (!caps.tools[name]) throw Error(`Missing ${name}. Install the board build tools.`);
      await this.stopMonitor();
      this.logs = '';
      this.build = null;
      this.status('building', 'Compiling firmware. First build downloads the pinned board SDK.');
      this.task = this.buildFirmware(id, files, options, caps)
        .catch((e) => {
          if (this.cancelledJob !== id) this.status('error', e.message);
        })
        .finally(() => {
          if (this.job === id) this.job = null;
        });
      return { id };
    } catch (e) {
      if (this.job === id) this.job = null;
      throw e;
    }
  }
  async buildFirmware(id, files, options, caps) {
    const ui = path.join(this.root, 'workspace/ui'),
      out = path.join(this.root, 'firmware', options.renderer + '-' + options.fps);
    await fs.mkdir(ui, { recursive: true });
    // The application owns this workspace. Remove stale exported files, preserving mtimes for unchanged inputs.
    const manifest = path.join(this.root, 'workspace-files.json');
    const previous = JSON.parse(await fs.readFile(manifest, 'utf8').catch(() => '[]'));
    for (const name of previous)
      if (!files.has(name)) await fs.rm(path.join(ui, name), { force: true });
    for (const [name, bytes] of files) {
      const target = path.join(ui, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const old = await fs.readFile(target).catch(() => null);
      if (!old?.equals(bytes)) await fs.writeFile(target, bytes);
    }
    await atomicWrite(manifest, JSON.stringify([...files.keys()]));
    if (this.job !== id || this.cancelledJob === id) throw Error('Build cancelled.');
    const args = [
      this.script,
      '--ui',
      ui,
      '--out',
      out,
      '--cache',
      this.sdkCache,
      '--renderer',
      options.renderer,
      '--fps',
      String(options.fps),
      '--terrain-cache-kib',
      String(options.terrainCacheKiB ?? 0),
    ];
    if (options.inputMonitor) args.push('--input-monitor');
    if (caps.config.toolchainBin) args.push('--toolchain-bin', caps.config.toolchainBin);
    await this.command(caps.tools.python, args, caps.config, 20 * 60 * 1000);
    if (this.job !== id || this.cancelledJob === id) throw Error('Build cancelled.');
    const report = JSON.parse(await fs.readFile(path.join(out, 'build-report.json'), 'utf8'));
    const hashes = {};
    for (const name of ['boot.bin', 'appli.bin'])
      hashes[name] = createHash('sha256')
        .update(await fs.readFile(path.join(out, 'build', name)))
        .digest('hex');
    this.build = { id, out, report, hashes, fingerprint: options.fingerprint };
    this.status('ready', 'Firmware built. Select the ST-LINK probe, then flash.', {
      build: this.build,
    });
  }
  async flash({ id, serial, installBoot }) {
    if (installBoot && this.build?.report?.hardwareInputs)
      throw Error('Hardware controller updates preserve the installed bootloader. Use an application-only update.');
    if (this.job) throw Error('A board operation is already running.');
    if (
      !this.build ||
      id !== this.build.id ||
      typeof serial !== 'string' ||
      !/^[a-z0-9]{8,64}$/i.test(serial) ||
      typeof installBoot !== 'boolean'
    )
      throw Error('Build the project and select a probe before flashing.');
    this.job = 'preflight';
    this.status('flashing', 'Checking selected probe and firmware…');
    try {
      await this.stopMonitor();
      const caps = await this.capabilities();
      if (!caps.tools.loader)
        throw Error('The STM32H7S78-DK external loader is missing from CubeProgrammer.');
      if (!(await this.scan()).some((p) => p.serial === serial))
        throw Error('The selected ST-LINK is no longer connected.');
      const build = this.build;
      const applicationBytes = (await fs.stat(path.join(build.out, 'build/appli.bin'))).size;
      if (!applicationBytes || applicationBytes > 128 * 1024 * 1024)
        throw Error('Application does not fit the DK external flash.');
      for (const name of ['boot.bin', 'appli.bin']) {
        const h = createHash('sha256')
          .update(await fs.readFile(path.join(build.out, 'build', name)))
          .digest('hex');
        if (h !== build.hashes[name])
          throw Error('Firmware changed on disk; rebuild before flashing.');
      }
      const unlockProbe = await this.acquire();
      this.job = 'flash';
      this.status('flashing', 'Connecting to selected ST-LINK…');
      this.task = (async () => {
        const connect = ['-c', 'port=SWD', `sn=${serial}`, 'mode=NORMAL'];
        const info = await this.command(caps.tools.programmer, connect, caps.config, 20000);
        if (!/Device\s+ID\s*:\s*0x0*485\b/i.test(strip(info)))
          throw Error(
            'The selected probe is not connected to an STM32H7R/S device. No image was written.',
          );
        await this.command(
          caps.tools.programmer,
          [
            ...connect,
            '-el',
            caps.tools.loader,
            '-w',
            path.join(build.out, 'build/appli.bin'),
            '0x70000000',
            '-v',
          ],
          caps.config,
          // Bound the deadline by image size, allowing slow SWD writes plus verify.
          Math.max(180000, 60000 + Math.ceil(applicationBytes / 32768) * 1000),
        );
        if (installBoot)
          await this.command(
            caps.tools.programmer,
            [...connect, '-w', path.join(build.out, 'build/boot.bin'), '0x08000000', '-v'],
            caps.config,
          );
        await this.command(caps.tools.programmer, [...connect, '-hardRst'], caps.config, 20000);
        this.status('flashed', 'Firmware programmed and verified. Starting live metrics…', {
          build,
        });
        this.job = null;
        await unlockProbe();
        await this.startMonitor(id, serial);
      })()
        .catch((e) => this.status('error', e.message))
        .finally(async () => {
          await unlockProbe();
          this.job = null;
        });
      return true;
    } catch (e) {
      this.job = null;
      this.status('error', e.message);
      throw e;
    }
  }
  async startMonitor(id, serial) {
    if (this.job) throw Error('Wait for the board operation to finish.');
    if (
      !this.build ||
      id !== this.build.id ||
      !/^0x[0-9a-f]+$/i.test(this.build.report.telemetryAddress) ||
      !/^[a-z0-9]{8,64}$/i.test(serial)
    )
      throw Error('Build firmware with telemetry and select a probe.');
    const activeBuild = this.build;
    await this.stopMonitor();
    const caps = await this.capabilities();
    if (!caps.tools.programmer) throw Error('STM32CubeProgrammer is missing.');
    const token = { id, serial, stopped: false };
    this.monitor = token;
    const poll = async () => {
      if (token.stopped) return;
      try {
        const reading = (async () => {
          const unlock = await this.acquire();
          try {
            return await this.run(
              caps.tools.programmer,
              [
                '-c',
                'port=SWD',
                `sn=${serial}`,
                'mode=HOTPLUG',
                '-r32',
                activeBuild.report.telemetryAddress,
                '0x30',
              ],
              { env: this.env(caps.config), timeout: 8000, maxBuffer: 1024 * 1024 },
            );
          } finally {
            await unlock();
          }
        })();
        token.pending = reading;
        const r = await reading;
        token.pending = null;
        if (token.stopped) return;
        const m = metrics(r.stdout);
        if (m) {
          if (token.uptime !== m.uptimeMs) {
            token.uptime = m.uptimeMs;
            token.changed = Date.now();
          }
          const stale = Date.now() - (token.changed || Date.now()) > 3000;
          this.emit({ type: 'metrics', ...m, stale });
          if (stale) {
            this.emit({
              type: 'monitor-message',
              message: 'Board telemetry stopped advancing. Check that the game is running.',
            });
            return (token.timer = setTimeout(poll, 1000));
          }
          this.status('monitoring', 'Live board measurements over ST-LINK.');
        } else
          this.emit({
            type: 'monitor-message',
            message:
              'Waiting for this firmware to publish telemetry. Check the board display/reset.',
          });
      } catch (e) {
        token.pending = null;
        if (!token.stopped) {
          this.emit({
            type: 'monitor-message',
            message: 'ST-LINK monitor disconnected: ' + e.message,
          });
          await this.stopMonitor();
          return;
        }
      }
      if (!token.stopped) token.timer = setTimeout(poll, 1000);
    };
    void poll();
    return true;
  }
  async stopMonitor() {
    if (this.monitor) {
      const token = this.monitor;
      token.stopped = true;
      clearTimeout(token.timer);
      this.monitor = null;
      await token.pending?.catch(() => {});
    }
  }
  async cancel() {
    if (this.phase === 'flashing') throw Error('Let flash verification finish.');
    this.cancelledJob = this.job;
    if (this.child) this.kill(this.child);
    await this.task?.catch(() => {});
    this.job = null;
    await this.stopMonitor();
    this.status('stopped', 'Board operation stopped.');
  }
  async dispose() {
    await this.stopMonitor();
    if (this.phase !== 'flashing' && this.child) this.kill(this.child);
  }
}
module.exports = { BoardService };
