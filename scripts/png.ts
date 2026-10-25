import { deflateSync } from 'node:zlib';
/** Dependency-free PNG writer for generated example sheets and test fixtures. */
export function pngRgba(width: number, height: number, pixels: ArrayLike<number>): Buffer {
  if (pixels.length !== width * height * 4) throw new Error('RGBA size mismatch.');
  const crc = (data: Buffer) => {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const tag = Buffer.from(type),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([tag, data])));
    return Buffer.concat([length, tag, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width * 4; x++)
      rows[y * (width * 4 + 1) + 1 + x] = pixels[y * width * 4 + x];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
