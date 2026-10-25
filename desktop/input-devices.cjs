/* Web Serial / Bluetooth selection for this editor window, with explicit user choice. */
function installInputDevices({ window }) {
  const contents = window.webContents,
    session = contents.session;
  const pending = new Map();
  const expectedUrl = require('node:url').pathToFileURL(
    require('node:path').join(__dirname, '../dist/index.html'),
  ).href;
  const trusted = (wc) =>
    wc === contents && !contents.isDestroyed() && contents.getURL() === expectedUrl;
  const permissions = new Set(['serial', 'bluetooth', 'bluetoothScanning']);
  session.setPermissionCheckHandler((wc, permission) => trusted(wc) && permissions.has(permission));
  session.setPermissionRequestHandler((wc, permission, callback) =>
    callback(trusted(wc) && permissions.has(permission)),
  );
  const publish = (kind) => {
    const request = pending.get(kind);
    if (!request || contents.isDestroyed()) return;
    contents.send('desktop:input-picker', { kind, devices: [...request.devices.values()] });
  };
  const finish = (kind, id = '') => {
    const request = pending.get(kind);
    if (!request) return false;
    if (id && !request.devices.has(id)) return false;
    pending.delete(kind);
    clearTimeout(request.timer);
    // A renderer can disappear while a native chooser is outstanding.
    try {
      request.callback(id);
    } catch {
      return false;
    }
    if (!contents.isDestroyed())
      contents.send('desktop:input-picker', { kind, devices: [], closed: true });
    return true;
  };
  const begin = (kind, items, callback) => {
    // Bluetooth discovery may re-emit an updated list for the same request.
    let request = pending.get(kind);
    if (!request) {
      request = { devices: new Map(), callback, timer: setTimeout(() => finish(kind), 60000) };
      pending.set(kind, request);
    } else request.callback = callback;
    request.devices = new Map(items.map((item) => [item.id, item]));
    publish(kind);
  };
  const serial = (event, ports, wc, callback) => {
    event.preventDefault();
    if (!trusted(wc)) return callback('');
    begin(
      'serial',
      ports.map((p) => ({ id: p.portId, name: p.displayName || p.portName || p.portId })),
      callback,
    );
  };
  const added = (_event, port) => {
    const r = pending.get('serial');
    if (r) {
      r.devices.set(port.portId, {
        id: port.portId,
        name: port.displayName || port.portName || port.portId,
      });
      publish('serial');
    }
  };
  const removed = (_event, port) => {
    pending.get('serial')?.devices.delete(port.portId);
    publish('serial');
  };
  const ble = (event, devices, callback) => {
    event.preventDefault();
    if (!trusted(contents)) return callback('');
    begin(
      'ble',
      devices.map((d) => ({ id: d.deviceId, name: d.deviceName || d.deviceId })),
      callback,
    );
  };
  session.on('select-serial-port', serial);
  session.on('serial-port-added', added);
  session.on('serial-port-removed', removed);
  contents.on('select-bluetooth-device', ble);
  const select = (kind, id) => {
    if (!['serial', 'ble'].includes(kind) || typeof id !== 'string' || id.length > 512)
      throw new Error('Invalid device selection.');
    return finish(kind, id);
  };
  contents.once('destroyed', () => {
    for (const kind of [...pending.keys()]) finish(kind);
    session.removeListener('select-serial-port', serial);
    session.removeListener('serial-port-added', added);
    session.removeListener('serial-port-removed', removed);
  });
  return { select };
}
module.exports = { installInputDevices };
