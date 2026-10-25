import { makeNode, type GameNode } from '../model';

export type CheckpointStatus = 'none' | 'saving' | 'saved' | 'failed';
/** Transient view state; never serialized or included in the project's save schema.
 * Match the LVGL presenter: one rendered frame plus 160ms before synchronous IO. */
export class CheckpointFeedback {
  private phase: CheckpointStatus = 'none';
  private since = 0;
  private presented = false;
  constructor(private readonly now: () => number = () => performance.now()) {}

  get status(): CheckpointStatus {
    const lifetime = this.phase === 'saved' ? 3000 : this.phase === 'failed' ? 5000 : 0;
    if (lifetime && this.now() - this.since >= lifetime) this.phase = 'none';
    return this.phase;
  }
  notify(status: Exclude<CheckpointStatus, 'none'>): boolean {
    if (status === 'saving' && this.phase === 'saving')
      return this.presented && this.now() - this.since >= 160;
    this.phase = status;
    this.since = this.now();
    this.presented = false;
    return status !== 'saving';
  }
  markPresented() {
    if (this.phase === 'saving') this.presented = true;
  }
}

export function checkpointNodes(
  feedback: CheckpointFeedback | undefined,
  width: number,
  height: number,
): GameNode[] {
  const status = feedback?.status ?? 'none';
  if (status === 'none') return [];
  const x = 12,
    y = height >= 240 ? 78 : 8,
    w = Math.min(200, width - 24);
  const color = status === 'saved' ? '#b6e3b0' : status === 'failed' ? '#f5b1a1' : '#eac887';
  return [
    makeNode('rect', {
      id: 'checkpoint_notice',
      name: 'Checkpoint status',
      layer: 'ui',
      x,
      y,
      width: w,
      height: 44,
      color: '#162432',
    }),
    makeNode('label', {
      id: 'checkpoint_notice_text',
      name: 'Checkpoint status',
      layer: 'ui',
      x: x + 8,
      y: y + 5,
      width: w - 16,
      height: 36,
      color,
      text:
        status === 'saving'
          ? 'Saving...\nKeep power on'
          : status === 'saved'
            ? 'Saved\nSafe to power off'
            : 'Not saved\nTry a rest lamp',
    }),
  ];
}
