const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const { Arch } = require('builder-util');
/** Runs before signing: executable helpers belong in the app's signed code tree. */
module.exports = async (context) => {
  const name = context.packager.appInfo.productFilename;
  let executable;
  let appRoot = context.appOutDir;
  if (context.electronPlatformName === 'darwin') {
    appRoot = path.join(context.appOutDir, name + '.app');
    const macOS = path.join(appRoot, 'Contents/MacOS');
    const arch =
      context.arch === Arch.arm64 ? 'arm64' : context.arch === Arch.x64 ? 'x86_64' : null;
    if (!arch) throw Error('Build individual Mac architectures before creating a universal app.');
    await execute('/usr/bin/clang', [
      '-std=c99',
      '-Os',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-arch',
      arch,
      '-mmacosx-version-min=13.0',
      '-DLGE_APP_EXECUTABLE=' + JSON.stringify(name),
      path.join(__dirname, '../native/cli-launcher.c'),
      '-o',
      path.join(macOS, 'lge'),
    ]);
    executable = path.join(macOS, name);
  } else if (context.electronPlatformName === 'win32') {
    executable = path.join(appRoot, name + '.exe');
    await fs.writeFile(
      path.join(appRoot, 'lge.cmd'),
      '@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0' +
        name +
        '.exe" "%~dp0resources\\app.asar\\desktop\\cli-runner.cjs" %*\r\n',
      'utf8',
    );
  } else {
    const binary = context.packager.executableName;
    executable = path.join(appRoot, binary);
    await fs.writeFile(
      path.join(appRoot, 'lge'),
      '#!/bin/sh\nLGE_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nELECTRON_RUN_AS_NODE=1 exec "$LGE_ROOT/' +
        binary +
        '" "$LGE_ROOT/resources/app.asar/desktop/cli-runner.cjs" "$@"\n',
      { mode: 0o755 },
    );
  }
  await fs.mkdir(path.resolve('.cache'), { recursive: true });
  await fs.writeFile(
    path.resolve('.cache/release-app.json'),
    JSON.stringify(
      {
        platform: context.electronPlatformName,
        arch: Arch[context.arch],
        executable,
        appRoot,
      },
      null,
      2,
    ),
  );
};
