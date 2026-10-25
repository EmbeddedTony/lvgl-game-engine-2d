/* Package a pinned LVGL host library once. End users compile only their generated game. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const COMMIT = 'c016f72d4c125098287be5e83c0f1abed4706ee5';
const MIN_MACOS = '13.0';
const ROOT = path.resolve(__dirname, '..');
const sdk = path.join(ROOT, '.cache/native-sdk');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe', timeout: 180000 });
async function copyHeaders(source, target) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory())
      await copyHeaders(path.join(source, entry.name), path.join(target, entry.name));
    else if (entry.name.endsWith('.h'))
      await fs.copyFile(path.join(source, entry.name), path.join(target, entry.name));
  }
}
(async () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    const expected = { win32: 'Windows', linux: 'Linux' }[process.platform];
    if (!expected || process.env.LGE_EXPERIMENTAL_PLATFORM !== expected)
      throw new Error(
        'Native SDK packaging currently targets macOS arm64. Experimental platform builds must opt in explicitly.',
      );
    await fs.rm(sdk, { recursive: true, force: true });
    await fs.mkdir(sdk, { recursive: true });
    const reason = `Native LVGL C playtesting is unavailable in this experimental ${expected} build. Use Play for preview, or export the ui folder.`;
    await fs.writeFile(
      path.join(sdk, 'sdk.json'),
      JSON.stringify(
        {
          version: 1,
          available: false,
          experimental: true,
          platform: process.platform,
          arch: process.arch,
          reason,
        },
        null,
        2,
      ),
    );
    await fs.writeFile(path.join(sdk, 'README.txt'), reason + '\n');
    console.log(reason);
    return;
  }
  const conf = await fs.readFile(path.join(ROOT, 'native/lv_conf.h'));
  const cmake = await fs.readFile(path.join(ROOT, 'native/CMakeLists.txt'));
  const fingerprint = digest(
    Buffer.concat([conf, cmake, Buffer.from(COMMIT + process.platform + process.arch + MIN_MACOS)]),
  );
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(sdk, 'sdk.json'), 'utf8'));
    if (
      manifest.fingerprint === fingerprint &&
      manifest.libraryHash === digest(await fs.readFile(path.join(sdk, 'liblvgl.a')))
    ) {
      await fs.copyFile(path.join(ROOT, 'native/host.c'), path.join(sdk, 'host.c'));
      console.log('Native LVGL SDK is ready (cached).');
      return;
    }
  } catch {}
  const source = process.env.LGE_LVGL_SOURCE || path.join(ROOT, '.cache/lvgl-9.4.0');
  try {
    await fs.access(source);
  } catch {
    await fs.mkdir(path.dirname(source), { recursive: true });
    run('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      'v9.4.0',
      'https://github.com/lvgl/lvgl.git',
      source,
    ]);
  }
  if (run('git', ['-C', source, 'rev-parse', 'HEAD']).toString().trim() !== COMMIT)
    throw new Error('Native SDK requires the pinned upstream LVGL v9.4.0 commit.');
  const build = path.join(ROOT, '.cache/native-sdk-build');
  run('cmake', [
    '-S',
    path.join(ROOT, 'native'),
    '-B',
    build,
    '-G',
    'Ninja',
    `-DLVGL_SOURCE=${source}`,
    '-DCMAKE_BUILD_TYPE=Release',
    `-DCMAKE_OSX_DEPLOYMENT_TARGET=${MIN_MACOS}`,
  ]);
  run('cmake', ['--build', build, '--target', 'lvgl', '-j', '6']);
  await fs.rm(sdk, { recursive: true, force: true });
  await fs.mkdir(sdk, { recursive: true });
  await copyHeaders(path.join(source, 'src'), path.join(sdk, 'include/src'));
  for (const name of ['lvgl.h', 'lv_version.h'])
    await fs.copyFile(path.join(source, name), path.join(sdk, 'include', name));
  await fs.copyFile(path.join(source, 'LICENCE.txt'), path.join(sdk, 'LVGL-LICENSE.txt'));
  for (const name of ['lv_conf.h', 'host.c'])
    await fs.copyFile(path.join(ROOT, 'native', name), path.join(sdk, name));
  await fs.copyFile(path.join(build, 'lvgl/lib/liblvgl.a'), path.join(sdk, 'liblvgl.a'));
  await fs.writeFile(
    path.join(sdk, 'sdk.json'),
    JSON.stringify(
      {
        version: 1,
        lvgl: '9.4.0',
        commit: COMMIT,
        platform: process.platform,
        arch: process.arch,
        minimumMacOS: MIN_MACOS,
        fingerprint,
        libraryHash: digest(await fs.readFile(path.join(sdk, 'liblvgl.a'))),
      },
      null,
      2,
    ),
  );
  console.log('Prepared offline native LVGL 9.4.0 SDK.');
})().catch((error) => {
  console.error(error.stderr?.toString() || error.message);
  process.exit(1);
});
