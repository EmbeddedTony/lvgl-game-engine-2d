#!/usr/bin/env node
// Repository launcher. Packaged apps include a standalone launcher beside the executable.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const repoRoot = path.resolve(__dirname, '..');
const bundle = path.join(repoRoot, 'desktop/cli/entry.cjs');
// Check source mtimes, keeping development commands in sync without rebuilding every call.
const builtAt = fs.existsSync(bundle) ? fs.statSync(bundle).mtimeMs : 0;
const inputs = ['scripts/build-cli.cjs', 'scripts/cli-schema.cjs', 'scripts/png.ts', 'scripts/sync-board-sources.cjs'];
for (const dir of ['src', 'engine', 'ports']) {
  for (const file of fs.readdirSync(path.join(repoRoot, dir), { recursive: true }))
    if (/\.(?:tsx?|json|c|h|md)$/.test(file)) inputs.push(path.join(dir, file));
}
if (inputs.some((file) => fs.statSync(path.join(repoRoot, file)).mtimeMs > builtAt)) {
  const built = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/build-cli.cjs')], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (built.status !== 0) process.exit(built.status || 6);
}
require(path.join(repoRoot, 'desktop/cli-runner.cjs'))
  .run(process.argv.slice(2))
  .then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 6;
    },
  );
