import type { GameNode } from './model';

export type BodyType = 'none' | 'static' | 'character' | 'area' | 'platform';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Physics {
  body: BodyType;
  /** null follows the visual size. A custom box is local to the node. */
  box: Box | null;
  layer: number;
  mask: number;
  motion: 'topdown' | 'platformer' | 'code' | 'grid';
  gridSize?: number;
  oneWay?: boolean;
  /** Floor-only linear ramp, evaluated under the character's feet. */
  slope?: 'up' | 'down';
  /** Relative endpoint; duration is one leg. Omit for velocity/code control. */
  travel?: { x: number; y: number; durationMs: number };
  coyoteMs?: number;
  bufferMs?: number;
  gravity: number;
  jumpSpeed: number;
  velocityX: number;
  velocityY: number;
  worldBounds: boolean;
}
export const PHYSICS_LAYERS = [
  'World',
  'Player',
  'Enemy',
  'Hitbox',
  'Hurtbox',
  'Pickup',
  'Trigger',
  'Custom',
];
export function makePhysics(body: BodyType): Physics {
  return {
    body,
    box: null,
    layer: body === 'character' ? 2 : 1,
    mask: 255,
    motion: 'topdown',
    gravity: 0,
    jumpSpeed: 240,
    velocityX: 0,
    velocityY: 0,
    worldBounds: true,
  };
}
/** Legacy projects retain their collision behavior without a destructive migration. */
export function physicsFor(n: GameNode): Physics {
  if (n.physics) return n.physics;
  const body =
    n.kind === 'area' || n.collectible
      ? 'area'
      : n.player
        ? 'character'
        : n.solid || n.tilemap
          ? 'static'
          : 'none';
  return { ...makePhysics(body), ...(n.collectible ? { layer: 32, mask: 2 } : {}) };
}
export function validPhysics(value: unknown): value is Physics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Physics;
  const number = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  return (
    ['none', 'static', 'character', 'area', 'platform'].includes(p.body) &&
    ['topdown', 'platformer', 'code', 'grid'].includes(p.motion) &&
    (p.gridSize === undefined || (Number.isInteger(p.gridSize) && number(p.gridSize, 8, 64))) &&
    (p.oneWay === undefined || typeof p.oneWay === 'boolean') &&
    (!p.oneWay || (['static', 'platform'].includes(p.body) && p.box !== undefined)) &&
    (p.slope === undefined || (p.body === 'static' && ['up', 'down'].includes(p.slope))) &&
    (p.travel === undefined ||
      (p.body === 'platform' &&
        !!p.travel &&
        number(p.travel.x, -2048, 2048) &&
        number(p.travel.y, -2048, 2048) &&
        number(p.travel.durationMs, 100, 600000) &&
        (Math.max(Math.abs(p.travel.x), Math.abs(p.travel.y)) * 1000) / p.travel.durationMs <=
          1200)) &&
    (p.coyoteMs === undefined || number(p.coyoteMs, 0, 250)) &&
    (p.bufferMs === undefined || number(p.bufferMs, 0, 250)) &&
    number(p.layer, 0, 255) &&
    Number.isInteger(p.layer) &&
    number(p.mask, 0, 255) &&
    Number.isInteger(p.mask) &&
    number(p.gravity, 0, 4000) &&
    number(p.jumpSpeed, 0, 1200) &&
    number(p.velocityX, -1200, 1200) &&
    number(p.velocityY, -1200, 1200) &&
    typeof p.worldBounds === 'boolean' &&
    (p.box === null ||
      (!!p.box &&
        number(p.box.x, -2048, 2048) &&
        number(p.box.y, -2048, 2048) &&
        number(p.box.width, 1, 2048) &&
        number(p.box.height, 1, 2048)))
  );
}
/** A single authoring contract shared by import and export diagnostics. */
export function validNodePhysics(n: GameNode): boolean {
  if (['group', 'instance'].includes(n.kind))
    return n.physics === undefined && !n.player && !n.solid && !n.collectible && !n.tilemap;
  if (n.kind === 'area' && (n.player || n.solid || n.tilemap)) return false;
  if (n.physics === undefined) return true;
  if (!validPhysics(n.physics)) return false;
  const p = n.physics;
  if (
    n.kind === 'tilemap' &&
    (!['none', 'static'].includes(p.body) || p.box !== null || p.slope || p.travel)
  )
    return false;
  if (n.kind === 'area' && !['none', 'area'].includes(p.body)) return false;
  return !(
    (n.player && p.body !== 'character') ||
    (n.solid && !['static', 'platform'].includes(p.body)) ||
    (n.collectible && p.body !== 'area')
  );
}
export function colliderBox(n: GameNode): Box {
  const box = physicsFor(n).box;
  return box
    ? { ...box, x: n.x + box.x, y: n.y + box.y }
    : { x: n.x, y: n.y, width: n.width, height: n.height };
}
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
