import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const project =
  process.argv[2] ??
  (existsSync('.local-examples/WillowlightH7-PackVillage/WillowlightH7-PackVillage.lge.json')
    ? '.local-examples/WillowlightH7-PackVillage/WillowlightH7-PackVillage.lge.json'
    : 'examples/WillowlightH7.lge.json');
const version = process.env.LGE_LVGL_VERSION ?? '9.4.0';
const source = process.env.LGE_LVGL_SOURCE ?? resolve(`.cache/lvgl-${version}`);
const generated = resolve('.cache/terrain-cache-test-generated');
const build = resolve(`.cache/terrain-cache-test-${version}`);
const run = (cmd: string, args: string[], env = process.env) =>
  execFileSync(cmd, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
run('npx', ['tsx', 'scripts/export-starter.ts', generated, project]);
run('cmake', [
  '-S',
  'tests/lvgl-h7',
  '-B',
  build,
  '-G',
  'Ninja',
  `-DLVGL_SOURCE=${source}`,
  `-DGENERATED_SOURCE=${generated}`,
  '-DCMAKE_BUILD_TYPE=Debug',
  '-DLGE_TEST_SANITIZERS=ON',
]);
run('cmake', ['--build', build, '-j', '6']);
const references = new Map<boolean, Buffer>();
const cases = [];
for (const [kib, rgb565, fade, atlas, sync] of [
  [0, false, false],
  [64, false, false],
  [3072, false, false],
  [32, true, false],
  [2048, true, false],
  [0, false, true],
  [2048, true, true],
  [32, true, false, true],
  [2048, true, false, true],
  [2048, true, true, true],
  [0, false, false, false, true],
  [2048, true, false, true, true],
] as const) {
  const tag = `${kib}-${rgb565 ? 'rgb565' : 'xrgb'}-${fade ? 'fade' : 'normal'}-${atlas ? 'atlas' : 'chunks'}-${sync ? 'sync' : 'timer'}`;
  const prefix = resolve(`.cache/terrain-cache-${version}-${tag}`);
  const output = run(
    resolve(build, 'lge_h7_host_test'),
    ['final', 'dialogue', 'right', 'left', 'sword', 'frames'].map(
      (name) => `${prefix}-${name}.${name === 'frames' ? 'rgb565' : 'ppm'}`,
    ),
    {
      ...process.env,
      LGE_TEST_CACHE_KIB: String(kib),
      ...(rgb565 ? { LGE_TEST_CACHE_RGB565: '1' } : {}),
      ...(fade ? { LGE_TEST_CACHE_FADE: '1' } : {}),
      ...(atlas ? { LGE_TEST_CACHE_ATLAS: '1' } : {}),
      ...(sync ? { LGE_TEST_REFRESH_SYNC: '1' } : {}),
    },
  );
  const pixels = readFileSync(`${prefix}-frames.rgb565`);
  const reference = references.get(fade);
  if (reference && !pixels.equals(reference))
    throw new Error(`Pixels changed with ${kib} KiB cache`);
  references.set(fade, pixels);
  cases.push({
    kib,
    rgb565,
    fade,
    atlas: !!atlas,
    sync: !!sync,
    frames: pixels.length / (800 * 480 * 2),
    sha256: createHash('sha256').update(pixels).digest('hex'),
    output: output.trim(),
  });
  console.log(output.trim());
}
mkdirSync('evidence', { recursive: true });
writeFileSync(
  `evidence/terrain-cache-native-${version}.json`,
  JSON.stringify(
    {
      project,
      version,
      method:
        'Full RGB565 frame streams: no cache, one-slot and DK budgets, XRGB8888/RGB565, translucent-parent fallback; C99/UBSan.',
      matchingSettingsByteIdentical: true,
      cases,
      limitations: 'Native LVGL software drawing; not a board FPS forecast.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Terrain cache ${version}: all frame streams identical across budgets.`);
