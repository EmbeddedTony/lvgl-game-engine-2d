const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installInputDevices } = require('../../desktop/input-devices.cjs');
const fixture = () => {
  const session = new EventEmitter();
  session.setPermissionCheckHandler = (fn) => (session.check = fn);
  session.setPermissionRequestHandler = (fn) => (session.request = fn);
  const contents = new EventEmitter();
  contents.session = session;
  contents.isDestroyed = () => false;
  contents.getURL = () => pathToFileURL(path.resolve('dist/index.html')).href;
  const events = [];
  contents.send = (...args) => events.push(args);
  return {
    session,
    contents,
    events,
    devices: installInputDevices({ window: { webContents: contents } }),
  };
};
test('device picker never auto-selects hardware, rejects foreign requests and cleans up on window close', () => {
  const { session, contents, devices, events } = fixture();
  let chosen;
  const event = { preventDefault() {} };
  session.emit(
    'select-serial-port',
    event,
    [{ portId: 'one', portName: 'Board UART' }],
    contents,
    (id) => (chosen = id),
  );
  assert.equal(chosen, undefined);
  assert.equal(events[0][1].devices[0].name, 'Board UART');
  assert(!devices.select('serial', 'unknown'));
  assert(devices.select('serial', 'one'));
  assert.equal(chosen, 'one');
  assert(session.check(contents, 'serial'));
  assert(!session.check(contents, 'geolocation'));
  assert(!session.check({}, 'serial'));
  let rejected;
  session.emit('select-serial-port', event, [], {}, (id) => (rejected = id));
  assert.equal(rejected, '');
  let cancelled;
  contents.emit(
    'select-bluetooth-device',
    event,
    [{ deviceId: 'ble', deviceName: 'Gamepad' }],
    (id) => (cancelled = id),
  );
  contents.emit('destroyed');
  assert.equal(cancelled, '');
  assert.equal(session.listenerCount('select-serial-port'), 0);
});
test('serial hotplug updates a pending picker and BLE discovery refreshes without duplicate callbacks', () => {
  const { session, contents, devices, events } = fixture();
  let called = 0;
  session.emit('select-serial-port', { preventDefault() {} }, [], contents, () => called++);
  session.emit('serial-port-added', {}, { portId: 'late', portName: 'USB UART' });
  assert.equal(events.at(-1)[1].devices.length, 1);
  session.emit('serial-port-removed', {}, { portId: 'late' });
  assert.equal(events.at(-1)[1].devices.length, 0);
  devices.select('serial', '');
  assert.equal(called, 1);
  const cb = () => called++;
  contents.emit('select-bluetooth-device', { preventDefault() {} }, [], cb);
  contents.emit(
    'select-bluetooth-device',
    { preventDefault() {} },
    [{ deviceId: 'x', deviceName: 'New controller' }],
    cb,
  );
  assert(devices.select('ble', 'x'));
  assert.equal(called, 2);
  contents.emit('destroyed');
});
