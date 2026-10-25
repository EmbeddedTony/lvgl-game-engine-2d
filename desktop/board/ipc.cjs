const path = require('node:path');
const { BoardService } = require('./service.cjs');
function registerBoard({ app, handle, getWindow }) {
  const service = new BoardService({
    root: path.join(app.getPath('userData'), 'Board'),
    script: app.isPackaged
      ? path.join(process.resourcesPath, 'board-tools/build-stm32h7s78.py')
      : path.resolve(__dirname, '../../scripts/build-stm32h7s78.py'),
    sdkCache:
      process.env.LGE_BOARD_SDK_CACHE ||
      (app.isPackaged
        ? path.join(app.getPath('userData'), 'Cache/board-sdk')
        : path.resolve(__dirname, '../../.cache')),
    emit: (event) => {
      const w = getWindow();
      if (w && !w.isDestroyed()) w.webContents.send('desktop:board-event', event);
    },
  });
  handle('desktop:board-capabilities', () => service.capabilities());
  handle('desktop:board-configure', (c) => service.configure(c));
  handle('desktop:board-scan', () => service.scan());
  handle('desktop:board-build', (entries, options) => service.start(entries, options));
  handle('desktop:board-flash', (r) => service.flash(r));
  handle('desktop:board-monitor', (id, serial) => service.startMonitor(id, serial));
  handle('desktop:board-stop-monitor', () => service.stopMonitor());
  handle('desktop:board-cancel', () => service.cancel());
  app.on('will-quit', () => void service.dispose());
  return service;
}
module.exports = { registerBoard };
