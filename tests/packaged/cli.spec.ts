import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
test('standalone CLI runs without system Node, connects to the packaged editor and captures real native LVGL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-packaged-cli-'));
  const profile = join(root, 'profile'),
    file = join(root, 'Packaged.lge.json');
  const bundle = resolve('release/mac-arm64/LVGL Game Engine 2D.app/Contents/MacOS');
  const env = { ...process.env, PATH: '/usr/bin:/bin', LGE_PROFILE_DIR: profile };
  const cli = async (args: string[]) => {
    const result = await execute(join(bundle, 'lge'), args, {
      env,
      maxBuffer: 48 * 1024 * 1024,
      timeout: 40000,
    });
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    return JSON.parse(result.stdout);
  };
  let app;
  try {
    expect((await cli(['commands', '--query', 'project'])).data.commands.length).toBeGreaterThan(1);
    await cli(['project', 'create', '--project-path', file, '--name', 'Packaged CLI']);
    expect((await cli(['editor', 'sessions'])).data).toEqual([]);
    const text = await readFile(file, 'utf8');
    await mkdir(profile, { recursive: true });
    await writeFile(
      join(profile, 'recovery.json'),
      JSON.stringify({ text, path: file, dirty: false }),
    );
    app = await electron.launch({
      executablePath: join(bundle, 'LVGL Game Engine 2D'),
      args: [],
      env,
    });
    const page = await app.firstWindow();
    await expect(page.getByLabel('Undo', { exact: true })).toBeVisible();
    const result = await cli([
      'node',
      'create',
      '--project-path',
      file,
      '--scene',
      'main',
      '--kind',
      'rect',
      '--id',
      'hero',
      '--data',
      '{"player":true,"name":"CLI Hero","x":24,"y":40}',
      '--save',
    ]);
    expect(result.meta.source).toBe('editor');
    expect(result.meta.dirty).toBe(false);
    await expect(page.getByRole('button', { name: 'CLI Hero', exact: true })).toBeVisible();
    const screenshot = join(root, 'native.png');
    const run = await cli([
      'playtest',
      '--project-path',
      file,
      '--seconds',
      '0.3',
      '--input',
      '[{"atMs":0,"input":2}]',
      '--screenshot',
      screenshot,
    ]);
    expect(run.data.runtime).toBe('native-lvgl-c');
    expect(run.data.frames).toBeGreaterThan(1);
    expect((await readFile(screenshot)).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await cli(['export', '--project-path', file, '--output', join(root, 'firmware')]);
    expect(await readFile(join(root, 'firmware/ui/ui.c'), 'utf8')).toContain('ui_init');
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
