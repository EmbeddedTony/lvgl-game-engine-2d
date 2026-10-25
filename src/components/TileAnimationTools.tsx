import { useState } from 'react';
import type { TilesetAsset } from '../model';
import type { TileAnimation } from '../tiles/animation';
export function TileAnimationTools({
  set,
  selected,
  disabled,
  onChange,
  onBrush,
}: {
  set?: TilesetAsset;
  selected: string[];
  disabled: boolean;
  onChange: (id: string, animation?: TileAnimation) => void;
  onBrush: (id: string) => void;
}) {
  const [fps, setFps] = useState(6),
    base = set?.tiles.find((t) => t.id === selected[0]),
    animation = base?.animation;
  if (!set) return null;
  return (
    <details className="tile-animation-tools">
      <summary>
        Animated tiles{animation ? ' · ' + animation.frames.length + ' frames' : ''}
      </summary>
      <p>
        Choose 2–8 frames in the atlas, then animate them. The first tile becomes your brush.
        Collision stays attached to that tile.
      </p>
      <label>
        Frames per second
        <input
          type="number"
          aria-label="Tile animation FPS"
          min={1}
          max={30}
          value={animation?.fps ?? fps}
          disabled={disabled}
          onChange={(e) => {
            const v = Math.max(1, Math.min(30, Math.round(e.target.valueAsNumber)));
            if (Number.isFinite(v)) {
              setFps(v);
              if (base && animation) onChange(base.id, { ...animation, fps: v });
            }
          }}
        />
      </label>
      <button
        disabled={disabled || selected.length < 2 || selected.length > 8}
        onClick={() => {
          onChange(selected[0], { fps, frames: [...selected] });
          onBrush(selected[0]);
        }}
      >
        Animate selection · {selected.length} frames
      </button>
      {base && animation && (
        <>
          {animation.frames.map((id, i) => (
            <div className="tile-frame-row" key={i}>
              <span>{i + 1}</span>
              <select
                aria-label={`Tile animation frame ${i + 1}`}
                disabled={disabled}
                value={id}
                onChange={(e) => {
                  const frames = [...animation.frames];
                  frames[i] = e.target.value;
                  onChange(base.id, { ...animation, frames });
                }}
              >
                {set.tiles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                title="Remove frame"
                disabled={disabled || animation.frames.length === 1}
                onClick={() =>
                  onChange(base.id, {
                    ...animation,
                    frames: animation.frames.filter((_, n) => n !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            disabled={disabled || animation.frames.length >= 8}
            onClick={() =>
              onChange(base.id, { ...animation, frames: [...animation.frames, base.id] })
            }
          >
            + Frame
          </button>
          <button disabled={disabled} onClick={() => onChange(base.id)}>
            Remove animation
          </button>
        </>
      )}
    </details>
  );
}
