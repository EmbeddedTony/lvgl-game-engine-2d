const path = require('node:path');
const { NativePlaytestService } = require('./service.cjs');

function registerNativePlaytest({ app, handle, getWindow }) {
  const service = new NativePlaytestService({
    sdkRoot: app.isPackaged
      ? path.join(process.resourcesPath, 'native-sdk')
      : path.resolve(__dirname, '../../.cache/native-sdk'),
    cacheRoot: path.join(app.getPath('userData'), 'Cache/native-playtest'),
    emit: (event) => {
      const window = getWindow();
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send('desktop:native-event', event);
    },
  });
  handle('desktop:native-capabilities', () => service.capabilities());
  handle('desktop:native-start', (request) => service.start(request));
  handle('desktop:native-control', (runId, command) => service.control(runId, command));
  handle('desktop:native-stop', (runId) => service.stop(runId));
  app.on('will-quit', () => service.dispose());
  return service;
}
module.exports = { registerNativePlaytest };
