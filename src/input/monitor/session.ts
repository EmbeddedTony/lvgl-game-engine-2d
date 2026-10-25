import { previewInput, type InputChannel, type InputConfig } from '../model';
import { hardwareSignature } from '../hardware/model';
export interface InputSample {
  id: string;
  value: number | boolean;
  pulse?: boolean;
}
export interface InputReading {
  id: string;
  raw: number | boolean | null;
  normalized: number;
  active: boolean;
  ageMs: number | null;
  hz: number;
  low: number | null;
  high: number | null;
  history: number[];
}
export interface InputMonitorSnapshot {
  readings: InputReading[];
  accepted: number;
  rejected: number;
  error: string;
  hardwareProfiles: Record<string, { signature: string; ageMs: number }>;
}
interface Slot {
  raw: number | boolean | null;
  received: number;
  normalized: number;
  active: boolean;
  dirty: boolean;
  pulse: boolean;
  count: number;
  hz: number;
  low: number | null;
  high: number | null;
  history: number[];
}
const validValue = (channel: InputChannel, value: unknown): value is number | boolean =>
  channel.type === 'bool'
    ? typeof value === 'boolean'
    : typeof value === 'number' &&
      Number.isFinite(value) &&
      (channel.type === 'float'
        ? Number.isFinite(Math.fround(value))
        : Number.isInteger(value) && value >= -2147483648 && value <= 2147483647);
/** Bounded latest-value bank. Acquisition never schedules a React render per ADC sample. */
export class InputMonitorSession {
  config: InputConfig;
  private slots = new Map<string, Slot>();
  private listeners = new Set<() => void>();
  private resets = new Set<string>();
  private snapshot: InputMonitorSnapshot = {
    readings: [],
    accepted: 0,
    rejected: 0,
    error: '',
    hardwareProfiles: {},
  };
  private hardwareProfiles = new Map<string, { signature: string; received: number }>();
  private accepted = 0;
  private rejected = 0;
  private error = '';
  private lastTick: number | null = null;
  private rateAt: number | null = null;
  constructor(config: InputConfig) {
    this.config = config;
    this.configure(config);
  }
  configure(config: InputConfig) {
    const previous = this.config;
    this.config = config;
    const next = new Map<string, Slot>();
    for (const c of config.channels) {
      const old = previous.channels.find((p) => p.id === c.id);
      const same = old?.type === c.type && old.source === c.source;
      next.set(
        c.id,
        same && this.slots.has(c.id)
          ? this.slots.get(c.id)!
          : {
              raw: null,
              received: 0,
              normalized: 0,
              active: false,
              dirty: false,
              pulse: false,
              count: 0,
              hz: 0,
              low: null,
              high: null,
              history: [],
            },
      );
    }
    this.slots = next;
    for (const source of this.hardwareProfiles.keys())
      if (!config.sources.some((s) => s.id === source)) this.hardwareProfiles.delete(source);
    this.resets = new Set([...this.resets].filter((id) => config.sources.some((s) => s.id === id)));
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  hardwareReady(now = performance.now()) {
    const h = this.config.hardware;
    if (!h) return true;
    const p = this.hardwareProfiles.get(h.source);
    return !!p && p.signature === hardwareSignature(h) && now - p.received < 1500;
  }
  hardwareProfile(source: string, signature: string, now = performance.now()) {
    if (this.config.sources.some((s) => s.id === source) && /^[0-9a-f]{8}$/.test(signature)) {
      if (this.hardwareProfiles.get(source)?.signature !== signature) this.disconnect(source);
      this.hardwareProfiles.set(source, { signature, received: now });
    }
  }
  reject(message: string) {
    this.rejected++;
    this.error = message.slice(0, 180);
    return false;
  }
  publish(source: string, samples: InputSample[], now = performance.now()) {
    if (!samples.length || samples.length > 32)
      return this.reject('Empty or oversized input batch.');
    const seen = new Set<string>();
    for (const sample of samples) {
      const c = this.config.channels.find((c) => c.id === sample.id && c.source === source);
      if (!c || seen.has(c.id) || !validValue(c, sample.value))
        return this.reject(`Invalid channel or value: ${sample.id}.`);
      seen.add(c.id);
    }
    for (const sample of samples) {
      const c = this.config.channels.find((c) => c.id === sample.id)!;
      const s = this.slots.get(c.id)!;
      if (c.type === 'bool' && sample.value === true && s.raw !== true) s.pulse = true;
      s.raw = c.type === 'float' ? Math.fround(sample.value as number) : sample.value;
      s.received = now;
      s.dirty = true;
      s.count++;
      if (typeof s.raw === 'number') {
        s.low = s.low === null ? s.raw : Math.min(s.low, s.raw);
        s.high = s.high === null ? s.raw : Math.max(s.high, s.raw);
      }
      this.accepted++;
    }
    return true;
  }
  disconnect(source: string) {
    this.hardwareProfiles.delete(source);
    if (this.config.sources.some((s) => s.id === source)) this.resets.add(source);
    for (const c of this.config.channels)
      if (c.source === source) {
        const s = this.slots.get(c.id)!;
        s.received = -Infinity;
        s.active = false;
        s.normalized = 0;
        s.dirty = false;
        s.pulse = false;
      }
  }
  clearRange(id: string) {
    const s = this.slots.get(id);
    if (s) {
      s.low = s.high = null;
    }
  }
  /** One UI refresh per 50 ms. Monotonic clock and sample timestamps drive timeouts. */
  tick(now = performance.now()) {
    const elapsed = this.lastTick !== null ? Math.max(0, now - this.lastTick) : 50;
    this.lastTick = now;
    if (this.rateAt === null) this.rateAt = now;
    const rateElapsed = now - this.rateAt;
    const rates = rateElapsed >= 1000;
    const readings: InputReading[] = [];
    for (const c of this.config.channels) {
      const s = this.slots.get(c.id)!;
      const age = s.raw === null ? null : Math.max(0, now - s.received);
      const active =
        s.raw !== null && Number.isFinite(s.received) && (c.timeoutMs === 0 || age! < c.timeoutMs);
      const target = active ? previewInput(c, s.raw!) : 0;
      const alpha = c.smoothingMs ? elapsed / (c.smoothingMs + elapsed) : 1;
      s.normalized = active && s.active ? s.normalized + alpha * (target - s.normalized) : target;
      s.active = active;
      if (rates) {
        s.hz = (s.count * 1000) / rateElapsed;
        s.count = 0;
      }
      s.history.push(s.normalized);
      if (s.history.length > 64) s.history.shift();
      readings.push({
        id: c.id,
        raw: s.raw,
        normalized: s.normalized,
        active,
        ageMs: Number.isFinite(age) ? age : null,
        hz: s.hz,
        low: s.low,
        high: s.high,
        history: [...s.history],
      });
    }
    if (rates) this.rateAt = now;
    this.snapshot = {
      readings,
      accepted: this.accepted,
      rejected: this.rejected,
      error: this.error,
      hardwareProfiles: Object.fromEntries(
        [...this.hardwareProfiles]
          .filter(([s]) => this.config.sources.some((c) => c.id === s))
          .map(([s, p]) => [s, { signature: p.signature, ageMs: Math.max(0, now - p.received) }]),
      ),
    };
    this.listeners.forEach((fn) => fn());
  }
  /** Drain changed publications once. Never keep stale hardware alive by replaying its last value. */
  drainResets() {
    const sources = [...this.resets];
    this.resets.clear();
    return sources;
  }
  isSourceActive(source: string, now = performance.now()) {
    return this.config.channels.some((c) => {
      const s = this.slots.get(c.id)!;
      return (
        c.source === source &&
        s.raw !== null &&
        Number.isFinite(s.received) &&
        (c.timeoutMs === 0 || now - s.received < c.timeoutMs)
      );
    });
  }
  drain(full = false, now = performance.now()): InputSample[] {
    const samples: InputSample[] = [];
    for (const c of this.config.channels) {
      const s = this.slots.get(c.id)!;
      const active =
        s.raw !== null &&
        Number.isFinite(s.received) &&
        (c.timeoutMs === 0 || now - s.received < c.timeoutMs);
      if (active && s.raw !== null && (full || s.dirty))
        samples.push({ id: c.id, value: s.raw, ...(s.pulse ? { pulse: true } : {}) });
      s.dirty = s.pulse = false;
    }
    return samples;
  }
}
/** One bounded parser per stream; source guards prevent another device's channels being written. */
export class InputLineDecoder {
  private line = '';
  private dropping = false;
  constructor(
    private session: InputMonitorSession,
    private source: string,
    private allowHardwareIdentity = false,
  ) {}
  feed(data: Uint8Array, now = performance.now()) {
    for (const byte of data) {
      if (byte === 10) {
        if (!this.dropping && this.line) this.parse(this.line, now);
        else if (this.dropping)
          this.session.reject('Serial line exceeded 95 ASCII bytes or contained invalid data.');
        this.line = '';
        this.dropping = false;
      } else if (byte !== 13) {
        if (byte < 32 || byte > 126 || this.line.length >= 95) this.dropping = true;
        if (!this.dropping) this.line += String.fromCharCode(byte);
      }
    }
  }
  private parse(line: string, now: number) {
    const identity = line.match(/^@lge_hardware=([0-9a-f]{8})$/);
    if (identity && this.allowHardwareIdentity) {
      this.session.hardwareProfile(this.source, identity[1], now);
      return;
    }
    const at = line.indexOf('=');
    const id = line.slice(0, at),
      text = line.slice(at + 1);
    const c = this.session.config.channels.find((c) => c.id === id && c.source === this.source);
    // Optional board telemetry shares the UART with this authored controller.
    // Ignore those reserved fields without publishing across source boundaries.
    if (
      !c &&
      this.allowHardwareIdentity &&
      this.session.config.hardware?.source === this.source &&
      ['dk_touch_x', 'dk_touch_y', 'dk_touch_down', 'dk_button', 'dk_uptime'].includes(id)
    )
      return;
    if (at < 1 || !c) return this.session.reject('Unknown channel in serial line.');
    let value: number | boolean;
    if (c.type === 'bool') {
      if (!['true', 'false', '1', '0'].includes(text))
        return this.session.reject(`Expected boolean for ${id}.`);
      value = text === 'true' || text === '1';
    } else {
      if (
        !(c.type === 'int' ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).test(
          text,
        )
      )
        return this.session.reject(`Invalid ${c.type} for ${id}.`);
      value = Number(text);
    }
    return this.session.publish(this.source, [{ id, value }], now);
  }
}
export function decodeInputReport(
  session: InputMonitorSession,
  sourceId: string,
  bytes: Uint8Array,
  now = performance.now(),
) {
  const source = session.config.sources.find((s) => s.id === sourceId);
  if (
    !source ||
    !bytes.length ||
    bytes.length > 64 ||
    (source.reportId !== undefined && bytes[0] !== source.reportId)
  )
    return session.reject('Report length or report ID does not match this device.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples: InputSample[] = [];
  for (const c of session.config.channels.filter(
    (c) => c.source === sourceId && c.wire.encoding !== 'none',
  )) {
    const { offset, encoding, bit } = c.wire;
    const width = ['i32le', 'f32le'].includes(encoding)
      ? 4
      : ['u16le', 'i16le'].includes(encoding)
        ? 2
        : 1;
    if (offset + width > bytes.length) return session.reject(`Truncated report at ${c.id}.`);
    let value: number | boolean;
    switch (encoding) {
      case 'bit':
        value = !!(view.getUint8(offset) & (1 << bit));
        break;
      case 'i8':
        value = view.getInt8(offset);
        break;
      case 'u8':
        value = view.getUint8(offset);
        break;
      case 'i16le':
        value = view.getInt16(offset, true);
        break;
      case 'u16le':
        value = view.getUint16(offset, true);
        break;
      case 'i32le':
        value = view.getInt32(offset, true);
        break;
      case 'f32le':
        value = view.getFloat32(offset, true);
        break;
      default:
        continue;
    }
    samples.push({ id: c.id, value });
  }
  return session.publish(sourceId, samples, now);
}
