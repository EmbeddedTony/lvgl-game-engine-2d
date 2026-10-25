import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { pngRgba } from '../../scripts/png';
import { generate } from '../exporter';
import { runtimeFiles } from '../runtime';
import { projectIdentity, validate, type Project } from '../model';
import { buildTileset, sliceSheet } from '../tilesets';
import {
  AutomationError,
  object,
  safeJson,
  textParam,
  type Parameters,
  type ProjectCommand,
} from '../automation/protocol';
export interface Context {
  desktopRoot: string;
  repoRoot: string;
  profileRoot: string;
  sdkRoot: string;
  boardScript: string;
  version: string;
  packaged?: boolean;
}
export const desktopModules = (ctx: Context) =>
  createRequire(path.join(ctx.desktopRoot, 'main.cjs'));
export function generated(p: Project) {
  const issues = validate(p);
  if (issues.some((i) => i.severity === 'error'))
    throw new AutomationError(
      'VALIDATION_FAILED',
      'Fix project errors before exporting or running.',
      { issues },
    );
  const result = generate(p, runtimeFiles);
  return {
    ...result,
    entries: Object.entries(result.files)
      .filter(([name]) => name.startsWith('ui/'))
      .map(([name, data]) => ({ path: name.slice(3), data })),
  };
}
export async function exportProject(ctx: Context, p: Project, params: Parameters) {
  const { exportFolder } = desktopModules(ctx)('./export-folder.cjs');
  const data = generated(p),
    parent = path.resolve(textParam(params, 'output'));
  await fs.mkdir(parent, { recursive: true });
  const result = await exportFolder(parent, data.entries, projectIdentity(p), {
    replaceModified: params.replaceModified === true,
  });
  if (!result.ok)
    throw new AutomationError(
      'CONFLICT',
      'Export conflicts with external edits. Review the listed files before using --replace-modified.',
      result,
    );
  return { ...result, stats: data.stats };
}
let stdinUsed = false;
export async function readText(file: string, max = 24 * 1024 * 1024) {
  if (file !== '-') {
    const stat = await fs.stat(file);
    if (stat.size > max)
      throw new AutomationError('INVALID_ARGUMENT', 'Input file exceeds the size limit.');
    return fs.readFile(file, 'utf8');
  }
  if (stdinUsed)
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'stdin can only supply one input per invocation.',
    );
  stdinUsed = true;
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const b = Buffer.from(chunk);
    bytes += b.length;
    if (bytes > max) throw new AutomationError('INVALID_ARGUMENT', 'stdin exceeds the size limit.');
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseJson(text: string, label: string): unknown {
  try {
    const value = JSON.parse(text);
    safeJson(value);
    return value;
  } catch (e) {
    if (e instanceof AutomationError) throw e;
    throw new AutomationError('INVALID_ARGUMENT', `${label} contains invalid JSON.`, {
      reason: (e as Error).message,
    });
  }
}
export async function expandCommand(c: ProjectCommand): Promise<ProjectCommand> {
  const p = c.params;
  if (c.command === 'code.set') {
    if (p.file !== undefined && p.text !== undefined)
      throw new AutomationError('INVALID_ARGUMENT', 'Use text or file, not both.');
    if (p.file !== undefined)
      return {
        command: 'code.set',
        params: { text: await readText(textParam(p, 'file'), 128 * 1024) },
      };
  }
  if (c.command.startsWith('asset.import-')) {
    const file = textParam(p, 'file');
    if ((await fs.stat(file)).size > 32 * 1024 * 1024)
      throw new AutomationError('INVALID_ARGUMENT', 'PNG file exceeds 32 MiB.');
    const buffer = await fs.readFile(file);
    if (
      buffer.length > 32 * 1024 * 1024 ||
      buffer.length < 33 ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new AutomationError('INVALID_ARGUMENT', 'Use a PNG file up to 32 MiB.');
    const width = buffer.readUInt32BE(16),
      height = buffer.readUInt32BE(20),
      limit = c.command === 'asset.import-sprite' ? 512 : 2048;
    if (!width || !height || width > limit || height > limit)
      throw new AutomationError('INVALID_ARGUMENT', `Image must be within ${limit}×${limit}.`);
    const image = PNG.sync.read(buffer, { checkCRC: true });
    const id = textParam(p, 'id'),
      name = (p.name as string) ?? id;
    if (c.command === 'asset.import-sprite')
      return {
        command: 'resource.upsert',
        params: {
          resource: 'sprites',
          data: { id, name, width, height, pixels: Array.from(image.data) },
        },
      };
    const tileSize = (p.tileSize as number) ?? 32;
    const grid = sliceSheet(
      { width, height, pixels: image.data },
      {
        tileSize,
        marginX: (p.marginX as number) ?? 0,
        marginY: (p.marginY as number) ?? 0,
        spacingX: (p.spacingX as number) ?? 0,
        spacingY: (p.spacingY as number) ?? 0,
      },
    );
    const selected = (p.selected as number[] | undefined) ?? grid.tiles.map((_, i) => i);
    if (!selected.every((n) => Number.isInteger(n) && n >= 0 && n < grid.tiles.length))
      throw new AutomationError('INVALID_ARGUMENT', 'selected contains an invalid atlas cell.');
    return {
      command: 'resource.upsert',
      params: {
        resource: 'tilesets',
        data: buildTileset(name, tileSize, grid, new Set(selected), p.merge !== false, id),
      },
    };
  }
  return c;
}
export function boardService(ctx: Context) {
  const { BoardService } = desktopModules(ctx)('./board/service.cjs');
  return new BoardService({
    root: path.join(ctx.profileRoot, 'Board'),
    script: ctx.boardScript,
    sdkCache:
      process.env.LGE_BOARD_SDK_CACHE ||
      (ctx.packaged
        ? path.join(ctx.profileRoot, 'Cache/board-sdk')
        : path.join(ctx.repoRoot, '.cache')),
    emit: () => {},
  });
}
export function nativeService(ctx: Context, emit: (event: any) => void) {
  const { NativePlaytestService } = desktopModules(ctx)('./playtest/service.cjs');
  return new NativePlaytestService({
    sdkRoot: ctx.sdkRoot,
    cacheRoot: path.join(ctx.profileRoot, 'Cache/cli-native-playtest'),
    emit,
  });
}
interface Input {
  atMs: number;
  input?: number;
  pointer?: {
    x: number;
    y: number;
    down: boolean;
  };
  pause?: boolean;
}
function inputs(raw: unknown, p: Project, duration: number): Input[] {
  if (!Array.isArray(raw) || raw.length > 4096)
    throw new AutomationError('INVALID_ARGUMENT', 'Use up to 4096 timed input actions.');
  safeJson(raw);
  for (const value of raw) {
    const v = object(value);
    if (
      Object.keys(v).some((k) => !['atMs', 'input', 'pointer', 'pause'].includes(k)) ||
      !Number.isInteger(v.atMs) ||
      Number(v.atMs) < 0 ||
      Number(v.atMs) > duration
    )
      throw new AutomationError(
        'INVALID_ARGUMENT',
        'Input actions require atMs within the run duration.',
      );
    if (
      v.input !== undefined &&
      (!Number.isInteger(v.input) || Number(v.input) < 0 || Number(v.input) > 127)
    )
      throw new AutomationError('INVALID_ARGUMENT', 'Input bitmask must be 0–127.');
    if (v.pause !== undefined && typeof v.pause !== 'boolean')
      throw new AutomationError('INVALID_ARGUMENT', 'pause must be boolean.');
    if (v.pointer !== undefined) {
      const t = object(v.pointer);
      if (
        Object.keys(t).some((k) => !['x', 'y', 'down'].includes(k)) ||
        !Number.isInteger(t.x) ||
        !Number.isInteger(t.y) ||
        Number(t.x) < 0 ||
        Number(t.y) < 0 ||
        Number(t.x) >= p.width ||
        Number(t.y) >= p.height ||
        typeof t.down !== 'boolean'
      )
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Pointer needs integer in-display x/y and boolean down.',
        );
    }
  }
  return (raw as Input[]).slice().sort((a, b) => a.atMs - b.atMs);
}
export async function playtest(
  ctx: Context,
  p: Project,
  params: Parameters,
  log: (text: string) => void,
) {
  const seconds = (params.seconds as number) ?? 2,
    timeout = (params.timeoutMs as number) ?? 60000;
  if (
    seconds < 0.1 ||
    seconds > 120 ||
    timeout < 1000 ||
    timeout > 300000 ||
    !Number.isInteger(timeout)
  )
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'Use seconds 0.1–120 and timeout-ms 1000–300000.',
    );
  if ((params.scene && params.sequence) || (params.input && params.inputFile))
    throw new AutomationError('INVALID_ARGUMENT', 'Choose one start target and one input source.');
  const actions = inputs(
    params.inputFile
      ? parseJson(await readText(textParam(params, 'inputFile')), 'Input file')
      : (params.input ?? []),
    p,
    seconds * 1000,
  );
  const target = params.scene
    ? { kind: 'scene', id: params.scene }
    : params.sequence
      ? { kind: 'sequence', id: params.sequence }
      : { kind: 'entry' };
  if (
    (params.scene && !p.scenes.some((s) => s.id === params.scene)) ||
    (params.sequence && !p.flow?.sequences.some((s) => s.id === params.sequence))
  )
    throw new AutomationError('NOT_FOUND', 'Playtest start scene/sequence does not exist.');
  const data = generated(p),
    timers: ReturnType<typeof setTimeout>[] = [];
  const lockPath = path.join(ctx.profileRoot, 'Cache/cli-native-playtest/active.lock');
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const lock = await fs.open(lockPath, 'wx', 0o600).catch((e) => {
    if (e.code === 'EEXIST')
      throw new AutomationError(
        'CONFLICT',
        `A CLI playtest owns ${lockPath}. Stop that run first. If it crashed, inspect the lock before removing it.`,
      );
    throw e;
  });
  let lastFrame:
      | {
          width: number;
          height: number;
          pixels: Uint8Array;
        }
      | undefined,
    game: unknown,
    frames = 0,
    cached = false,
    logs = '',
    started = 0;
  // A silent audio driver still completes finite voices and honors pause. Gameplay
  // sees the same bounded voice lifecycle without needing an audio device in CI.
  const voices = new Map<
    number,
    {
      remaining: number;
      loop: boolean;
    }
  >();
  let audioPaused = false,
    audioTick = Date.now(),
    audioCommands = 0;
  const tickAudio = () => {
    const now = Date.now(),
      elapsed = now - audioTick;
    audioTick = now;
    if (audioPaused) return;
    for (const [voice, state] of voices)
      if (!state.loop) {
        state.remaining -= elapsed;
        if (state.remaining <= 0) {
          voices.delete(voice);
          service.control(service.session?.id, { op: 'complete', voice });
        }
      }
  };
  let resolve!: () => void, reject!: (e: unknown) => void;
  const complete = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Cancellation can arrive while asynchronous preflight/start is still pending.
  // Keep that early rejection handled; the original promise is awaited below.
  void complete.catch(() => {});
  const service = nativeService(ctx, (event) => {
    if (event.kind === 'frame') {
      lastFrame = {
        width: event.width,
        height: event.height,
        pixels: new Uint8Array(event.pixels),
      };
      frames++;
      service.control(event.runId, { op: 'frame-ack' });
    } else if (event.kind === 'game') game = event;
    else if (event.kind === 'audio') {
      tickAudio();
      audioCommands++;
      const c = event.command;
      if (c.op === 'play')
        voices.set(c.voice, {
          remaining: (p.audio.find((a) => a.id === c.cue)?.duration ?? 0) * 1000,
          loop: c.loop,
        });
      else if (c.op === 'stop') voices.delete(c.voice);
      else if (c.op === 'pause') audioPaused = c.paused;
    } else if (event.kind === 'log') logs = event.text;
    else if (event.kind === 'status') {
      log(event.message);
      logs = event.logs ?? logs;
      if (event.phase === 'error')
        reject(
          new AutomationError('EXECUTION_FAILED', event.message, {
            logs,
            diagnostics: event.diagnostics,
          }),
        );
      else if (event.phase === 'running') {
        started = Date.now();
        cached = !!event.cached;
        for (const action of actions)
          timers.push(
            setTimeout(() => {
              try {
                if (action.input !== undefined)
                  service.control(event.runId, { op: 'input', mask: action.input });
                if (action.pointer)
                  service.control(event.runId, { op: 'pointer', ...action.pointer });
                if (action.pause !== undefined)
                  service.control(event.runId, { op: 'pause', paused: action.pause });
              } catch (e) {
                reject(e);
              }
            }, action.atMs),
          );
        timers.push(setTimeout(resolve, seconds * 1000));
      } else if (event.phase === 'stopped')
        reject(
          new AutomationError('EXECUTION_FAILED', 'Game stopped before the requested duration.', {
            logs,
          }),
        );
    }
  });
  const cancel = () => reject(new AutomationError('CANCELLED', 'Playtest interrupted.'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  timers.push(
    setTimeout(
      () =>
        reject(
          new AutomationError('UNAVAILABLE', 'Playtest exceeded its build/run timeout.', { logs }),
        ),
      timeout,
    ),
  );
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, created: new Date().toISOString() }));
    const caps = await service.capabilities();
    if (!caps.available) throw new AutomationError('UNAVAILABLE', caps.reason);
    await service.start({ width: p.width, height: p.height, target, entries: data.entries });
    const audioTimer = setInterval(tickAudio, 16);
    timers.push(audioTimer);
    await complete;
    if (!lastFrame)
      throw new AutomationError('EXECUTION_FAILED', 'Native LVGL produced no frames.', { logs });
    let screenshot: string | undefined;
    if (params.screenshot) {
      screenshot = path.resolve(textParam(params, 'screenshot'));
      await fs.mkdir(path.dirname(screenshot), { recursive: true });
      await fs.writeFile(screenshot, pngRgba(lastFrame.width, lastFrame.height, lastFrame.pixels));
    }
    return {
      runtime: 'native-lvgl-c',
      cached,
      durationMs: Date.now() - started,
      frames,
      screenshot,
      game,
      audio: { mode: 'silent', commands: audioCommands, activeVoices: voices.size },
      logs,
    };
  } finally {
    timers.forEach(clearTimeout);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    try {
      await service.stop();
    } finally {
      await lock.close();
      await fs.rm(lockPath, { force: true });
    }
  }
}
export async function buildProject(
  ctx: Context,
  p: Project,
  params: Parameters,
  log: (text: string) => void,
) {
  if (p.board !== 'stm32h7s78-dk')
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'The build command currently supports the STM32H7S78-DK board profile. Generic MCU projects use export.',
    );
  const renderer = (params.renderer as string) ?? 'neochrom',
    fps = (params.fps as number) ?? 60,
    terrainCacheKiB = (params.terrainCacheKib as number) ?? 0,
    timeout = (params.timeoutMs as number) ?? 600000;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 1800000)
    throw new AutomationError('INVALID_ARGUMENT', 'Use timeout-ms 1000–1800000.');
  if (!['neochrom', 'software'].includes(renderer) || ![30, 60].includes(fps))
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'Renderer must be neochrom/software; FPS must be 30/60.',
    );
  if (![0, 32, 128, 512, 2048].includes(terrainCacheKiB))
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'Terrain cache must be 0, 32, 128, 512 or 2048 KiB.',
    );
  const output = path.resolve(textParam(params, 'output'));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output).catch((e) => {
    if (e.code === 'EEXIST')
      throw new AutomationError('CONFLICT', 'Use a new output directory for each build.');
    throw e;
  });
  const exported = await exportProject(ctx, p, { output: path.join(output, 'source') });
  const service = boardService(ctx),
    capabilities = await service.capabilities();
  const python = capabilities.tools.python;
  if (!python)
    throw new AutomationError('UNAVAILABLE', 'Python 3 is required for the board builder.');
  const args = [
    ctx.boardScript,
    '--ui',
    exported.path,
    '--out',
    output,
    '--renderer',
    renderer,
    '--fps',
    String(fps),
    '--terrain-cache-kib',
    String(terrainCacheKiB),
    '--cache',
    params.cache ? path.resolve(String(params.cache)) : service.sdkCache,
  ];
  if (params.debugSwd) args.push('--debug-swd');
  if (params.inputMonitor) args.push('--input-monitor');
  if (params.toolchainBin || capabilities.config.toolchainBin)
    args.push(
      '--toolchain-bin',
      path.resolve(String(params.toolchainBin || capabilities.config.toolchainBin)),
    );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, args, {
      env: service.env(capabilities.config),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let tail = '';
    const progress = (data: Buffer) => {
      tail = (tail + data).slice(-32768);
      log(data.toString().trimEnd());
    };
    child.stdout.on('data', progress);
    child.stderr.on('data', progress);
    let interrupted = false,
      timedOut = false,
      killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal);
      }
    };
    const stop = () => {
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 1500);
    };
    const cancel = () => {
      interrupted = true;
      stop();
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);
    const cleanup = () => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    child.once('error', (e) => {
      cleanup();
      reject(e);
    });
    child.once('close', (code, signal) => {
      cleanup();
      code === 0 && !timedOut && !interrupted
        ? resolve()
        : reject(
            new AutomationError(
              interrupted ? 'CANCELLED' : timedOut ? 'UNAVAILABLE' : 'EXECUTION_FAILED',
              interrupted
                ? 'Board build interrupted.'
                : timedOut
                  ? 'Board build exceeded its timeout.'
                  : 'Board build failed.',
              {
                code,
                signal,
                logs: tail,
                output,
              },
            ),
          );
    });
  });
  const reportPath = path.join(output, 'build-report.json');
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const artifacts: {
    path: string;
    bytes: number;
    sha256: string;
  }[] = [];
  for (const file of ['appli.bin', 'boot.bin']) {
    const absolute = path.join(output, 'build', file),
      bytes = await fs.readFile(absolute);
    artifacts.push({
      path: absolute,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return { output, reportPath, report, artifacts, programmed: false };
}
export async function debugBoard(ctx: Context, command: string, params: Parameters) {
  const caps = await boardService(ctx).capabilities();
  const module = desktopModules(ctx)('./board/debug-swd.cjs');
  return module.run(command, params, { programmer: caps.tools.programmer, png: pngRgba });
}
