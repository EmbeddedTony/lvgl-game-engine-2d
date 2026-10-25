import type { Project } from '../model';
import { projectIdentity } from '../model';
import type { GameplaySession } from './runtime';
import { hashBytes } from './hash';
export { hashBytes } from './hash';
import { wrapPartySave, readPartySave } from '../rpg/save';
export function stateSchema(p: Project) {
  return hashBytes(
    new TextEncoder().encode(
      JSON.stringify([
        projectIdentity(p),
        (p.gameplay?.state ?? []).map((v) => [v.id, v.min, v.max, v.persistent]),
      ]),
    ),
  );
}
function saveStoryState(s: GameplaySession, p: Project): Uint8Array {
  const fields = p.gameplay?.state.filter((v) => v.persistent) ?? [],
    bytes = new Uint8Array(16 + fields.length * 4),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x3153474c, true);
  v.setUint32(4, stateSchema(p), true);
  v.setUint32(8, fields.length, true);
  fields.forEach((f, i) => v.setInt32(12 + i * 4, s.values[f.id], true));
  v.setUint32(bytes.length - 4, hashBytes(bytes.subarray(0, -4)), true);
  return bytes;
}
function restoreStoryState(s: GameplaySession, p: Project, bytes: Uint8Array): boolean {
  const fields = p.gameplay?.state.filter((v) => v.persistent) ?? [];
  if (bytes.length !== 16 + fields.length * 4) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    v.getUint32(0, true) !== 0x3153474c ||
    v.getUint32(4, true) !== stateSchema(p) ||
    v.getUint32(8, true) !== fields.length ||
    v.getUint32(bytes.length - 4, true) !== hashBytes(bytes.subarray(0, -4))
  )
    return false;
  if (
    fields.some((f, i) => {
      const n = v.getInt32(12 + i * 4, true);
      return n < f.min || n > f.max;
    })
  )
    return false;
  for (const f of p.gameplay?.state ?? []) s.values[f.id] = f.initial;
  fields.forEach((f, i) => {
    s.values[f.id] = v.getInt32(12 + i * 4, true);
  });
  return true;
}

export function saveState(s: GameplaySession, p: Project) {
  const story = saveStoryState(s, p);
  return s.rpg ? wrapPartySave(s, p, story) : story;
}
export function restoreState(s: GameplaySession, p: Project, b: Uint8Array) {
  return s.rpg
    ? readPartySave(s, p, b, (q) => restoreStoryState(s, p, q))
    : restoreStoryState(s, p, b);
}
