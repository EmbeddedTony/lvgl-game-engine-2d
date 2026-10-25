import type { SpriteAsset } from './model';
export type ImagePacking = 'compact' | 'direct';
export function encodeRle(cells: number[]): number[] {
  const runs: number[] = [];
  for (let i = 0; i < cells.length;) {
    let count = 1;
    while (i + count < cells.length && cells[i + count] === cells[i] && count < 65535) count++;
    runs.push(count, cells[i]);
    i += count;
  }
  return runs;
}
export function decodeRle(runs: number[], length: number): number[] {
  const cells: number[] = [];
  if (runs.length % 2) throw new Error('Truncated RLE stream.');
  for (let i = 0; i < runs.length; i += 2) {
    if (
      !Number.isInteger(runs[i]) ||
      runs[i] <= 0 ||
      runs[i] > 65535 ||
      !Number.isInteger(runs[i + 1]) ||
      runs[i + 1] < 0 ||
      cells.length + runs[i] > length
    )
      throw new Error('Invalid RLE stream.');
    for (let j = 0; j < runs[i]; j++) cells.push(runs[i + 1]);
  }
  if (cells.length !== length) throw new Error('RLE length mismatch.');
  return cells;
}
export function packTilemap(cells: number[]) {
  const runs = encodeRle(cells);
  // Sparse cumulative cell offsets, one per 16 runs. No decompressed RAM map.
  const seek: number[] = [];
  if (runs.length / 2 > 16) {
    let offset = 0;
    for (let i = 0; i < runs.length; i += 2) {
      if (i % 32 === 0) seek.push(offset);
      offset += runs[i];
    }
  }
  const bytes = runs.length * 2 + seek.length * 4;
  return bytes < cells.length
    ? { codec: 'rle16' as const, data: runs, seek, bytes }
    : { codec: 'raw8' as const, data: cells, seek: [], bytes: cells.length };
}
export function resizeSprite(asset: SpriteAsset, width: number, height: number): SpriteAsset {
  if (asset.width === width && asset.height === height) return asset;
  const pixels: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset =
        (Math.floor((y * asset.height) / height) * asset.width +
          Math.floor((x * asset.width) / width)) *
        4;
      pixels.push(...asset.pixels.slice(offset, offset + 4));
    }
  return { ...asset, width, height, pixels };
}
export function packSprite(
  asset: SpriteAsset,
  policy: ImagePacking = 'compact',
): {
  format: string;
  data: number[];
  stride: number;
  rawBytes: number;
} {
  const palette: number[][] = [],
    indices: number[] = [];
  const colors = new Map<string, number>();
  for (let i = 0; policy === 'compact' && i < asset.pixels.length; i += 4) {
    const rgba = asset.pixels.slice(i, i + 4),
      key = rgba.join(',');
    if (!colors.has(key)) {
      colors.set(key, palette.length);
      palette.push(rgba);
    }
    indices.push(colors.get(key)!);
  }
  const rawBytes = asset.width * asset.height * 4;
  if (policy === 'compact' && palette.length <= 256) {
    const four = palette.length <= 16,
      capacity = four ? 16 : 256;
    const stride = four ? Math.ceil(asset.width / 2) : asset.width;
    const data: number[] = [];
    for (let i = 0; i < capacity; i++) {
      const [r, g, b, a] = palette[i] ?? [0, 0, 0, 0];
      data.push(b, g, r, a);
    }
    for (let y = 0; y < asset.height; y++)
      for (let x = 0; x < asset.width; x += four ? 2 : 1) {
        const first = indices[y * asset.width + x];
        data.push(
          four
            ? (first << 4) | (x + 1 < asset.width ? indices[y * asset.width + x + 1] : 0)
            : first,
        );
      }
    if (data.length < rawBytes) return { format: four ? 'I4' : 'I8', data, stride, rawBytes };
  }
  const data: number[] = [];
  for (let i = 0; i < asset.pixels.length; i += 4) {
    const [r, g, b, a] = asset.pixels.slice(i, i + 4);
    data.push(b, g, r, a);
  }
  // XRGB retains every source byte and channel precision. It tells the draw
  // backend that blending is unnecessary; translucent images retain ARGB.
  const opaque = policy === 'direct' && asset.pixels.every((v, i) => i % 4 !== 3 || v === 255);
  return { format: opaque ? 'XRGB8888' : 'ARGB8888', data, stride: asset.width * 4, rawBytes };
}
