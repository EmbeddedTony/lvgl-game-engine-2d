import { useState } from 'react';
import type { Project } from '../model';
import type { Simulation } from '../simulation';

/** Preview-only controls never change authored instances or their overrides. */
export function PrefabPreview({
  project,
  sim,
  paused,
  onSpawn,
  onDespawn,
}: {
  project: Project;
  sim: Simulation;
  paused: boolean;
  onSpawn: (source: string) => void;
  onDespawn: (source: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const sources = [...new Set(sim.nodes.filter((n) => n.spawnable).map((n) => n.scene!))];
  const source = sources.includes(selected) ? selected : sources[0];
  if (!source) return null;
  const slots = sim.nodes.filter((n) => n.spawnable && n.scene === source),
    live = slots.filter((n) => sim.prefabs.live[n.id]).length;
  return (
    <details className="session-monitor prefab-preview">
      <summary>Prefabs · {Object.keys(sim.prefabs.live).length} live</summary>
      <div>
        <label>
          Spawn test{' '}
          <select
            aria-label="Preview prefab"
            value={source}
            onChange={(e) => setSelected(e.target.value)}
          >
            {sources.map((id) => (
              <option key={id} value={id}>
                {project.scenes.find((s) => s.id === id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <p>
          {live} / {slots.length} copies active
        </p>
        <button disabled={paused || live === slots.length} onClick={() => onSpawn(source)}>
          Spawn copy
        </button>
        <button disabled={paused || !live} onClick={() => onDespawn(source)}>
          Despawn last
        </button>
        <small>Transient test at player / screen center. Test C hooks with Native LVGL.</small>
      </div>
    </details>
  );
}
