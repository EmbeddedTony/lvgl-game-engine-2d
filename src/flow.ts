import type { GameFlow, GameSequence, Issue, Project, SequenceStep } from './model';
import { resolveScene } from './scenes';
export const getFlow = (p: Project): GameFlow =>
  p.flow ?? {
    folders: [],
    sequences: [],
    entry: { kind: 'scene', id: p.scenes[0].id },
  };
export interface FlowCursor {
  sequence: string;
  step: string;
}
export interface FlowLocation {
  scene: string;
  cursor: FlowCursor | null;
  reload?: boolean;
}
export function sequenceStart(sequence: GameSequence): FlowLocation | null {
  const step = sequence.steps[0];
  return step ? { scene: step.scene, cursor: { sequence: sequence.id, step: step.id } } : null;
}
export function flowEntry(p: Project): FlowLocation {
  const flow = getFlow(p);
  if (flow.entry.kind === 'sequence') {
    const sequence = flow.sequences.find((s) => s.id === flow.entry.id);
    if (sequence) {
      const location = sequenceStart(sequence);
      if (location) return location;
    }
  }
  return { scene: flow.entry.kind === 'scene' ? flow.entry.id : p.scenes[0].id, cursor: null };
}
export function currentStep(p: Project, cursor: FlowCursor | null): SequenceStep | undefined {
  return cursor
    ? getFlow(p)
        .sequences.find((s) => s.id === cursor.sequence)
        ?.steps.find((s) => s.id === cursor.step)
    : undefined;
}
export function sequenceNext(p: Project, cursor: FlowCursor | null): FlowLocation | null {
  if (!cursor) return null;
  const sequence = getFlow(p).sequences.find((s) => s.id === cursor.sequence);
  const index = sequence?.steps.findIndex((s) => s.id === cursor.step) ?? -1;
  if (!sequence || index < 0) return null;
  const step =
    sequence.steps[index + 1] ?? (sequence.end === 'loop' ? sequence.steps[0] : undefined);
  if (step) return { scene: step.scene, cursor: { sequence: sequence.id, step: step.id } };
  return {
    scene: sequence.end === 'scene' ? sequence.endScene! : sequence.steps[index].scene,
    cursor: null,
    reload: sequence.end === 'scene',
  };
}
/** Structural/reference checks are also applied on import. Empty draft sequences can be saved. */
export function validFlow(p: Project): boolean {
  const f = p.flow;
  if (f === undefined) return p.scenes.every((s) => s.folder === undefined);
  const id = (v: unknown): v is string =>
    typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v);
  const named = (v: { id: string; name: string }) =>
    v && id(v.id) && typeof v.name === 'string' && v.name.length <= 128 && !v.name.includes('\0');
  const unique = (
    a: {
      id: string;
    }[],
  ) => new Set(a.map((x) => x.id)).size === a.length;
  if (
    !f ||
    !Array.isArray(f.folders) ||
    f.folders.length > 32 ||
    !f.folders.every(named) ||
    !unique(f.folders) ||
    !Array.isArray(f.sequences) ||
    f.sequences.length > 32 ||
    !f.sequences.every(named) ||
    !unique(f.sequences) ||
    !f.entry ||
    !['scene', 'sequence'].includes(f.entry.kind) ||
    !id(f.entry.id)
  )
    return false;
  const sceneExists = (v: unknown) => id(v) && p.scenes.some((s) => s.id === v);
  if (p.scenes.some((s) => s.folder !== undefined && !f.folders.some((g) => g.id === s.folder)))
    return false;
  if (
    f.entry.kind === 'scene'
      ? !sceneExists(f.entry.id)
      : !f.sequences.some((s) => s.id === f.entry.id)
  )
    return false;
  let steps = 0;
  for (const sequence of f.sequences) {
    if (
      !Array.isArray(sequence.steps) ||
      sequence.steps.length > 64 ||
      !['hold', 'loop', 'scene'].includes(sequence.end) ||
      (sequence.end === 'scene' && !sceneExists(sequence.endScene))
    )
      return false;
    for (const step of sequence.steps) {
      if (
        !step ||
        !id(step.id) ||
        !sceneExists(step.scene) ||
        !['manual', 'complete', 'click'].includes(step.advance)
      )
        return false;
      if (
        step.advance === 'click' &&
        !resolveScene(
          p,
          p.scenes.find((s) => s.id === step.scene)!,
        ).some((n) => n.id === step.button && n.kind === 'button')
      )
        return false;
      if (
        step.button !== undefined &&
        (typeof step.button !== 'string' ||
          step.button.length > 1024 ||
          !step.button.split('/').every(id))
      )
        return false;
    }
    if (!unique(sequence.steps)) return false;
    steps += sequence.steps.length;
  }
  return steps <= 256;
}
export function flowIssues(p: Project): Issue[] {
  if (!validFlow(p))
    return [
      {
        severity: 'error',
        message:
          'Game flow contains an invalid or missing scene, folder, sequence or button reference.',
      },
    ];
  const issues: Issue[] = [],
    f = getFlow(p);
  for (const seq of f.sequences) {
    if (!seq.steps.length)
      issues.push({
        severity: f.entry.kind === 'sequence' && f.entry.id === seq.id ? 'error' : 'warning',
        message: `${seq.name}: add a scene before running this sequence.`,
      });
    for (const [i, step] of seq.steps.entries()) {
      const scene = p.scenes.find((s) => s.id === step.scene)!;
      const nodes = resolveScene(p, scene);
      if (step.advance === 'complete' && !nodes.some((n) => n.effectiveVisible && n.collectible))
        issues.push({
          severity: 'warning',
          message: `${seq.name} / step ${i + 1}: ${scene.name} has no visible collectibles to trigger completion. Use a button or advance from C.`,
        });
      if (step.advance === 'click' && !nodes.find((n) => n.id === step.button)?.effectiveVisible)
        issues.push({
          severity: 'warning',
          message: `${seq.name} / step ${i + 1}: its advance button is hidden.`,
        });
    }
  }
  return issues;
}
export function sceneReferences(p: Project, id: string): string[] {
  const f = getFlow(p),
    refs: string[] = [];
  if (f.entry.kind === 'scene' && f.entry.id === id) refs.push('Game entry');
  for (const scene of p.scenes) {
    for (const node of scene.nodes)
      if (node.kind === 'instance' && node.scene === id)
        refs.push(`${scene.name} / ${node.name} instance`);
  }
  for (const seq of f.sequences) {
    if (seq.steps.some((s) => s.scene === id)) refs.push(seq.name);
    if (seq.end === 'scene' && seq.endScene === id) refs.push(`${seq.name} ending`);
  }
  return refs;
}
