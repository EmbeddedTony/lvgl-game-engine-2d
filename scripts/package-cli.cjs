const fs = require('node:fs/promises');
const path = require('node:path');
/** electron-builder hook: use the bundled Node runtime; no system Node dependency. */
module.exports = async (context) => {
  if (context.electronPlatformName === 'darwin') {
    const macOS = path.join(
      context.appOutDir,
      context.packager.appInfo.productFilename + '.app/Contents/MacOS',
    );
    const launcher = path.join(macOS, 'lge');
    await fs.writeFile(
      launcher,
      '#!/bin/sh\nLGE_MACOS="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nELECTRON_RUN_AS_NODE=1 exec "$LGE_MACOS/LVGL Game Engine 2D" "$LGE_MACOS/../Resources/app.asar/desktop/cli-runner.cjs" "$@"\n',
      { mode: 0o755 },
    );
    await fs.chmod(launcher, 0o755);
  }
};
