import type { Action } from '../gameplay/model';
import type { Project } from '../model';
import { resolveScene } from '../scenes';

export function cutsceneBeatLabel(a: Action) {
  if (a.type === 'say') return `${a.speaker}: ${a.text.slice(0, 88)}`;
  if (a.type === 'move') return `${a.node} → ${a.x}, ${a.y} · ${(a.ms / 1000).toFixed(1)}s`;
  if (a.type === 'camera')
    return a.mode === 'follow'
      ? 'Return to player'
      : `${a.x}, ${a.y} · ${(a.ms / 1000).toFixed(1)}s`;
  if (a.type === 'wait') return `${(a.ms / 1000).toFixed(1)}s`;
  if (a.type === 'state') return `${a.key} ${a.operation === 'add' ? '+=' : '='} ${a.value}`;
  return '';
}

/** Shared beat controls: authored world coordinates, independent of viewport zoom. */
export function CutsceneFields({
  action: a,
  project,
  sceneId,
  update,
}: {
  action: Action;
  project: Project;
  sceneId?: string;
  update: (f: (a: Action) => void) => void;
}) {
  if (a.type !== 'move' && a.type !== 'camera') return null;
  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0];
  const nodes = resolveScene(project, scene).filter((n) => n.layer === 'world' && !n.tilemap);
  return (
    <>
      {a.type === 'move' ? (
        <label>
          Actor
          <select
            aria-label="Cutscene actor"
            value={a.node}
            onChange={(e) =>
              update((v) => {
                if (v.type === 'move') v.node = e.target.value;
              })
            }
          >
            <option value="self">Triggering actor</option>
            <option value="player">Player</option>
            {nodes
              .filter((n) => !n.player)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label>
          Camera
          <select
            aria-label="Camera cue"
            value={a.mode}
            onChange={(e) =>
              update((v) => {
                if (v.type === 'camera') v.mode = e.target.value as 'pan' | 'follow';
              })
            }
          >
            <option value="pan">Pan to world position</option>
            <option value="follow">Return to player camera</option>
          </select>
        </label>
      )}
      {(a.type === 'move' || a.mode === 'pan') && (
        <>
          <div className="cutscene-coordinates">
            {(['x', 'y', 'ms'] as const).map((key) => (
              <label key={key}>
                {key === 'ms' ? 'Duration (ms)' : `Destination ${key.toUpperCase()} (world px)`}
                <input
                  aria-label={`Cutscene ${key}`}
                  type="number"
                  min={key === 'ms' || a.type === 'camera' ? 0 : -4096}
                  max={key === 'ms' ? 60000 : 4096}
                  value={a[key]}
                  onChange={(e) =>
                    update((v) => {
                      if (v.type === 'move' || v.type === 'camera')
                        v[key] = Math.trunc(Number(e.target.value));
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            {a.type === 'move' ? 'Copy destination from actor' : 'Frame an actor'}
            <select
              aria-label="Copy cutscene position"
              value=""
              onChange={(e) => {
                const n = nodes.find((n) => n.id === e.target.value);
                if (!n) return;
                update((v) => {
                  if (v.type === 'move') {
                    v.x = Math.round(n.x);
                    v.y = Math.round(n.y);
                  } else if (v.type === 'camera') {
                    v.x = Math.max(0, Math.round(n.x + n.width / 2 - project.width / 2));
                    v.y = Math.max(0, Math.round(n.y + n.height / 2 - project.height / 2));
                  }
                });
              }}
            >
              <option value="">Choose an actor…</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            0 ms cuts immediately. Staged movement ignores collisions; place destinations on clear
            ground. Beats run in order. Player control and the follow camera return at the end.
          </p>
        </>
      )}
    </>
  );
}
