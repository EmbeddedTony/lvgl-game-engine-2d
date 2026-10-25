import type { GameNode, Project, Scene } from './model';
/** Scene world dimensions are independent of the display. Camera changes only drawing. */
export interface Camera2D {
  worldWidth: number;
  worldHeight: number;
  follow: string; // Resolved scene path, including instance prefixes.
  axis: 'x' | 'both';
}
export function validCamera2D(c: unknown): c is Camera2D {
  if (!c || typeof c !== 'object') return false;
  const v = c as Camera2D;
  return (
    [v.worldWidth, v.worldHeight].every((n) => Number.isInteger(n) && n >= 1 && n <= 4096) &&
    typeof v.follow === 'string' &&
    v.follow.length <= 1024 &&
    v.follow.split('/').every((id) => /^[a-zA-Z0-9_-]{1,64}$/.test(id)) &&
    ['x', 'both'].includes(v.axis)
  );
}
export function clampCamera2D(
  c: Camera2D | undefined,
  display: Pick<Project, 'width' | 'height'>,
  x: number,
  y: number,
) {
  return {
    x: Math.round(Math.max(0, Math.min(x, (c?.worldWidth ?? display.width) - display.width))),
    y: Math.round(Math.max(0, Math.min(y, (c?.worldHeight ?? display.height) - display.height))),
  };
}
export function cameraPosition2D(
  c: Camera2D | undefined,
  nodes: GameNode[],
  display: Pick<Project, 'width' | 'height'>,
) {
  const target = c && nodes.find((n) => n.id === c.follow);
  return clampCamera2D(
    c,
    display,
    target ? target.x + target.width / 2 - display.width / 2 : 0,
    target && c?.axis === 'both' ? target.y + target.height / 2 - display.height / 2 : 0,
  );
}
export function cameraNodes2D(nodes: GameNode[], position: { x: number; y: number }) {
  if (!position.x && !position.y) return nodes;
  return nodes.map((n) =>
    n.layer === 'world' ? { ...n, x: n.x - position.x, y: n.y - position.y } : n,
  );
}
export function cameraReferenceValid(scene: Scene, nodes: GameNode[]) {
  return (
    !scene.camera2d ||
    (validCamera2D(scene.camera2d) &&
      nodes.some((n) => n.id === scene.camera2d!.follow && n.layer === 'world'))
  );
}
