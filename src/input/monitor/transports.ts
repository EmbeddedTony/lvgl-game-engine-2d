/** Structural browser API types keep the editor independent of vendor BLE/serial SDKs. */
export interface SerialPortLike extends EventTarget {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
interface BluetoothCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
}
interface BluetoothDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(
        uuid: string,
      ): Promise<{ getCharacteristic(uuid: string): Promise<BluetoothCharacteristic> }>;
    }>;
    disconnect(): void;
  };
}
export interface InputDeviceNavigator {
  serial?: { requestPort(): Promise<SerialPortLike> };
  bluetooth?: {
    requestDevice(options: {
      filters: { services: string[] }[];
      optionalServices: string[];
    }): Promise<BluetoothDevice>;
  };
}
export interface InputConnection {
  label: string;
  close(): Promise<void>;
}
export type TransportSink = (bytes: Uint8Array) => void;
export const hardwareNavigator = () => navigator as unknown as InputDeviceNavigator;
/** No signal lines or board commands are written. Only incoming bytes are read. */
export async function connectSerial(
  api: InputDeviceNavigator,
  baudRate: number,
  receive: TransportSink,
  ended: (message: string) => void,
  signal: AbortSignal,
): Promise<InputConnection> {
  if (!api.serial)
    throw new Error(
      'USB serial is unavailable here. Use the desktop app or a browser with Web Serial.',
    );
  const port = await api.serial.requestPort();
  if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
  await port.open({ baudRate });
  if (!port.readable) {
    await port.close();
    throw new Error('This serial device has no readable stream.');
  }
  const reader = port.readable.getReader();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const close = () =>
    (closePromise ??= (async () => {
      closing = true;
      signal.removeEventListener('abort', abort);
      await reader.cancel().catch(() => {});
      await reading.catch(() => {});
      await port.close().catch(() => {});
    })());
  const abort = () => {
    void close();
  };
  const reading = (async () => {
    let endMessage = 'Serial connection closed.';
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        if (result.value && !closing) receive(result.value);
      }
    } catch (error) {
      endMessage = `Serial disconnected: ${(error as Error).message}`;
    } finally {
      reader.releaseLock();
      if (!closing) {
        ended(endMessage);
        void close();
      }
    }
  })();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) await close();
  return { label: `USB serial · ${baudRate} baud`, close };
}
const uuidPattern =
  /^(?:[0-9a-f]{4}|[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export function bluetoothUuid(value: string) {
  const text = value.trim().toLowerCase();
  if (!uuidPattern.test(text))
    throw new Error('Enter a 16-bit, 32-bit or full 128-bit Bluetooth UUID.');
  return text.length <= 8 ? text.padStart(8, '0') + '-0000-1000-8000-00805f9b34fb' : text;
}
export async function connectBle(
  api: InputDeviceNavigator,
  service: string,
  characteristic: string,
  receive: TransportSink,
  ended: (message: string) => void,
  signal: AbortSignal,
): Promise<InputConnection> {
  if (!api.bluetooth)
    throw new Error('BLE is unavailable here. Use the desktop app on a supported OS.');
  const serviceId = bluetoothUuid(service),
    characteristicId = bluetoothUuid(characteristic);
  const device = await api.bluetooth.requestDevice({
    filters: [{ services: [serviceId] }],
    optionalServices: [serviceId],
  });
  if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
  if (!device.gatt) throw new Error('The selected device does not expose a GATT connection.');
  let characteristicValue: BluetoothCharacteristic | undefined,
    closing = false;
  const onValue = () => {
    const value = characteristicValue?.value;
    if (value && !closing)
      receive(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  };
  const onDisconnect = () => {
    if (!closing) ended('BLE device disconnected.');
    void close();
  };
  const close = async () => {
    if (closing) {
      device.gatt?.disconnect();
      return;
    }
    closing = true;
    signal.removeEventListener('abort', abort);
    device.removeEventListener('gattserverdisconnected', onDisconnect);
    characteristicValue?.removeEventListener('characteristicvaluechanged', onValue);
    if (device.gatt?.connected) await characteristicValue?.stopNotifications().catch(() => {});
    device.gatt?.disconnect();
  };
  const abort = () => {
    void close();
  };
  signal.addEventListener('abort', abort, { once: true });
  device.addEventListener('gattserverdisconnected', onDisconnect);
  try {
    const server = await device.gatt.connect();
    if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
    const service = await server.getPrimaryService(serviceId);
    characteristicValue = await service.getCharacteristic(characteristicId);
    if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
    characteristicValue.addEventListener('characteristicvaluechanged', onValue);
    await characteristicValue.startNotifications();
    if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
    return { label: device.name ?? 'BLE controller', close };
  } catch (error) {
    await close();
    throw error;
  }
}
