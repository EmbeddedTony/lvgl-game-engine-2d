const path = require('node:path');
const fs = require('node:fs');
const { profileDirectory } = require('./automation/session.cjs');
function run(argv) {
  const repoRoot = path.resolve(__dirname, '..');
  const packaged = path.basename(repoRoot) === 'app.asar';
  const resources = path.dirname(repoRoot);
  return require('./cli/entry.cjs').main(argv, {
    desktopRoot: __dirname,
    repoRoot,
    profileRoot: profileDirectory(),
    packaged,
    sdkRoot:
      process.env.LGE_NATIVE_SDK ||
      (packaged ? path.join(resources, 'native-sdk') : path.join(repoRoot, '.cache/native-sdk')),
    boardScript: packaged
      ? path.join(resources, 'board-tools/build-stm32h7s78.py')
      : path.join(repoRoot, 'scripts/build-stm32h7s78.py'),
    version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version,
  });
}
module.exports = { run };
if (require.main === module)
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 6;
    },
  );
