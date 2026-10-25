import { useEffect } from 'react';
import type { InputConfig } from '../model';
import type { NativeControl } from '../../playtest/types';
import type { InputMonitorSession } from './session';
/** Forward only new samples; the C runtime owns calibration, hysteresis and timeouts. */
export function useInputGameBridge(
  session: InputMonitorSession | undefined,
  config: InputConfig | undefined,
  control: (command: NativeControl) => void,
  running: boolean,
  drive: boolean,
  stale: boolean,
) {
  useEffect(() => {
    if (!running || !session || !config) return;
    control({ op: 'input-monitor', enabled: true });
    return () => control({ op: 'input-monitor', enabled: false });
  }, [session, config, running, control]);
  useEffect(() => {
    if (!running || !session || !config || !drive || stale) return;
    const sentSources = new Set<string>();
    let full = true;
    const forward = () => {
      for (const source of session.drainResets()) {
        const device = config.sources.findIndex((s) => s.id === source);
        if (device >= 0) control({ op: 'physical-disconnect', device });
        sentSources.delete(source);
      }
      const blockedSource =
        config.hardware && !session.hardwareReady() ? config.hardware.source : undefined;
      const samples = session
        .drain(full)
        .filter((s) => config.channels.find((c) => c.id === s.id)?.source !== blockedSource);
      full = false;
      if (samples.length) {
        control({
          op: 'physical-input',
          samples: samples.map((s) => {
            const index = config.channels.findIndex((c) => c.id === s.id);
            const c = config.channels[index];
            sentSources.add(c.source);
            return { channel: index, type: c.type, value: s.value, pulse: s.pulse };
          }),
        });
      }
      for (const source of sentSources)
        if (source === blockedSource || !session.isSourceActive(source)) {
          control({
            op: 'physical-disconnect',
            device: config.sources.findIndex((s) => s.id === source),
          });
          sentSources.delete(source);
        }
    };
    forward();
    const unsubscribe = session.subscribe(forward);
    return () => {
      unsubscribe();
      for (const source of sentSources)
        control({
          op: 'physical-disconnect',
          device: config.sources.findIndex((s) => s.id === source),
        });
    };
  }, [session, config, running, control, drive, stale]);
}
