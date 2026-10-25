import type { InputChannel } from '../model';
import { dkPin } from './pins';
export interface HardwarePin {
  channel: string;
  pin: string;
  kind: 'adc' | 'gpio';
  pull: 'none' | 'up' | 'down';
  activeLow: boolean;
  debounceMs: number;
}
export interface DkHardwareInputs {
  board: 'stm32h7s78-dk';
  version: 1;
  source: string;
  sampleHz: 50 | 100 | 200;
  factoryA4Routing: boolean;
  pins: HardwarePin[];
}
/** Wire identity excludes calibration, allowing live center/range capture.
 * Canonical fields make project JSON property order irrelevant. */
export function hardwareSignature(h: DkHardwareInputs) {
  const text = JSON.stringify([
    h.board,
    h.version,
    h.source,
    h.sampleHz,
    h.factoryA4Routing,
    h.pins.map((p) => [p.channel, p.pin, p.kind, p.pull, p.activeLow, p.debounceMs]),
  ]);
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function hardwareInputIssues(value: unknown, channels: readonly InputChannel[]): string[] {
  const h = value as DkHardwareInputs;
  if (
    !h ||
    typeof h !== 'object' ||
    h.board !== 'stm32h7s78-dk' ||
    h.version !== 1 ||
    typeof h.source !== 'string' ||
    ![50, 100, 200].includes(h.sampleHz) ||
    typeof h.factoryA4Routing !== 'boolean' ||
    !Array.isArray(h.pins) ||
    !h.pins.length ||
    h.pins.length > 10
  )
    return ['Invalid DK hardware profile.'];
  const errors: string[] = [],
    used = new Set<string>(),
    ids = new Set<string>();
  for (const mapping of h.pins) {
    if (!mapping || typeof mapping !== 'object') {
      errors.push('Invalid pin mapping.');
      continue;
    }
    const p = dkPin(mapping.pin),
      c = channels.find((c) => c.id === mapping.channel);
    if (!p || p.blocked)
      errors.push(`${mapping.pin}: ${p?.blocked ?? 'Not an exposed supported DK input pin.'}`);
    if (used.has(mapping.pin)) errors.push(`${mapping.pin} is assigned more than once.`);
    used.add(mapping.pin);
    if (ids.has(mapping.channel)) errors.push(`${mapping.channel} is assigned more than once.`);
    ids.add(mapping.channel);
    if (!c || c.source !== h.source || c.type !== (mapping.kind === 'adc' ? 'int' : 'bool'))
      errors.push(`${mapping.channel}: hardware mapping must match its channel type and source.`);
    if (
      !['adc', 'gpio'].includes(mapping.kind) ||
      !['none', 'up', 'down'].includes(mapping.pull) ||
      typeof mapping.activeLow !== 'boolean' ||
      !Number.isInteger(mapping.debounceMs) ||
      mapping.debounceMs < 0 ||
      mapping.debounceMs > 100
    )
      errors.push(`${mapping.channel}: invalid acquisition settings.`);
    if (
      mapping.kind === 'adc' &&
      (!p?.adc || mapping.pull !== 'none' || mapping.activeLow || mapping.debounceMs !== 0)
    )
      errors.push(`${mapping.pin}: choose an ADC-capable pin without pull resistors.`);
    if (p?.id === 'PF13' && !h.factoryA4Routing)
      errors.push('Confirm A4 factory solder routing before using PF13.');
    if (p?.builtIn && (mapping.kind !== 'gpio' || mapping.activeLow || mapping.pull !== 'down'))
      errors.push('B2 is active high and uses a pull-down.');
    const channelId = c?.id.toLowerCase();
    if (
      channelId?.startsWith('dk_touch_') ||
      channelId === 'dk_button' ||
      channelId === 'dk_uptime'
    )
      errors.push(`${c?.id} is reserved for board telemetry; choose a new channel ID.`);
  }
  return [...new Set(errors)];
}
