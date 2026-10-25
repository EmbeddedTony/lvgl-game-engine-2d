import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { desktop, type InputDevicePicker } from '../../desktop';
import type { InputConfig } from '../model';
import {
  InputLineDecoder,
  InputMonitorSession,
  decodeInputReport,
  type InputSample,
} from './session';
import { connectBle, connectSerial, hardwareNavigator, type InputConnection } from './transports';
export type MonitorConnectionState = {
  phase: 'connecting' | 'connected' | 'disconnected' | 'error';
  label: string;
  transport: 'serial' | 'ble' | 'simulation';
};
interface Connection {
  controller: AbortController;
  connection?: InputConnection;
}
export function useInputMonitor(config: InputConfig) {
  const [session] = useState(() => new InputMonitorSession(config));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [connections, setConnections] = useState<Record<string, MonitorConnectionState>>({});
  const [picker, setPicker] = useState<InputDevicePicker | null>(null);
  const active = useRef(new Map<string, Connection>()),
    simulated = useRef(new Map<string, InputSample>()),
    mounted = useRef(true);
  const states = useRef(connections);
  states.current = connections;
  const mark = (id: string, state: MonitorConnectionState) => {
    if (mounted.current) setConnections((old) => ({ ...old, [id]: state }));
  };
  const disconnect = async (id: string) => {
    const c = active.current.get(id);
    active.current.delete(id);
    c?.controller.abort();
    for (const channel of session.config.channels.filter((c) => c.source === id))
      simulated.current.delete(channel.id);
    session.disconnect(id);
    mark(id, {
      phase: 'disconnected',
      label: 'Disconnected',
      transport: states.current[id]?.transport ?? 'simulation',
    });
    await c?.connection?.close();
  };
  useEffect(() => {
    session.configure(config);
    for (const id of active.current.keys())
      if (!config.sources.some((s) => s.id === id)) void disconnect(id);
    for (const [id, sample] of simulated.current) {
      const c = config.channels.find((c) => c.id === id);
      if (!c || (c.type === 'bool') !== (typeof sample.value === 'boolean'))
        simulated.current.delete(id);
    }
  }, [config, session]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = desktop?.onInputDevicePicker?.((request) =>
      setPicker(request.closed ? null : request),
    );
    const timer = setInterval(() => {
      const samplesBySource = new Map<string, InputSample[]>();
      for (const [id, sample] of simulated.current) {
        const c = session.config.channels.find((c) => c.id === id);
        if (!c) continue;
        const samples = samplesBySource.get(c.source) ?? [];
        samples.push(sample);
        samplesBySource.set(c.source, samples);
      }
      samplesBySource.forEach((samples, source) => session.publish(source, samples));
      session.tick();
    }, 50);
    session.tick();
    return () => {
      mounted.current = false;
      clearInterval(timer);
      unsubscribe?.();
      for (const c of active.current.values()) {
        c.controller.abort();
        void c.connection?.close();
      }
      active.current.clear();
      simulated.current.clear();
      void desktop?.inputDeviceSelect?.('serial', '');
      void desktop?.inputDeviceSelect?.('ble', '');
    };
  }, [session]);
  const connect = async (
    source: string,
    options: {
      transport: 'serial' | 'ble';
      baud: number;
      service: string;
      characteristic: string;
      format: 'text' | 'report';
    },
  ) => {
    await disconnect(source);
    const controller = new AbortController();
    const connection: Connection = { controller };
    active.current.set(source, connection);
    mark(source, { phase: 'connecting', label: 'Choose a device…', transport: options.transport });
    const decoder = new InputLineDecoder(session, source, options.transport === 'serial');
    const receive = (bytes: Uint8Array) => {
      if (active.current.get(source) !== connection || controller.signal.aborted) return;
      if (options.transport === 'serial' || options.format === 'text') decoder.feed(bytes);
      else decodeInputReport(session, source, bytes);
    };
    const ended = (message: string) => {
      if (active.current.get(source) !== connection) return;
      session.disconnect(source);
      controller.abort();
      active.current.delete(source);
      mark(source, { phase: 'disconnected', label: message, transport: options.transport });
    };
    try {
      // requestPort / requestDevice is reached directly from the click's async continuation.
      connection.connection =
        options.transport === 'serial'
          ? await connectSerial(
              hardwareNavigator(),
              options.baud,
              receive,
              ended,
              controller.signal,
            )
          : await connectBle(
              hardwareNavigator(),
              options.service,
              options.characteristic,
              receive,
              ended,
              controller.signal,
            );
      if (controller.signal.aborted || active.current.get(source) !== connection) {
        await connection.connection.close();
        return;
      }
      mark(source, {
        phase: 'connected',
        label: connection.connection.label,
        transport: options.transport,
      });
    } catch (error) {
      if (active.current.get(source) !== connection) return;
      active.current.delete(source);
      session.disconnect(source);
      mark(source, {
        phase: 'error',
        label: (error as Error).message,
        transport: options.transport,
      });
    }
  };
  const simulate = (sample: InputSample) => {
    const c = session.config.channels.find((c) => c.id === sample.id);
    if (!c) return;
    if (active.current.has(c.source)) return; // A synthetic value must not replace a connected device.
    simulated.current.set(c.id, sample);
    session.publish(c.source, [sample]);
    mark(c.source, { phase: 'connected', label: 'Simulated input', transport: 'simulation' });
  };
  const injectText = (source: string, text: string) => {
    if (active.current.has(source)) return false;
    const decoder = new InputLineDecoder(session, source);
    decoder.feed(new TextEncoder().encode(text.endsWith('\n') ? text : text + '\n'));
    return true;
  };
  const injectReport = (source: string, bytes: Uint8Array) =>
    !active.current.has(source) && decodeInputReport(session, source, bytes);
  const choose = async (id: string) => {
    if (picker) {
      await desktop?.inputDeviceSelect?.(picker.kind, id);
      setPicker(null);
    }
  };
  const cancelConnect = async (source: string) => {
    await choose('');
    await disconnect(source);
  };
  return {
    session,
    snapshot,
    connections,
    picker,
    choose,
    connect,
    disconnect,
    cancelConnect,
    simulate,
    injectText,
    injectReport,
  };
}
export type InputMonitorController = ReturnType<typeof useInputMonitor>;
