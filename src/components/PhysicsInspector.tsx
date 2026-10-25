import type { GameNode } from '../model';
import { makePhysics, physicsFor, PHYSICS_LAYERS, type Physics, type BodyType } from '../physics';

export function PhysicsInspector({
  node,
  onChange,
  editing,
  onEdit,
  onAddArea,
}: {
  node: GameNode;
  onChange: (patch: Partial<GameNode>) => void;
  editing: boolean;
  onEdit: () => void;
  onAddArea: (preset: 'Hitbox' | 'Hurtbox' | 'Trigger') => void;
}) {
  const p = physicsFor(node);
  const patch = (changes: Partial<Physics>) => onChange({ physics: { ...p, ...changes } });
  const number = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
  ) => (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
  const setBody = (body: BodyType) => {
    const defaults = makePhysics(body);
    onChange({
      physics: {
        ...p,
        body,
        slope: undefined,
        travel: undefined,
        oneWay: false,
        layer: defaults.layer,
        mask: defaults.mask,
      },
      player: body === 'character',
      solid: body === 'static' || body === 'platform',
      collectible: body === 'area' && node.collectible,
    });
  };
  return (
    <details className="inspector-section physics-inspector" open>
      <summary>
        <h3>Physics · 2D</h3>
      </summary>
      <label className="block-label">
        Body type
        <select
          aria-label="Physics body"
          value={p.body}
          onChange={(e) => setBody(e.target.value as BodyType)}
        >
          <option value="none">None · artwork only</option>
          {node.kind !== 'area' && <option value="static">Static · walls & platforms</option>}
          {!['area', 'tilemap'].includes(node.kind) && (
            <option value="character">Character · moving body</option>
          )}
          {!['area', 'tilemap'].includes(node.kind) && (
            <option value="platform">Platform · carry & push</option>
          )}
          {node.kind !== 'tilemap' && <option value="area">Area · detect overlaps</option>}
        </select>
      </label>
      {p.body !== 'none' && (
        <>
          {node.tilemap ? (
            <p className="field-hint">
              Solid tile types define the collision shapes. Empty cells stay passable.
            </p>
          ) : (
            <>
              <label className="block-label">
                Rectangle collider
                <select
                  aria-label="Collider bounds"
                  value={p.box ? 'custom' : 'fit'}
                  onChange={(e) =>
                    patch({
                      box:
                        e.target.value === 'fit'
                          ? null
                          : { x: 0, y: 0, width: node.width, height: node.height },
                    })
                  }
                >
                  <option value="fit">Fit visual bounds</option>
                  <option value="custom">Custom box</option>
                </select>
              </label>
              {p.box && (
                <>
                  <div className="field-pair">
                    {number(
                      'Collider X',
                      p.box.x,
                      (x) => patch({ box: { ...p.box!, x } }),
                      -2048,
                      2048,
                    )}
                    {number(
                      'Collider Y',
                      p.box.y,
                      (y) => patch({ box: { ...p.box!, y } }),
                      -2048,
                      2048,
                    )}
                  </div>
                  <div className="field-pair">
                    {number(
                      'Collider width',
                      p.box.width,
                      (width) => patch({ box: { ...p.box!, width } }),
                      1,
                      2048,
                    )}
                    {number(
                      'Collider height',
                      p.box.height,
                      (height) => patch({ box: { ...p.box!, height } }),
                      1,
                      2048,
                    )}
                  </div>
                </>
              )}
              <button
                className={`source-open ${editing ? 'active' : ''}`}
                aria-pressed={editing}
                onClick={onEdit}
              >
                {editing ? 'Finish editing collider' : 'Edit collider in scene'}
              </button>
              <p className="field-hint">
                The collider is independent of the artwork. Drag its outline or resize its corners.
              </p>
            </>
          )}
          {['static', 'platform'].includes(p.body) && !p.slope && (
            <label className="form-row">
              One-way platform
              <input
                aria-label="One-way platform"
                type="checkbox"
                checked={!!p.oneWay}
                onChange={(e) => patch({ oneWay: e.target.checked })}
              />
            </label>
          )}
          {p.body === 'static' && !node.tilemap && (
            <label className="block-label">
              Floor shape
              <select
                aria-label="Floor shape"
                value={p.slope ?? 'box'}
                onChange={(e) =>
                  patch({
                    slope: e.target.value === 'box' ? undefined : (e.target.value as 'up' | 'down'),
                    oneWay: false,
                  })
                }
              >
                <option value="box">Rectangle</option>
                <option value="up">Ramp · rises to right ↗</option>
                <option value="down">Ramp · falls to right ↘</option>
              </select>
              {p.slope && (
                <small>
                  Floor-only ramp. The foot center follows its surface; use artwork to match.
                </small>
              )}
            </label>
          )}
          {p.body === 'platform' && (
            <>
              <label className="block-label">
                Platform movement
                <select
                  aria-label="Platform movement"
                  value={p.travel ? 'path' : 'code'}
                  onChange={(e) =>
                    patch({
                      travel:
                        e.target.value === 'path' ? { x: 64, y: 0, durationMs: 2000 } : undefined,
                      velocityX: 0,
                      velocityY: 0,
                    })
                  }
                >
                  <option value="path">Ping-pong path</option>
                  <option value="code">Velocity / code</option>
                </select>
              </label>
              {p.travel ? (
                <>
                  {number(
                    'Travel X · px',
                    p.travel.x,
                    (x) =>
                      patch({
                        travel: {
                          ...p.travel!,
                          x,
                          durationMs: Math.max(p.travel!.durationMs, (Math.abs(x) * 1000) / 1200),
                        },
                      }),
                    -2048,
                    2048,
                  )}
                  {number(
                    'Travel Y · px',
                    p.travel.y,
                    (y) =>
                      patch({
                        travel: {
                          ...p.travel!,
                          y,
                          durationMs: Math.max(p.travel!.durationMs, (Math.abs(y) * 1000) / 1200),
                        },
                      }),
                    -2048,
                    2048,
                  )}
                  {number(
                    'One-way travel · ms',
                    p.travel.durationMs,
                    (durationMs) =>
                      patch({
                        travel: {
                          ...p.travel!,
                          durationMs: Math.max(
                            durationMs,
                            (Math.max(Math.abs(p.travel!.x), Math.abs(p.travel!.y)) * 1000) / 1200,
                          ),
                        },
                      }),
                    100,
                    600000,
                  )}
                </>
              ) : (
                <div className="field-pair">
                  {number(
                    'Platform velocity X',
                    p.velocityX,
                    (velocityX) => patch({ velocityX }),
                    -1200,
                    1200,
                  )}
                  {number(
                    'Platform velocity Y',
                    p.velocityY,
                    (velocityY) => patch({ velocityY }),
                    -1200,
                    1200,
                  )}
                </div>
              )}
              <p className="field-hint">
                Carries riders and pushes characters. Stops an axis before crushing them. Use the
                platform move API in an update hook for custom paths.
              </p>
            </>
          )}
          {p.body === 'character' && (
            <>
              <label className="block-label">
                Movement
                <select
                  aria-label="Character movement"
                  value={p.motion}
                  onChange={(e) =>
                    patch({
                      motion: e.target.value as Physics['motion'],
                      gravity: e.target.value === 'platformer' ? 700 : 0,
                    })
                  }
                >
                  <option value="topdown">Top down · directional</option>
                  <option value="platformer">Platformer · gravity & jump</option>
                  <option value="code">Code · velocity API</option>
                  <option value="grid">Grid · tile-by-tile RPG movement</option>
                </select>
              </label>
              <label className="form-row">
                Player input
                <input
                  aria-label="Player controller"
                  type="checkbox"
                  checked={node.player}
                  onChange={(e) => onChange({ player: e.target.checked })}
                />
              </label>
              {node.player &&
                number('Speed · px/s', node.speed, (speed) => onChange({ speed }), 0, 600)}
              {number('Gravity · px/s²', p.gravity, (gravity) => patch({ gravity }), 0, 4000)}
              {p.motion === 'platformer' &&
                number(
                  'Jump speed · px/s',
                  p.jumpSpeed,
                  (jumpSpeed) => patch({ jumpSpeed }),
                  0,
                  1200,
                )}
              {p.motion === 'grid' &&
                number(
                  'Grid step · px',
                  p.gridSize ?? 16,
                  (gridSize) => patch({ gridSize: Math.round(gridSize) }),
                  8,
                  64,
                )}
              {p.motion === 'platformer' && (
                <>
                  {number(
                    'Coyote time · ms',
                    p.coyoteMs ?? 0,
                    (coyoteMs) => patch({ coyoteMs }),
                    0,
                    250,
                  )}
                  {number(
                    'Jump buffer · ms',
                    p.bufferMs ?? 0,
                    (bufferMs) => patch({ bufferMs }),
                    0,
                    250,
                  )}
                </>
              )}
              {p.motion === 'code' && (
                <div className="field-pair">
                  {number(
                    'Initial velocity X',
                    p.velocityX,
                    (velocityX) => patch({ velocityX }),
                    -1200,
                    1200,
                  )}
                  {number(
                    'Initial velocity Y',
                    p.velocityY,
                    (velocityY) => patch({ velocityY }),
                    -1200,
                    1200,
                  )}
                </div>
              )}
              <label className="form-row">
                Keep inside display
                <input
                  aria-label="Keep inside display"
                  type="checkbox"
                  checked={p.worldBounds}
                  onChange={(e) => patch({ worldBounds: e.target.checked })}
                />
              </label>
              {p.motion === 'platformer' && (
                <p className="field-hint">
                  A / D to move. Space or Up to jump from the floor. Firmware uses UI_INPUT_ACTION.
                </p>
              )}
            </>
          )}
          {(['layer', 'mask'] as const).map((key) => (
            <fieldset className="physics-layer-group" key={key}>
              <legend>
                {key === 'layer'
                  ? 'Belongs to layers'
                  : p.body === 'area'
                    ? 'Detects layers'
                    : 'Collides with layers'}
              </legend>
              <div className="physics-layer-grid">
                {PHYSICS_LAYERS.map((name, index) => (
                  <label key={name}>
                    <input
                      aria-label={`${key === 'layer' ? 'Layer' : 'Mask'} ${name}`}
                      type="checkbox"
                      checked={!!(p[key] & (1 << index))}
                      onChange={(e) =>
                        patch({
                          [key]: e.target.checked ? p[key] | (1 << index) : p[key] & ~(1 << index),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {p.body === 'area' && (
            <p className="field-hint">
              Detects without blocking. Enter / exit events identify the other body or area. Hide
              this node to disable detection.
            </p>
          )}
        </>
      )}
      {!['area', 'tilemap'].includes(node.kind) && (
        <div className="physics-presets">
          <span>Add child detection area</span>
          {(['Hitbox', 'Hurtbox', 'Trigger'] as const).map((name) => (
            <button key={name} onClick={() => onAddArea(name)}>
              + {name}
            </button>
          ))}
        </div>
      )}
    </details>
  );
}
