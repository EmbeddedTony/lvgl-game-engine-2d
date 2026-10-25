import type { Project } from '../model';
import { resolveScene } from '../scenes';
/** One bounded directional overlap per target per swing; independent of RPG rules. */
export interface Melee {
  reach: number;
  width: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  mask: number;
  damage: number;
  lockMovement: boolean;
}
export const defaultMelee = (): Melee => ({
  reach: 32,
  width: 40,
  windupMs: 67,
  activeMs: 133,
  recoveryMs: 133,
  mask: 4,
  damage: 1,
  lockMovement: true,
});
export const attackTicks = (m: Melee) =>
  [m.windupMs, m.activeMs, m.recoveryMs].map((ms) => Math.max(1, Math.round((ms * 60) / 1000)));
export function meleeIssues(p: Project) {
  const errors: string[] = [];
  const int = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  for (const scene of p.scenes) {
    const nodes = resolveScene(p, scene);
    if (nodes.filter((n) => n.melee).length > 8)
      errors.push(`${scene.name}: use at most 8 melee actors per loaded scene.`);
    for (const n of nodes)
      if (n.melee !== undefined) {
        const m = n.melee;
        if (
          n.kind !== 'sprite' ||
          n.layer !== 'world' ||
          !m ||
          !int(m.reach, 1, 256) ||
          !int(m.width, 1, 256) ||
          ![m.windupMs, m.activeMs, m.recoveryMs].every((v) => int(v, 17, 2000)) ||
          !int(m.mask, 0, 255) ||
          !int(m.damage, 0, 9999) ||
          typeof m.lockMovement !== 'boolean'
        )
          errors.push(`${n.name}: invalid bounded melee component.`);
      }
  }
  return errors;
}
