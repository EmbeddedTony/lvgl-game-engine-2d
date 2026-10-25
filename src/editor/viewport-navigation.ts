import type { GameNode } from '../model';
import { pixelZoom } from '../pixel-perfect';

export interface Point {
  x: number;
  y: number;
}
export interface ViewBounds extends Point {
  width: number;
  height: number;
}
export interface EditorView {
  zoom: number;
  pan: Point;
  automatic: boolean;
}
export const MIN_EDITOR_ZOOM = 1 / 128;
export const MAX_EDITOR_ZOOM = 8;

/** Overview scales are presentation only. Runtime pixel-perfect policy stays strict. */
export function editorZoom(value: number, ratio: number, pixels: boolean, fit = false) {
  const bounded = Math.max(MIN_EDITOR_ZOOM, Math.min(MAX_EDITOR_ZOOM, value));
  return pixels && bounded * ratio >= 1 ? pixelZoom(bounded, ratio, fit) : bounded;
}
export function editorZoomSteps(ratio: number, pixels: boolean) {
  const values = [1 / 128, 1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2];
  if (pixels) for (let i = 1; i <= Math.ceil(MAX_EDITOR_ZOOM * ratio); i++) values.push(i / ratio);
  else values.push(0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8);
  return [...new Set(values.filter((v) => v <= MAX_EDITOR_ZOOM))].sort((a, b) => a - b);
}
export function stepEditorZoom(current: number, direction: number, ratio: number, pixels: boolean) {
  const steps = editorZoomSteps(ratio, pixels);
  return direction > 0
    ? (steps.find((v) => v > current + 1e-6) ?? steps[steps.length - 1])
    : ([...steps].reverse().find((v) => v < current - 1e-6) ?? steps[0]);
}
/** CSS/physical grids must both align for Chromium's canvas composition. */
export function snapEditorPan(value: number, ratio: number, pixels: boolean) {
  if (!pixels) return value;
  const step =
    Array.from({ length: 64 }, (_, i) => i + 1).find(
      (v) => Math.abs(v * ratio - Math.round(v * ratio)) < 1e-5,
    ) ?? 1 / ratio;
  return Math.round(value / step) * step;
}
/** Keep the world point below the mouse fixed while changing the magnification. */
export function anchoredPan(
  point: Point,
  oldOrigin: Point,
  oldZoom: number,
  nextZoom: number,
  center: Point,
  display: { width: number; height: number },
): Point {
  return {
    x:
      point.x -
      (center.x - (display.width * nextZoom) / 2) -
      ((point.x - oldOrigin.x) / oldZoom) * nextZoom,
    y:
      point.y -
      (center.y - (display.height * nextZoom) / 2) -
      ((point.y - oldOrigin.y) / oldZoom) * nextZoom,
  };
}
export function sceneBounds(
  nodes: GameNode[],
  display: { width: number; height: number },
  selected?: string,
): ViewBounds {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const belongs = (n: GameNode) => {
    if (!selected) return true;
    for (let at: GameNode | undefined = n; at; at = at.parent ? byId.get(at.parent) : undefined)
      if (at.id === selected) return true;
    return false;
  };
  const content = nodes.filter(
    (n) => n.visible && !['group', 'instance'].includes(n.kind) && belongs(n),
  );
  if (!content.length && selected) {
    const n = byId.get(selected);
    if (n) return { x: n.x, y: n.y, width: Math.max(1, n.width), height: Math.max(1, n.height) };
  }
  let left = selected ? Infinity : 0,
    top = selected ? Infinity : 0;
  let right = selected ? -Infinity : display.width,
    bottom = selected ? -Infinity : display.height;
  for (const n of content) {
    left = Math.min(left, n.x);
    top = Math.min(top, n.y);
    right = Math.max(right, n.x + n.width);
    bottom = Math.max(bottom, n.y + n.height);
  }
  return Number.isFinite(left)
    ? { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
    : { x: 0, y: 0, ...display };
}
