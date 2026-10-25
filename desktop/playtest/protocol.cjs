/* Incremental fd-3 framing. A bounded queue avoids repeatedly copying partial large frames. */
const MAGIC = Buffer.from('LGP1');
const TYPES = { STATE: 1, FRAME: 2, AUDIO: 3, INPUTS: 4 };
const MAX_JSON = 16384;
class PacketDecoder {
  constructor(frameBytes, receive) {
    this.frameBytes = frameBytes;
    this.receive = receive;
    this.chunks = [];
    this.bytes = 0;
    this.header = null;
  }
  take(size) {
    const output = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const first = this.chunks[0],
        count = Math.min(first.length, size - offset);
      first.copy(output, offset, 0, count);
      offset += count;
      if (count === first.length) this.chunks.shift();
      else this.chunks[0] = first.subarray(count);
    }
    this.bytes -= size;
    return output;
  }
  push(chunk) {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    if (this.bytes > this.frameBytes + MAX_JSON + 65536)
      throw new Error('Native output exceeded the protocol buffer limit.');
    for (;;) {
      if (!this.header) {
        if (this.bytes < 12) return;
        const bytes = this.take(12);
        if (!bytes.subarray(0, 4).equals(MAGIC))
          throw new Error('Native output has an invalid protocol header.');
        const type = bytes.readUInt32LE(4),
          size = bytes.readUInt32LE(8);
        if (
          type === TYPES.FRAME
            ? size !== this.frameBytes
            : ![TYPES.STATE, TYPES.AUDIO, TYPES.INPUTS].includes(type) || size > MAX_JSON
        )
          throw new Error('Native output has an invalid packet size or type.');
        this.header = { type, size };
      }
      if (this.bytes < this.header.size) return;
      const { type, size } = this.header;
      this.header = null;
      const payload = this.take(size);
      this.receive(type, type === TYPES.FRAME ? payload : JSON.parse(payload.toString('utf8')));
    }
  }
}
function diagnosticLines(text, root) {
  return text
    .split('\n')
    .flatMap((line) => {
      const match = line.match(/^(.+?):(\d+):(\d+): (fatal error|error|warning): (.*)$/);
      if (!match) return [];
      return [
        {
          file: match[1].startsWith(root + '/') ? match[1].slice(root.length + 1) : match[1],
          line: Number(match[2]),
          column: Number(match[3]),
          severity: match[4] === 'warning' ? 'warning' : 'error',
          message: match[5],
        },
      ];
    })
    .slice(0, 100);
}
module.exports = { PacketDecoder, TYPES, diagnosticLines };
