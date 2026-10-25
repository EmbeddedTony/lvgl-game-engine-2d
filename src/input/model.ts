/** Hardware descriptions stay separate from gameplay and from board drivers. */
import { hardwareInputIssues, type DkHardwareInputs } from './hardware/model';
export const inputBindings = [
  'none',
  'moveX',
  'moveY',
  'left',
  'right',
  'up',
  'down',
  'action',
  'interact',
  'menu',
] as const;
export const inputEncodings = [
  'none',
  'i8',
  'u8',
  'i16le',
  'u16le',
  'i32le',
  'f32le',
  'bit',
] as const;
export type InputType = 'int' | 'float' | 'bool';
export interface InputSource {
  id: string;
  name: string;
  kind: 'adc' | 'gpio' | 'serial' | 'ble' | 'custom';
  reportId?: number;
}
export interface InputChannel {
  id: string;
  name: string;
  source: string;
  type: InputType;
  binding: (typeof inputBindings)[number];
  min: number;
  center: number;
  max: number;
  deadzone: number;
  invert: boolean;
  smoothingMs: number;
  timeoutMs: number;
  pressThreshold: number;
  releaseThreshold: number;
  wire: { encoding: (typeof inputEncodings)[number]; offset: number; bit: number };
}
export interface InputConfig {
  sources: InputSource[];
  channels: InputChannel[];
  hardware?: DkHardwareInputs;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v);
const name = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('\0');
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
export function validInputs(value: unknown): value is InputConfig {
  if (
    !object(value) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.channels) ||
    value.sources.length > 8 ||
    value.channels.length > 32
  )
    return false;
  const sources = new Set<string>();
  for (const s of value.sources) {
    if (
      !object(s) ||
      !id(s.id) ||
      !name(s.name) ||
      !['adc', 'gpio', 'serial', 'ble', 'custom'].includes(s.kind as string) ||
      (s.reportId !== undefined && !integer(s.reportId, 0, 255)) ||
      sources.has(s.id.toUpperCase())
    )
      return false;
    sources.add(s.id.toUpperCase());
  }
  const channels = new Set<string>();
  for (const c of value.channels) {
    if (
      !object(c) ||
      !id(c.id) ||
      !name(c.name) ||
      !['int', 'float', 'bool'].includes(c.type as string) ||
      !value.sources.some((s) => s.id === c.source) ||
      !inputBindings.includes(c.binding as never) ||
      !number(c.min, -2147483648, 2147483647) ||
      !number(c.max, -2147483648, 2147483647) ||
      c.min >= c.max ||
      !number(c.center, c.min, c.max) ||
      (c.type === 'int' && ![c.min, c.center, c.max].every(Number.isInteger)) ||
      !number(c.deadzone, 0, 0.95) ||
      typeof c.invert !== 'boolean' ||
      !integer(c.smoothingMs, 0, 60000) ||
      !integer(c.timeoutMs, 0, 60000) ||
      !number(c.pressThreshold, 0.01, 1) ||
      !number(c.releaseThreshold, 0, c.pressThreshold - 0.001) ||
      !object(c.wire) ||
      !inputEncodings.includes(c.wire.encoding as never) ||
      !integer(c.wire.offset, 0, 63) ||
      !integer(c.wire.bit, 0, 7) ||
      channels.has(c.id.toUpperCase())
    )
      return false;
    // Generated calibration uses float32 on every supported MCU.
    if (!(Math.fround(c.min) < Math.fround(c.max))) return false;
    const encoding = c.wire.encoding;
    if (
      (encoding === 'bit' && c.type !== 'bool') ||
      (encoding === 'f32le' && c.type !== 'float') ||
      (c.type === 'bool' && encoding !== 'none' && encoding !== 'bit')
    )
      return false;
    const width =
      encoding === 'i32le' || encoding === 'f32le'
        ? 4
        : encoding === 'i16le' || encoding === 'u16le'
          ? 2
          : 1;
    if ((c.wire.offset as number) + width > 64) return false;
    if (c.type === 'bool' && ['moveX', 'moveY'].includes(c.binding as string)) return false;
    channels.add(c.id.toUpperCase());
  }
  return (
    value.hardware === undefined ||
    hardwareInputIssues(value.hardware, value.channels as InputChannel[]).length === 0
  );
}
export function makeInputChannel(
  id: string,
  source: string,
  type: InputType = 'int',
): InputChannel {
  return {
    id,
    name: id.replaceAll('_', ' '),
    source,
    type,
    binding: 'none',
    min: type === 'float' ? -1 : 0,
    center: type === 'int' ? 2048 : 0,
    max: type === 'int' ? 4095 : 1,
    deadzone: type === 'bool' ? 0 : 0.1,
    invert: false,
    smoothingMs: 0,
    timeoutMs: 500,
    pressThreshold: 0.6,
    releaseThreshold: 0.4,
    wire: { encoding: 'none', offset: 0, bit: 0 },
  };
}
/** Fixed wire IDs match the opt-in DK firmware bridge. Never silently rename them. */
export const dkMonitorIds = ['dk_touch_x', 'dk_touch_y', 'dk_touch_down', 'dk_button', 'dk_uptime'];
export function canAddDkMonitor(config: InputConfig) {
  return (
    config.sources.length < 8 &&
    config.channels.length <= 27 &&
    !config.channels.some((c) => dkMonitorIds.includes(c.id.toLowerCase()))
  );
}
export function addDkMonitorPreset(config: InputConfig): InputConfig {
  if (!canAddDkMonitor(config)) return config;
  let source = 'dk',
    suffix = 2;
  while (config.sources.some((s) => s.id.toLowerCase() === source)) source = 'dk_' + suffix++;
  const channels = dkMonitorIds.map((id, i) => {
    const c = makeInputChannel(id, source, i < 2 ? 'int' : i === 4 ? 'float' : 'bool');
    c.name = [
      'Touch X (centered when released)',
      'Touch Y (centered when released)',
      'Touch pressed',
      'Blue user button (B2)',
      'Board uptime (seconds)',
    ][i];
    c.timeoutMs = 1500;
    c.binding = i === 0 ? 'moveX' : i === 1 ? 'moveY' : i === 3 ? 'action' : 'none';
    if (i < 2) {
      c.min = 0;
      c.center = i === 0 ? 400 : 240;
      c.max = i === 0 ? 799 : 479;
      c.invert = i === 1;
    }
    if (i === 4) {
      c.min = 0;
      c.center = 0;
      c.max = 4294967;
      c.deadzone = 0;
    }
    return c;
  });
  return {
    ...config,
    sources: [...config.sources, { id: source, name: 'STM32H7S78-DK · ST-LINK', kind: 'serial' }],
    channels: [...config.channels, ...channels],
  };
}
/** Same calibration equation as the firmware, used only by the editor's test pad. */
export function previewInput(c: InputChannel, raw: number | boolean) {
  if (c.type === 'bool') return raw ? 1 : 0;
  const v = Number(raw),
    span = v >= c.center ? c.max - c.center : c.center - c.min;
  const n = Math.max(-1, Math.min(1, span > 0 ? (v - c.center) / span : 0));
  return (
    (c.invert ? -1 : 1) *
    (Math.abs(n) <= c.deadzone ? 0 : (Math.sign(n) * (Math.abs(n) - c.deadzone)) / (1 - c.deadzone))
  );
}
export function addInputPreset(config: InputConfig, kind: 'adc' | 'serial' | 'ble'): InputConfig {
  let id: string = kind;
  let suffix = 2;
  while (config.sources.some((s) => s.id.toUpperCase() === id.toUpperCase()))
    id = kind + '_' + suffix++;
  const unique = (base: string) => {
    let key = base,
      n = 2;
    while (config.channels.some((c) => c.id.toUpperCase() === key.toUpperCase()))
      key = base + '_' + n++;
    return key;
  };
  const channels: InputChannel[] = [];
  for (const [axis, binding, offset] of [
    ['x', 'moveX', 0],
    ['y', 'moveY', 2],
  ] as const) {
    const c = makeInputChannel(unique(id + '_' + axis), id);
    c.name = axis === 'x' ? 'Horizontal stick' : 'Vertical stick';
    c.binding = binding;
    c.invert = axis === 'y';
    if (kind !== 'adc') c.wire = { encoding: 'u16le', offset, bit: 0 };
    channels.push(c);
  }
  const button = makeInputChannel(unique(id + '_action'), id, 'bool');
  button.name = 'Action button';
  button.binding = 'action';
  if (kind !== 'adc') button.wire = { encoding: 'bit', offset: 4, bit: 0 };
  channels.push(button);
  return {
    ...config,
    sources: [
      ...config.sources,
      {
        id,
        name:
          kind === 'adc'
            ? 'ADC joystick + GPIO button'
            : kind === 'ble'
              ? 'BLE controller'
              : 'Serial controller',
        kind,
      },
    ],
    channels: [...config.channels, ...channels],
  };
}
/** Conservative bank + coherent report/poll snapshot + optional serial parser stack. */
export const inputRamBytes = (config?: InputConfig) =>
  config?.channels.length
    ? 96 +
      config.channels.length * 68 +
      (config.sources.some((s) => s.kind === 'serial') ? 100 : 0) +
      (config.hardware ? 1536 : 0)
    : 0;
