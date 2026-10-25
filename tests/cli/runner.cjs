const path = require('node:path');
const repoRoot = path.resolve(__dirname, '../..');
const { profileDirectory } = require('../../desktop/automation/session.cjs');
require('../../desktop/cli/entry.cjs')
  .main(process.argv.slice(2), {
    desktopRoot: path.join(repoRoot, 'desktop'),
    repoRoot,
    profileRoot: profileDirectory(),
    sdkRoot: path.join(repoRoot, '.cache/native-sdk'),
    boardScript:
      process.env.LGE_TEST_BOARD_SCRIPT || path.join(repoRoot, 'scripts/build-stm32h7s78.py'),
    version: '0.2.0',
  })
  .then((code) => {
    process.exitCode = code;
  });
