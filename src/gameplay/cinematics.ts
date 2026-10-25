import type { Simulation } from '../simulation';
import { setSimulationPosition } from '../simulation';
import type { Project } from '../model';
import { cameraPosition2D, clampCamera2D } from '../camera2d';
import type { Runner } from './runtime';

/** One sequential track per runner. No timeline objects or frame-by-frame allocations. */
export interface CinematicTrack {
  node: string; // empty = camera
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
}
export function cinematicCamera(sim: Simulation, p: Pick<Project, 'width' | 'height'>) {
  return sim.cameraOverride ?? cameraPosition2D(sim.camera2d, sim.nodes, p);
}
export function stepTrack(sim: Simulation, p: Project, runner: Runner) {
  const t = runner.track;
  if (!t) return false;
  t.elapsed = Math.min(t.duration, t.elapsed + 1000 / 60);
  const f = t.duration ? t.elapsed / t.duration : 1;
  const x = t.fromX + (t.toX - t.fromX) * f,
    y = t.fromY + (t.toY - t.fromY) * f;
  if (t.node) {
    setSimulationPosition(sim, t.node, x, y);
    const body = sim.bodies[t.node];
    if (body) {
      body.velocityX = f < 1 && t.duration ? ((t.toX - t.fromX) * 1000) / t.duration : 0;
      body.velocityY = f < 1 && t.duration ? ((t.toY - t.fromY) * 1000) / t.duration : 0;
    }
  } else sim.cameraOverride = clampCamera2D(sim.camera2d, p, x, y);
  if (f >= 1) {
    runner.track = undefined;
    return false;
  }
  return true;
}
export function releaseTrack(sim: Simulation, r: Runner) {
  if (r.track?.node && sim.bodies[r.track.node]) {
    sim.bodies[r.track.node].velocityX = 0;
    sim.bodies[r.track.node].velocityY = 0;
  }
  r.track = undefined;
}
