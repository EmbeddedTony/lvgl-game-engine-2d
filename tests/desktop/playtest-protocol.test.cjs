const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PacketDecoder, diagnosticLines } = require('../../desktop/playtest/protocol.cjs');
const packet = (kind, bytes) => {
  const header = Buffer.alloc(12);
  header.write('LGP1');
  header.writeUInt32LE(kind, 4);
  header.writeUInt32LE(bytes.length, 8);
  return Buffer.concat([header, bytes]);
};
test('native protocol survives fragmented/coalesced packets and preserves frame bytes', () => {
  const events = [],
    decoder = new PacketDecoder(64, (kind, data) => events.push({ kind, data }));
  const frame = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
  const bytes = Buffer.concat([
    packet(1, Buffer.from('{"paused":false}')),
    packet(2, frame),
    packet(3, Buffer.from('{"op":"stop","voice":42}')),
  ]);
  for (let i = 0; i < bytes.length; i += 7) decoder.push(bytes.subarray(i, i + 7));
  assert.deepEqual(events, [
    { kind: 1, data: { paused: false } },
    { kind: 2, data: frame },
    { kind: 3, data: { op: 'stop', voice: 42 } },
  ]);
});
test('native protocol rejects oversized frames, unknown kinds, corrupt JSON and invalid magic', () => {
  for (const bytes of [
    packet(2, Buffer.alloc(65)),
    packet(7, Buffer.alloc(1)),
    packet(1, Buffer.from('{bad}')),
    Buffer.alloc(12),
  ])
    assert.throws(() => new PacketDecoder(64, () => {}).push(bytes));
});
test('compiler diagnostics keep source locations without shell parsing', () => {
  const text =
    '/cache/ui/user/game_hooks.c:14:7: error: expected expression\n/cache/ui/ui.c:3:1: warning: unused variable\n2 errors generated.';
  assert.deepEqual(diagnosticLines(text, '/cache/ui'), [
    {
      file: 'user/game_hooks.c',
      line: 14,
      column: 7,
      severity: 'error',
      message: 'expected expression',
    },
    { file: 'ui.c', line: 3, column: 1, severity: 'warning', message: 'unused variable' },
  ]);
});
