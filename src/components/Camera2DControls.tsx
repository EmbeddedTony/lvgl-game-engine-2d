import type { Camera2D } from '../camera2d';
import { cameraPosition2D } from '../camera2d';
import type { GameNode, Project, Scene } from '../model';
export function Camera2DControls({
  scene,
  display,
  nodes,
  position,
  onView,
  onChange,
}: {
  scene: Scene;
  display: Pick<Project, 'width' | 'height'>;
  nodes: GameNode[];
  position: { x: number; y: number };
  onView: (p: { x: number; y: number }) => void;
  onChange: (camera: Camera2D | undefined) => void;
}) {
  const c = scene.camera2d,
    targets = nodes.filter((n) => n.layer === 'world' && !['tilemap', 'area'].includes(n.kind));
  const patch = (change: Partial<Camera2D>) => {
    if (c) onChange({ ...c, ...change });
  };
  return (
    <details className="camera2d-controls">
      <summary>2D camera{c ? ' · follow' : ''}</summary>
      <div>
        <label>
          Follow object
          <select
            aria-label="2D camera follow"
            value={c?.follow ?? ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? {
                      worldWidth: c?.worldWidth ?? display.width * 2,
                      worldHeight: c?.worldHeight ?? display.height,
                      axis: c?.axis ?? 'x',
                      follow: e.target.value,
                    }
                  : undefined,
              )
            }
          >
            <option value="">No scrolling camera</option>
            {targets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        {c && (
          <>
            <label>
              World width
              <input
                type="number"
                aria-label="2D world width"
                min={display.width}
                max={4096}
                value={c.worldWidth}
                onChange={(e) => {
                  if (e.target.value && Number.isFinite(e.target.valueAsNumber))
                    patch({
                      worldWidth: Math.round(
                        Math.max(display.width, Math.min(4096, e.target.valueAsNumber)),
                      ),
                    });
                }}
              />
            </label>
            <label>
              World height
              <input
                type="number"
                aria-label="2D world height"
                min={display.height}
                max={4096}
                value={c.worldHeight}
                onChange={(e) => {
                  if (e.target.value && Number.isFinite(e.target.valueAsNumber))
                    patch({
                      worldHeight: Math.round(
                        Math.max(display.height, Math.min(4096, e.target.valueAsNumber)),
                      ),
                    });
                }}
              />
            </label>
            <label>
              Follow axes
              <select
                aria-label="2D camera axes"
                value={c.axis}
                onChange={(e) => patch({ axis: e.target.value as Camera2D['axis'] })}
              >
                <option value="x">Horizontal</option>
                <option value="both">Horizontal + vertical</option>
              </select>
            </label>
            <label>
              Editor view X · {position.x}
              <input
                aria-label="Editor camera X"
                type="range"
                min={0}
                max={Math.max(0, c.worldWidth - display.width)}
                step={1}
                value={position.x}
                onChange={(e) => onView({ ...position, x: Number(e.target.value) })}
              />
            </label>
            <label>
              Editor view Y · {position.y}
              <input
                aria-label="Editor camera Y"
                type="range"
                min={0}
                max={Math.max(0, c.worldHeight - display.height)}
                step={1}
                value={position.y}
                onChange={(e) => onView({ ...position, y: Number(e.target.value) })}
              />
            </label>
            <button onClick={() => onView(cameraPosition2D(c, nodes, display))}>
              Frame follow target
            </button>
            <p>
              Editor panning does not change the project. Play follows the target; HUD stays fixed.
              Physics uses world dimensions.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
