import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addInputPreset, makeInputChannel } from '../src/input/model';
import {
  InputMonitorSession,
  InputLineDecoder,
  decodeInputReport,
} from '../src/input/monitor/session';
import {
  connectSerial,
  connectBle,
  bluetoothUuid,
  type InputDeviceNavigator,
} from '../src/input/monitor/transports';
const setup = () => {
  const config = addInputPreset({ sources: [], channels: [] }, 'adc');
  config.channels.push(makeInputChannel('temperature', 'adc', 'float'));
  return new InputMonitorSession(config);
};
test('monitor keeps exact typed samples, latches short taps and expires by sample time', () => {
  const m = setup();
  assert(
    m.publish(
      'adc',
      [
        { id: 'adc_x', value: 4095 },
        { id: 'temperature', value: 23.5 },
      ],
      1000,
    ),
  );
  m.publish('adc', [{ id: 'adc_action', value: true }], 1001);
  m.publish('adc', [{ id: 'adc_action', value: false }], 1002);
  m.tick(1010);
  const r = m.getSnapshot().readings;
  assert.equal(r[0].normalized, 1);
  assert.equal(r[3].raw, 23.5);
  assert.equal(r[0].ageMs, 10);
  assert.deepEqual(
    m.drain(false, 1010).find((s) => s.id === 'adc_action'),
    { id: 'adc_action', value: false, pulse: true },
  );
  assert.equal(m.drain(false, 1011).length, 0);
  m.tick(1499);
  assert(m.getSnapshot().readings[0].active);
  m.tick(1500);
  assert(!m.getSnapshot().readings[0].active);
  assert.equal(m.getSnapshot().readings[0].normalized, 0);
  assert(!m.isSourceActive('adc', 1600));
  m.publish('adc', [{ id: 'adc_x', value: 0 }], 1601);
  m.tick(1601);
  assert.equal(m.getSnapshot().readings[0].normalized, -1);
  m.disconnect('adc');
  m.tick(1602);
  assert(!m.getSnapshot().readings[0].active);
  assert.equal(m.drain(true, 1602).length, 0);
});
test('malformed or cross-device batches never partially commit, history and ranges stay bounded', () => {
  const m = setup();
  assert(
    !m.publish(
      'adc',
      [
        { id: 'adc_x', value: 12 },
        { id: 'temperature', value: Infinity },
      ],
      1000,
    ),
  );
  assert(!m.publish('adc', [{ id: 'adc_x', value: 1.5 }], 1000));
  assert(!m.publish('other', [{ id: 'adc_x', value: 12 }], 1000));
  assert(
    !m.publish(
      'adc',
      [
        { id: 'adc_x', value: 1 },
        { id: 'adc_x', value: 2 },
      ],
      1000,
    ),
  );
  m.tick(1000);
  assert.equal(m.getSnapshot().readings[0].raw, null);
  for (let i = 0; i < 200; i++) {
    m.publish('adc', [{ id: 'adc_x', value: i }], 1000 + i * 50);
    m.tick(1000 + i * 50);
  }
  let r = m.getSnapshot().readings[0];
  assert.equal(r.low, 0);
  assert.equal(r.high, 199);
  assert.equal(r.history.length, 64);
  assert(r.hz <= 21);
  m.clearRange('adc_x');
  m.tick(12000);
  r = m.getSnapshot().readings[0];
  assert.equal(r.low, null);
  assert.equal(r.high, null);
});
test('fragmented serial and binary reports share atomic validation and firmware encodings', () => {
  const config = addInputPreset({ sources: [], channels: [] }, 'ble');
  config.sources[0].reportId = 7;
  config.channels.forEach((c) => c.wire.offset++);
  const m = new InputMonitorSession(config),
    decoder = new InputLineDecoder(m, 'ble');
  decoder.feed(new TextEncoder().encode('ble_x=40'), 1000);
  decoder.feed(new TextEncoder().encode('95\r\nble_action=true\n'), 1001);
  m.tick(1001);
  assert.equal(m.getSnapshot().readings[0].raw, 4095);
  assert(!decodeInputReport(m, 'ble', Uint8Array.of(8, 0, 0, 0, 0, 0), 1002));
  assert(!decodeInputReport(m, 'ble', Uint8Array.of(7, 0, 0), 1002));
  assert(decodeInputReport(m, 'ble', Uint8Array.of(7, 0, 8, 0, 4, 0), 1002));
  m.tick(1002);
  assert.equal(m.getSnapshot().readings[0].raw, 2048);
  assert(m.getSnapshot().readings[1].normalized > 0);
  decoder.feed(new TextEncoder().encode('x'.repeat(100) + 'ble_x=12\nble_x=2048\n'), 1003);
  m.tick(1003);
  assert.equal(m.getSnapshot().readings[0].raw, 2048);
  assert(m.getSnapshot().rejected >= 3);
});
test('live calibration and smoothing can change while acquiring without dropping the connection', () => {
  const m = setup();
  m.publish('adc', [{ id: 'adc_x', value: 2048 }], 1000);
  m.tick(1000);
  const changed = structuredClone(m.config);
  changed.channels[0].smoothingMs = 100;
  m.configure(changed);
  m.publish('adc', [{ id: 'adc_x', value: 4095 }], 1100);
  m.tick(1100);
  assert.equal(m.getSnapshot().readings[0].normalized, 0.5);
  changed.channels[0].invert = true;
  changed.channels[0].smoothingMs = 0;
  m.configure(changed);
  m.tick(1150);
  assert.equal(m.getSnapshot().readings[0].normalized, -1);
  m.disconnect('adc');
  m.tick(1151);
  assert.equal(m.getSnapshot().readings[0].normalized, 0);
});
test('serial transport reads arbitrary fragments and releases its reader on cancel', async () => {
  let feed!: ReadableStreamDefaultController<Uint8Array>;
  let closes = 0,
    opens = 0;
  const port = Object.assign(new EventTarget(), {
    readable: new ReadableStream<Uint8Array>({
      start(c) {
        feed = c;
      },
    }),
    async open(options: { baudRate: number }) {
      assert.equal(options.baudRate, 115200);
      opens++;
    },
    async close() {
      closes++;
    },
  });
  const api: InputDeviceNavigator = {
    serial: {
      async requestPort() {
        return port;
      },
    },
  };
  const received: Uint8Array[] = [];
  const abort = new AbortController();
  const connection = await connectSerial(
    api,
    115200,
    (b) => received.push(b),
    () => {},
    abort.signal,
  );
  feed.enqueue(Uint8Array.of(1, 2));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual([...received[0]], [1, 2]);
  await connection.close();
  await connection.close();
  assert.equal(closes, 1);
  assert.equal(opens, 1);
  assert(!port.readable.locked);
});
test('BLE selects an explicit service, handles view offsets and unsubscribes on disconnect', async () => {
  const value = new DataView(Uint8Array.of(99, 1, 2, 3, 99).buffer, 1, 3);
  let stopped = 0,
    disconnected = 0;
  const characteristic = Object.assign(new EventTarget(), {
    value,
    async startNotifications() {},
    async stopNotifications() {
      stopped++;
    },
  });
  const device = Object.assign(new EventTarget(), {
    name: 'Test controller',
    gatt: {
      connected: false,
      async connect() {
        this.connected = true;
        return {
          async getPrimaryService(id: string) {
            assert.equal(id, bluetoothUuid('180f'));
            return {
              async getCharacteristic(id: string) {
                assert.equal(id, bluetoothUuid('2a19'));
                return characteristic;
              },
            };
          },
        };
      },
      disconnect() {
        this.connected = false;
        disconnected++;
      },
    },
  });
  const api = {
    bluetooth: {
      async requestDevice(options: { filters: { services: string[] }[] }) {
        assert.deepEqual(options.filters, [{ services: [bluetoothUuid('180f')] }]);
        return device;
      },
    },
  } as InputDeviceNavigator;
  const received: number[][] = [];
  const connection = await connectBle(
    api,
    '180f',
    '2a19',
    (b) => received.push([...b]),
    () => {},
    new AbortController().signal,
  );
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.deepEqual(received, [[1, 2, 3]]);
  await connection.close();
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.equal(received.length, 1);
  assert.equal(stopped, 1);
  assert.equal(disconnected, 1);
  assert.throws(() => bluetoothUuid('bad-value'), /UUID/);
});

test('a disconnect followed by reconnect between UI frames still releases the previous C source first', () => {
  const m = setup();
  m.publish('adc', [{ id: 'adc_action', value: true }], 1000);
  m.tick(1000);
  m.drain(false, 1000);
  m.disconnect('adc');
  m.publish('adc', [{ id: 'adc_x', value: 4095 }], 1001);
  m.tick(1001);
  assert.deepEqual(m.drainResets(), ['adc']);
  assert.deepEqual(m.drainResets(), []);
  assert.deepEqual(m.drain(false, 1001), [{ id: 'adc_x', value: 4095 }]);
});
