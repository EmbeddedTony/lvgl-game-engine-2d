import { execFileSync } from 'node:child_process';
import type { Sheet } from '../src/tilesets';

/** Decode at native resolution. No resizing, palette reduction or image filtering. */
export function readSheet(file: string): Sheet {
  const bytes = execFileSync(
    'python3',
    [
      '-c',
      'from PIL import Image;import sys,struct;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',
      file,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return {
    width: bytes.readUInt32LE(0),
    height: bytes.readUInt32LE(4),
    pixels: new Uint8Array(bytes.subarray(8)),
  };
}
