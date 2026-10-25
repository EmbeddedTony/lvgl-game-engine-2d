import { familyById } from './catalog';

/** Planning assumptions only. These settings never configure firmware or a board port. */
export interface TargetConfig {
  family: string;
  enabled: boolean;
  ramKiB: number;
  nvmKiB: number;
  externalRamKiB: number;
  externalFlashKiB: number;
  sdMiB: number;
  buffers: 'partial' | 'single' | 'double';
  partialRows: number;
  bufferCount: 1 | 2;
  scanoutBuffers: 0 | 1 | 2;
  reserveRamKiB: number;
  reserveNvmKiB: number;
  decode: 'scanline' | 'full-image';
  audioBufferKiB: number;
  audioStorage: 'internal' | 'external-flash' | 'sd';
  fps: number;
  displayMbps: number; // Effective payload throughput; 0 means unknown, not nominal SPI clock.
  redrawPercent: number;
  effects: ('transforms' | 'blur' | 'vector-dsp')[];
  acceleration: ('dma2d' | 'graphics' | 'helium' | 'simd')[];
}
export function targetDefaults(family: string): TargetConfig {
  const profile = familyById(family);
  if (!profile) throw new Error('Unknown target family.');
  return {
    family,
    enabled: true,
    ramKiB: profile.ramKiB,
    nvmKiB: profile.nvmKiB,
    externalRamKiB: 0,
    externalFlashKiB: 0,
    sdMiB: 0,
    buffers: 'partial',
    partialRows: 40,
    bufferCount: 1,
    scanoutBuffers: 0,
    reserveRamKiB: 32,
    reserveNvmKiB: 128,
    decode: 'full-image',
    audioBufferKiB: 16,
    audioStorage: 'internal',
    fps: 30,
    displayMbps: 0,
    redrawPercent: 100,
    effects: [],
    acceleration: [],
  };
}
export function validTarget(t: unknown): t is TargetConfig {
  if (!t || typeof t !== 'object') return false;
  const v = t as Record<string, unknown>;
  const integer = (key: string, min: number, max: number) =>
    typeof v[key] === 'number' &&
    Number.isInteger(v[key]) &&
    Number(v[key]) >= min &&
    Number(v[key]) <= max;
  const members = (value: unknown, choices: string[]) =>
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((x) => choices.includes(x));
  return (
    typeof v.family === 'string' &&
    !!familyById(v.family) &&
    typeof v.enabled === 'boolean' &&
    [
      'ramKiB',
      'nvmKiB',
      'externalRamKiB',
      'externalFlashKiB',
      'reserveRamKiB',
      'reserveNvmKiB',
      'audioBufferKiB',
    ].every((k) => integer(k, 0, 16 * 1024 * 1024)) &&
    integer('sdMiB', 0, 1024 * 1024) &&
    integer('partialRows', 1, 2048) &&
    [1, 2].includes(v.bufferCount as number) &&
    [0, 1, 2].includes(v.scanoutBuffers as number) &&
    ['partial', 'single', 'double'].includes(v.buffers as string) &&
    ['scanline', 'full-image'].includes(v.decode as string) &&
    ['internal', 'external-flash', 'sd'].includes(v.audioStorage as string) &&
    integer('fps', 1, 240) &&
    integer('displayMbps', 0, 100000) &&
    integer('redrawPercent', 1, 100) &&
    members(v.effects, ['transforms', 'blur', 'vector-dsp']) &&
    members(v.acceleration, ['dma2d', 'graphics', 'helium', 'simd'])
  );
}
