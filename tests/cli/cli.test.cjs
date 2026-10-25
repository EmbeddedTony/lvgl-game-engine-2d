const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PNG } = require('pngjs');
const execute = promisify(execFile),
  runner = path.resolve('tests/cli/runner.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'Game.lge.json'),
    profile = path.join(root, 'profile');
  async function cli(args, expected = 0, env = {}) {
    let r;
    try {
      r = await execute(process.execPath, [runner, ...args], {
        env: { ...process.env, LGE_PROFILE_DIR: profile, ...env },
        maxBuffer: 48 * 1024 * 1024,
        timeout: 65000,
      });
    } catch (e) {
      r = e;
    }
    assert.equal(r.code ?? 0, expected, r.stdout + '\n' + r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1, 'stdout must contain one JSON envelope');
    const json = JSON.parse(lines[0]);
    assert.equal(json.protocolVersion, 1);
    assert.equal(json.ok, expected === 0);
    return json;
  }
  await cli(['project', 'create', '--project-path', file, '--name', 'Agent test']);
  const command = (...args) => cli([...args, '--project-path', file]);
  return { root, file, profile, cli, command };
}
test('offline workflow uses revisions, backups, dry-run and all-or-nothing transactions', async (t) => {
  const { file, cli, command } = await fixture(t);
  const before = await fs.readFile(file, 'utf8');
  const status = await command('status');
  const rev = status.meta.revision;
  await cli([
    'node',
    'create',
    '--project-path',
    file,
    '--scene',
    'main',
    '--kind',
    'rect',
    '--id',
    'player',
    '--dry-run',
  ]);
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const bad = JSON.stringify({
    commands: [
      { command: 'node.create', params: { scene: 'main', id: 'player', kind: 'rect' } },
      {
        command: 'node.create',
        params: { scene: 'main', id: 'invalid', kind: 'sprite', data: { asset: 'no_such_asset' } },
      },
    ],
  });
  const rejected = await cli(['project', 'apply', '--project-path', file, '--params', bad], 3);
  assert.equal(rejected.error.code, 'VALIDATION_FAILED');
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const changed = await cli([
    'node',
    'create',
    '--project-path',
    file,
    '--scene',
    'main',
    '--kind',
    'rect',
    '--id',
    'player',
    '--expected-revision',
    rev,
  ]);
  assert.equal(await fs.readFile(changed.data.backup, 'utf8'), before);
  await cli(
    [
      'node',
      'update',
      '--project-path',
      file,
      '--scene',
      'main',
      '--id',
      'player',
      '--patch',
      '{"x":5}',
      '--expected-revision',
      rev,
    ],
    4,
  );
  assert.notEqual((await command('status')).meta.revision, rev);
  await cli(
    [
      'node',
      'update',
      '--project-path',
      file,
      '--scene',
      'main',
      '--id',
      'player',
      '--patch',
      '{"speeed":10}',
    ],
    2,
  );
});
test('PNG tileset import preserves native detail, deduplicates and paints a valid LVGL export', async (t) => {
  const { root, file, cli, command } = await fixture(t);
  const png = new PNG({ width: 16, height: 8 });
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++) {
      const at = (y * 16 + x) * 4;
      png.data.set([(x % 8) * 30, y * 30, 80, 255], at);
    }
  const image = path.join(root, 'sheet.png');
  await fs.writeFile(image, PNG.sync.write(png));
  await command('asset', 'import-tileset', '--file', image, '--id', 'terrain', '--tile-size', '8');
  const table = await command('resource', 'get', '--resource', 'tilesets', '--id', 'terrain');
  assert.equal(table.data.tiles.length, 1);
  assert.equal(table.data.tileSize, 8);
  assert.equal(table.data.tiles[0].pixels[4], 30);
  const compact = await command('resource', 'list', '--resource', 'tilesets');
  assert.equal(compact.data[0].tiles, undefined);
  assert.equal(compact.data[0].tileCount, 1);
  await command(
    'tilemap',
    'create',
    '--scene',
    'main',
    '--tileset',
    'terrain',
    '--id',
    'ground',
    '--columns',
    '4',
    '--rows',
    '3',
  );
  await command(
    'tilemap',
    'paint',
    '--scene',
    'main',
    '--id',
    'ground',
    '--cells',
    '[{"x":2,"y":1,"tile":1}]',
  );
  await command('validate');
  const output = path.join(root, 'firmware');
  const result = await command('export', '--output', output);
  assert.ok(
    (await fs.readFile(path.join(result.data.path, 'generated/game_data.c'), 'utf8')).includes(
      'ground',
    ),
  );
  const hooks = path.join(result.data.path, 'user/game_hooks.c');
  await fs.appendFile(hooks, '\n/* external change */\n');
  await command(
    'code',
    'set',
    '--text',
    (await command('code', 'get')).data.text + '\n/* editor change */\n',
  );
  const conflict = await cli(['export', '--project-path', file, '--output', output], 4);
  assert.ok(conflict.error.details.conflicts.includes('user/game_hooks.c'));
  assert.ok((await fs.readFile(hooks, 'utf8')).includes('external change'));
});
test('discovery, generated schemas, code files and named commands are machine-readable', async (t) => {
  const { root, file, cli, command } = await fixture(t);
  const manifest = await cli(['commands', '--query', 'node']);
  assert.ok(manifest.data.commands.some((c) => c.name === 'node.reparent'));
  const schema = await cli(['schema', '--type', 'GameNode']);
  assert.ok(schema.data.$defs.GameNode.properties.physics);
  assert.ok(schema.data.$defs.GameNode.required.includes('speed'));
  const discover = await cli(['schema']);
  assert.ok(discover.data.types.includes('RpgDatabase'));
  const api = await command('api', 'get');
  assert.match(api.data.text, /game_on_update/);
  const params = path.join(root, 'params.json');
  await fs.writeFile(
    params,
    JSON.stringify({ scene: 'main', id: 'hero', kind: 'rect', data: { player: true, speed: 100 } }),
  );
  await cli([
    'command',
    'node.create',
    '-projectPath',
    file,
    '--params-file',
    params,
    '-batchmode',
    '-quit',
  ]);
  assert.equal((await command('node', 'get', '--scene', 'main', '--id', 'hero')).data.speed, 100);
  await cli(['nonsense'], 2);
});
test('two agents using the same revision cannot overwrite each other', async (t) => {
  const { file, profile, command } = await fixture(t),
    revision = (await command('status')).meta.revision;
  const attempt = async (id) => {
    try {
      const r = await execute(
        process.execPath,
        [
          runner,
          'node.create',
          '--project-path',
          file,
          '--scene',
          'main',
          '--kind',
          'rect',
          '--id',
          id,
          '--expected-revision',
          revision,
        ],
        { env: { ...process.env, LGE_PROFILE_DIR: profile } },
      );
      return { code: 0, result: JSON.parse(r.stdout) };
    } catch (e) {
      return { code: e.code, result: JSON.parse(e.stdout) };
    }
  };
  const results = await Promise.all([attempt('first'), attempt('second')]);
  assert.deepEqual(results.map((r) => r.code).sort(), [0, 4]);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).scenes[0].nodes.length, 1);
});
test('headless playtest runs exported C and captures input-driven movement', async (t) => {
  const { root, command } = await fixture(t);
  const doctor = await command('doctor');
  if (!doctor.data.native.available) return t.skip(doctor.data.native.reason);
  await command(
    'node',
    'create',
    '--scene',
    'main',
    '--kind',
    'rect',
    '--id',
    'hero',
    '--data',
    '{"player":true,"x":24,"y":40,"speed":100}',
  );
  const screenshot = path.join(root, 'frame.png');
  const result = await command(
    'playtest',
    '--seconds',
    '0.6',
    '--input',
    '[{"atMs":0,"input":2},{"atMs":450,"input":0}]',
    '--screenshot',
    screenshot,
  );
  assert.equal(result.data.runtime, 'native-lvgl-c');
  assert.ok(result.data.frames > 2);
  assert.equal(result.data.game.scene, 'main');
  const frame = PNG.sync.read(await fs.readFile(screenshot));
  const green = [];
  for (let x = 0; x < frame.width; x++) {
    const i = (50 * frame.width + x) * 4;
    if (frame.data[i] === 129 && frame.data[i + 1] === 213) green.push(x);
  }
  assert.ok(Math.min(...green) > 45, `Expected the player to move right: ${green.slice(0, 5)}`);
  const cached = await command('playtest', '--seconds', '0.1');
  assert.equal(cached.data.cached, true);
  await command('code', 'set', '--text', '#include "ui.h"\nvoid this_will_not_compile( !!!');
  const invalid = await (async () => {
    const { execFile } = require('node:child_process');
    try {
      await promisify(execFile)(
        process.execPath,
        [
          runner,
          'playtest',
          '--project-path',
          path.join(root, 'Game.lge.json'),
          '--seconds',
          '0.1',
        ],
        { env: { ...process.env, LGE_PROFILE_DIR: path.join(root, 'profile') }, timeout: 60000 },
      );
      assert.fail('compile should fail');
    } catch (e) {
      assert.equal(e.code, 6);
      return JSON.parse(e.stdout);
    }
  })();
  assert.equal(invalid.error.code, 'EXECUTION_FAILED');
  assert.ok(invalid.error.details.logs.includes('error:'));
});
test('build routes through the board builder and reports artifacts without a programming command', async (t) => {
  const { root, file, cli } = await fixture(t);
  await fs.unlink(file);
  await cli([
    'project',
    'create',
    '--project-path',
    file,
    '--name',
    'Board build',
    '--board',
    'stm32h7s78-dk',
  ]);
  const script = path.join(root, 'fake-builder.py');
  await fs.writeFile(
    script,
    `import sys,json,pathlib\na=sys.argv[1:]\nout=pathlib.Path(a[a.index('--out')+1])\n(out/'build').mkdir()\n(out/'build'/'appli.bin').write_bytes(b'application')\n(out/'build'/'boot.bin').write_bytes(b'boot')\n(out/'build-report.json').write_text(json.dumps({'outputs':{'appli.bin':11,'boot.bin':4},'args':a}))\nprint('Building fixture')\n`,
  );
  const result = await cli(
    ['build', '--project-path', file, '--output', path.join(root, 'build'), '--fps', '60'],
    0,
    { LGE_TEST_BOARD_SCRIPT: script },
  );
  assert.equal(result.data.programmed, false);
  assert.equal(result.data.artifacts.length, 2);
  assert.equal(result.data.artifacts[0].bytes, 11);
  assert.match(result.data.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.data.report.args.includes('neochrom'));
  assert.ok(!result.data.report.args.some((a) => /^--?(w|flash|ob)(?:=|$)/.test(a)));
  const sleeping = path.join(root, 'slow-builder.py');
  await fs.writeFile(sleeping, 'import time\ntime.sleep(30)\n');
  const timeout = await cli(
    [
      'build',
      '--project-path',
      file,
      '--output',
      path.join(root, 'timed-out'),
      '--timeout-ms',
      '1000',
    ],
    5,
    { LGE_TEST_BOARD_SCRIPT: sleeping },
  );
  assert.equal(timeout.error.code, 'UNAVAILABLE');
  assert.match(timeout.error.message, /timeout/);
});
test('interrupting native playtest returns one result and releases its process/cache lock', async (t) => {
  const { file, profile, command } = await fixture(t);
  if (!(await command('doctor')).data.native.available) return t.skip('Native SDK unavailable.');
  const { spawn } = require('node:child_process');
  const child = spawn(
    process.execPath,
    [runner, 'playtest', '--project-path', file, '--seconds', '30'],
    { env: { ...process.env, LGE_PROFILE_DIR: profile }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    logs = '',
    sent = false;
  child.stdout.on('data', (b) => (stdout += b));
  child.stderr.on('data', (b) => {
    logs += b;
    if (!sent && logs.includes('Running your generated C')) {
      sent = true;
      child.kill('SIGINT');
    }
  });
  const guard = setTimeout(() => child.kill('SIGKILL'), 20000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  clearTimeout(guard);
  assert.equal(code, 130, stdout + '\n' + logs);
  assert.equal(JSON.parse(stdout).error.code, 'CANCELLED');
  assert.equal(
    await fs.access(path.join(profile, 'Cache/cli-native-playtest/active.lock')).then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal((await command('playtest', '--seconds', '0.1')).data.runtime, 'native-lvgl-c');
});
