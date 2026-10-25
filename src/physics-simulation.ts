import { meleeLocked } from './action2d/runtime';
import type { Trigger } from './gameplay/model';
import type { GameNode, Project } from './model';
import type { Simulation } from './simulation';
import { boxesOverlap, colliderBox, physicsFor, type Box } from './physics';

export interface BodyState {
  velocityX: number;
  velocityY: number;
  onFloor: boolean;
  onWall: boolean;
  onCeiling: boolean;
  gridX?: number;
  gridY?: number;
  gridActive?: boolean;
  coyote?: number;
  buffer?: number;
  platformPhase?: number;
  platformOffsetX?: number;
  platformOffsetY?: number;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DT = 1 / 60;

/** Mirrors the portable C character solver. Native playtest executes the C itself. */
export function physicsStep(
  s: Simulation,
  display: Pick<Project, 'width' | 'height'>,
  keys: Set<string>,
  sync: () => void,
  onCue: (id: string) => void,
  onEvent: (message: string) => void,
  signal: (trigger: Trigger, node: GameNode, other?: string) => void = () => {},
  manualPlatform?: { id: string; x: number; y: number },
) {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const configs = new Map(s.nodes.map((n) => [n.id, physicsFor(n)]));
  const config = (n: GameNode) => configs.get(n.id)!;
  const ancestors = (n: GameNode) => {
    const result = [n];
    while (n.parent) {
      n = byId.get(n.parent)!;
      result.push(n);
    }
    return result;
  };
  const related = (a: GameNode, b: GameNode) => {
    const aa = ancestors(a),
      bb = ancestors(b),
      owner = aa.find((n) => config(n).body === 'character');
    return (
      aa.includes(b) ||
      bb.includes(a) ||
      (!!owner && bb.find((n) => config(n).body === 'character') === owner)
    );
  };
  const solidTiles = (a: Box, b: GameNode, visit: (tile: Box, slope?: 'up' | 'down') => void) => {
    const t = b.tilemap!;
    const c0 = Math.max(0, Math.floor((a.x - b.x) / t.tileSize)),
      c1 = Math.min(t.columns - 1, Math.floor((a.x + a.width - 0.0001 - b.x) / t.tileSize)),
      r0 = Math.max(0, Math.floor((a.y - b.y) / t.tileSize)),
      r1 = Math.min(t.rows - 1, Math.floor((a.y + a.height - 0.0001 - b.y) / t.tileSize));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (t.solidTiles.includes(t.cells[r * t.columns + c]))
          visit(
            {
              x: b.x + c * t.tileSize,
              y: b.y + r * t.tileSize,
              width: t.tileSize,
              height: t.tileSize,
            },
            t.slopes?.[t.cells[r * t.columns + c]],
          );
  };
  const overlaps = (a: GameNode, b: GameNode) => {
    if (!a.visible || !b.visible) return false;
    if (!a.tilemap && !b.tilemap) return boxesOverlap(colliderBox(a), colliderBox(b));
    let hit = false;
    solidTiles(colliderBox(b.tilemap ? a : b), b.tilemap ? b : a, () => {
      hit = true;
    });
    return hit;
  };
  const sample = () => {
    for (const a of s.nodes) {
      const p = config(a);
      if (p.body !== 'area' || (!a.physics && a.kind !== 'area')) continue;
      for (const b of s.nodes) {
        const key = `${a.id}\0${b.id}`,
          was = s.areaContacts.has(key);
        const now =
          a.visible &&
          config(b).body !== 'none' &&
          !!(p.mask & config(b).layer) &&
          !related(a, b) &&
          overlaps(a, b);
        if (now) s.areaContacts.add(key);
        else s.areaContacts.delete(key);
        if (was !== now) {
          signal(now ? 'enter' : 'exit', a, b.id);
          if (now && !a.collectible && a.cue) onCue(a.cue);
          onEvent(`${now ? 'Entered' : 'Exited'} ${a.name} · ${b.name}`);
        }
      }
    }
    for (const a of s.nodes) {
      if (!a.visible || !a.player || config(a).body !== 'character') continue;
      for (const b of s.nodes)
        if (
          b.collectible &&
          config(b).body === 'area' &&
          !related(a, b) &&
          config(b).mask & config(a).layer &&
          overlaps(a, b)
        ) {
          b.visible = false;
          s.prefabs.collected.add(b.id);
          s.hierarchy[b.id].visible = false;
          sync();
          s.score++;
          signal('collect', b, a.id);
          if (b.cue) onCue(b.cue);
          onEvent(`Collected ${b.name} · ${s.score} / ${s.total}`);
          if (!s.complete && s.total && s.score === s.total) {
            s.complete = true;
            onEvent('Scene complete — all crystals found.');
            for (const n of s.nodes) if (n.visible) signal('complete', n);
          }
        }
    }
  };
  const move = (n: GameNode, delta: number, horizontal: boolean, ignore?: GameNode) => {
    if (!delta) return;
    const a = colliderBox(n),
      p = config(n),
      state = s.bodies[n.id];
    const origin = horizontal ? n.x : n.y;
    const requested = origin + delta;
    let next = requested;
    if (p.worldBounds) {
      const offset = (horizontal ? a.x : a.y) - origin;
      next = clamp(
        next,
        -offset,
        Math.max(
          -offset,
          (horizontal ? display.width - a.width : display.height - a.height) - offset,
        ),
      );
    }
    const stop = (b: Box, oneWay = false) => {
      if (oneWay && (horizontal || delta <= 0 || a.y + a.height > b.y + 0.0001)) return;
      const near = horizontal ? b.x : b.y,
        far = near + (horizontal ? b.width : b.height),
        start = horizontal ? a.x : a.y,
        size = horizontal ? a.width : a.height;
      const cross = horizontal
        ? a.y < b.y + b.height && a.y + a.height > b.y
        : a.x < b.x + b.width && a.x + a.width > b.x;
      if (!cross) return;
      if (delta > 0 && start + size <= near + 0.0001 && start + size + delta > near)
        next = Math.min(next, near - size - (start - origin));
      if (delta < 0 && start >= far - 0.0001 && start + delta < far)
        next = Math.max(next, far - (start - origin));
    };
    for (const b of s.nodes) {
      if (
        !b.visible ||
        b === ignore ||
        !['static', 'character', 'platform'].includes(config(b).body) ||
        !(p.mask & config(b).layer) ||
        related(n, b)
      )
        continue;
      if (!b.tilemap) {
        if (!config(b).slope) stop(colliderBox(b), !!config(b).oneWay);
      } else
        solidTiles(
          {
            ...a,
            x: Math.min(a.x, a.x + (horizontal ? delta : 0)),
            y: Math.min(a.y, a.y + (horizontal ? 0 : delta)),
            width: a.width + (horizontal ? Math.abs(delta) : 0) + 0.0002,
            height: a.height + (horizontal ? 0 : Math.abs(delta)) + 0.0002,
          },
          b,
          (box, slope) => {
            if (!slope) stop(box, !!config(b).oneWay);
          },
        );
    }
    if (Math.abs(next - requested) > 0.00001) {
      if (horizontal) {
        state.onWall = true;
        state.velocityX = 0;
      } else {
        if (delta > 0) state.onFloor = true;
        else state.onCeiling = true;
        state.velocityY = 0;
      }
    }
    if (horizontal) n.x = next;
    else n.y = next;
  };
  const ramp = (
    n: GameNode,
    b: Box,
    shape: 'up' | 'down',
    oldX: number,
    dy: number,
    grounded: boolean,
  ) => {
    const a = colliderBox(n),
      state = s.bodies[n.id],
      center = shape === 'up' ? a.x + a.width : a.x;
    if (a.x >= b.x + b.width || a.x + a.width <= b.x || state.velocityY < 0) return;
    const t = clamp((center - b.x) / b.width, 0, 1),
      surface = b.y + b.height * (shape === 'up' ? 1 - t : t);
    const feet = a.y + a.height,
      snap = grounded ? (Math.abs(n.x - oldX) * b.height) / b.width + 0.01 : 0.0001;
    if (feet <= surface + snap && feet + dy >= surface - snap) {
      n.y += surface - feet;
      state.velocityY = 0;
      state.onFloor = true;
    }
  };
  const slopeFloor = (n: GameNode, oldX: number, dy: number, grounded: boolean) => {
    const oldY = n.y;
    for (const b of s.nodes) {
      if (
        !b.visible ||
        !['static', 'platform', 'character'].includes(config(b).body) ||
        !(config(n).mask & config(b).layer) ||
        related(n, b)
      )
        continue;
      if (config(b).slope) ramp(n, colliderBox(b), config(b).slope!, oldX, dy, grounded);
      const t = b.tilemap;
      if (!t?.slopes) continue;
      const a = colliderBox(n),
        c0 = Math.max(0, Math.floor((a.x - b.x) / t.tileSize)),
        c1 = Math.min(t.columns - 1, Math.floor((a.x + a.width - 0.0001 - b.x) / t.tileSize)),
        row = Math.floor((a.y + a.height - b.y) / t.tileSize);
      for (let r = row - 1; r <= row + 1; r++)
        for (let c = c0; c <= c1; c++) {
          if (c < 0 || c >= t.columns || r < 0 || r >= t.rows) continue;
          const v = t.cells[r * t.columns + c],
            shape = t.slopes[v];
          if (shape && t.solidTiles.includes(v))
            ramp(
              n,
              {
                x: b.x + c * t.tileSize,
                y: b.y + r * t.tileSize,
                width: t.tileSize,
                height: t.tileSize,
              },
              shape,
              oldX,
              dy,
              grounded,
            );
        }
    }
    const target = n.y;
    n.y = oldY;
    if (target !== oldY) {
      move(n, target - oldY, false);
      if (target < oldY && Math.abs(n.y - target) > 0.0001) {
        n.x = oldX;
        n.y = oldY;
        const state = s.bodies[n.id];
        state.velocityX = 0;
        state.onWall = true;
        state.onFloor = grounded;
      }
    }
  };
  const platformAxis = (platform: GameNode, delta: number, horizontal: boolean) => {
    if (!delta) return true;
    const b = colliderBox(platform),
      pushes: { n: GameNode; push: number }[] = [];
    for (const n of s.nodes) {
      if (
        !n.visible ||
        config(n).body !== 'character' ||
        !(config(n).mask & config(platform).layer) ||
        related(n, platform)
      )
        continue;
      const a = colliderBox(n),
        state = s.bodies[n.id];
      const rider =
        Math.abs(a.y + a.height - b.y) < 0.02 &&
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        state.velocityY >= 0;
      let push = rider ? delta : 0;
      const cross = horizontal
        ? a.y < b.y + b.height && a.y + a.height > b.y
        : a.x < b.x + b.width && a.x + a.width > b.x;
      if (!config(platform).oneWay && cross) {
        const near = horizontal ? a.x : a.y,
          far = near + (horizontal ? a.width : a.height),
          p0 = horizontal ? b.x : b.y,
          p1 = p0 + (horizontal ? b.width : b.height);
        if (delta > 0 && near >= p1 - 0.0001 && near < p1 + delta) push = p1 + delta - near;
        if (delta < 0 && far <= p0 + 0.0001 && far > p0 + delta) push = p0 + delta - far;
      }
      if (!push) continue;
      const saved = { ...state },
        x = n.x,
        y = n.y,
        origin = horizontal ? x : y;
      move(n, push, horizontal, platform);
      const actual = (horizontal ? n.x : n.y) - origin;
      n.x = x;
      n.y = y;
      Object.assign(state, saved);
      if (Math.abs(actual - push) > 0.0001) return false;
      pushes.push({ n, push });
    }
    if (horizontal) {
      platform.x += delta;
      s.bodies[platform.id].platformOffsetX = (s.bodies[platform.id].platformOffsetX ?? 0) + delta;
    } else {
      platform.y += delta;
      s.bodies[platform.id].platformOffsetY = (s.bodies[platform.id].platformOffsetY ?? 0) + delta;
    }
    for (const { n, push } of pushes) {
      if (horizontal) n.x += push;
      else n.y += push;
    }
    sync();
    return true;
  };
  const platformMove = (n: GameNode, dx: number, dy: number) => {
    if (
      config(n).body !== 'platform' ||
      !n.visible ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      Math.abs(dx) > 20 ||
      Math.abs(dy) > 20
    )
      return false;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    let ok = true;
    for (let i = 0; i < steps; i++) {
      if (!platformAxis(n, dx / steps, true)) ok = false;
      if (!platformAxis(n, dy / steps, false)) ok = false;
    }
    return ok;
  };
  if (manualPlatform) {
    const n = byId.get(manualPlatform.id);
    return !!n && platformMove(n, manualPlatform.x, manualPlatform.y);
  }
  for (const n of s.nodes) {
    const p = config(n),
      state = s.bodies[n.id];
    if (p.body !== 'platform' || !n.visible) continue;
    let dx = state.velocityX * DT,
      dy = state.velocityY * DT;
    if (p.travel) {
      const before = state.platformPhase ?? 0,
        after = (before + (1000 * DT) / p.travel.durationMs) % 2;
      state.platformPhase = after;
      const offset = after <= 1 ? after : 2 - after;
      dx = clamp(p.travel.x * offset - (state.platformOffsetX ?? 0), -20, 20);
      dy = clamp(p.travel.y * offset - (state.platformOffsetY ?? 0), -20, 20);
      state.velocityX = dx / DT;
      state.velocityY = dy / DT;
    }
    platformMove(n, dx, dy);
  }
  const floors = new Set(s.nodes.filter((n) => s.bodies[n.id].onFloor).map((n) => n.id));
  const dx =
    Number(keys.has('d') || keys.has('arrowright')) -
    Number(keys.has('a') || keys.has('arrowleft'));
  const dy =
    Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  const jump = keys.has(' ') || keys.has('w') || keys.has('arrowup');
  let steps = 1;
  for (const n of s.nodes) {
    if (!n.visible || config(n).body !== 'character') continue;
    const p = config(n),
      state = s.bodies[n.id];
    if (meleeLocked(s, n)) {
      state.velocityX = 0;
      if (p.motion !== 'platformer') state.velocityY = 0;
    }
    if (n.player && p.motion !== 'code' && !meleeLocked(s, n)) {
      if (p.motion === 'grid') {
        if (!state.gridActive && (dx || dy)) {
          state.gridX = n.x + (dx ? dx : 0) * (p.gridSize ?? 16);
          state.gridY = n.y + (!dx ? dy : 0) * (p.gridSize ?? 16);
          state.gridActive = true;
        }
        state.velocityX = state.gridActive
          ? clamp((state.gridX! - n.x) / DT, -n.speed, n.speed)
          : 0;
        state.velocityY = state.gridActive
          ? clamp((state.gridY! - n.y) / DT, -n.speed, n.speed)
          : 0;
      } else {
        const scale = p.motion === 'topdown' && dx && dy ? 0.70710678 : 1;
        state.velocityX = dx * n.speed * scale;
        if (p.motion === 'topdown') state.velocityY = dy * n.speed * scale;
        else {
          state.coyote = state.onFloor
            ? (p.coyoteMs ?? 0)
            : Math.max(0, (state.coyote ?? 0) - 1000 / 60);
          state.buffer =
            jump && !s.jumpHeld
              ? (p.bufferMs ?? 0) + 1000 / 60
              : Math.max(0, (state.buffer ?? 0) - 1000 / 60);
          if ((state.onFloor || (state.coyote ?? 0) > 0) && (state.buffer ?? 0) > 0) {
            state.velocityY = -p.jumpSpeed;
            state.onFloor = false;
            state.buffer = 0;
            state.coyote = 0;
          }
        }
      }
    }
    state.velocityX = clamp(state.velocityX, -1200, 1200);
    state.velocityY = clamp(
      state.velocityY + (p.motion === 'grid' ? 0 : p.gravity) * DT,
      -1200,
      1200,
    );
    state.onFloor = state.onWall = state.onCeiling = false;
    steps = Math.max(
      steps,
      Math.ceil(Math.max(Math.abs(state.velocityX), Math.abs(state.velocityY)) * DT),
    );
  }
  sample();
  for (let step = 0; step < steps; step++) {
    for (const n of s.nodes)
      if (n.visible && config(n).body === 'character') {
        const state = s.bodies[n.id];
        const oldX = n.x,
          grounded = state.onFloor || floors.has(n.id);
        move(n, (state.velocityX * DT) / steps, true);
        slopeFloor(n, oldX, (state.velocityY * DT) / steps, grounded);
        move(n, (state.velocityY * DT) / steps, false);
        sync();
      }
    sample();
  }
  for (const n of s.nodes) {
    const b = s.bodies[n.id];
    if (
      config(n).motion === 'grid' &&
      b.gridActive &&
      (b.onWall ||
        b.onFloor ||
        b.onCeiling ||
        (Math.abs(n.x - b.gridX!) < 0.001 && Math.abs(n.y - b.gridY!) < 0.001))
    ) {
      b.gridActive = false;
      b.velocityX = b.velocityY = 0;
    }
  }
  s.jumpHeld = jump;
}
