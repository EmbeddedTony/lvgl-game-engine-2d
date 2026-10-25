import { useState } from 'react';
import type { Project } from '../model';
import type { AnimationClip } from '../gameplay/model';
import { composeAnimationFrame } from '../animation/layers';
import { spriteUrl } from '../assets';

export function AnimationLayers({
  clip,
  project,
  onChange,
}: {
  clip: AnimationClip;
  project: Project;
  onChange: (c: AnimationClip) => void;
}) {
  const [frame, setFrame] = useState(0),
    [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(-1);
  if (!clip.layers)
    return (
      <button
        onClick={() =>
          onChange({
            ...clip,
            layers: [{ name: 'Body', frames: [...clip.frames], visible: true, x: 0, y: 0 }],
          })
        }
      >
        Use layered animation
      </button>
    );
  const change = (fn: (c: AnimationClip) => void) => {
    const c = structuredClone(clip);
    fn(c);
    onChange(c);
  };
  const current = Math.min(frame, clip.frames.length - 1);
  let preview = '';
  try {
    if (open)
      preview = spriteUrl(
        composeAnimationFrame(clip, current, new Map(project.sprites.map((s) => [s.id, s]))),
      );
  } catch {
    /* Invalid draft references are reported by project validation. */
  }
  return (
    <details className="animation-layers" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Layers · bottom to top</summary>
      {open && (
        <>
          <p className="field-hint">
            One shared frame clock. Export bakes the stack into one image per frame; hidden layers
            cost no draw calls.
          </p>
          <div className="gameplay-inline">
            {preview && (
              <img
                src={preview}
                alt={`${clip.name} composed frame`}
                style={{ width: 64, height: 96, objectFit: 'contain', imageRendering: 'pixelated' }}
              />
            )}
            <label>
              Preview frame{' '}
              <input
                aria-label={`${clip.name} preview frame`}
                type="number"
                min={1}
                max={clip.frames.length}
                value={current + 1}
                onChange={(e) =>
                  setFrame(
                    Math.max(0, Math.min(clip.frames.length - 1, Number(e.target.value) - 1)),
                  )
                }
              />
            </label>
          </div>
          {clip.layers.map((l, i) => (
            <div className="animation-layer" key={i}>
              <div className="gameplay-inline">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${clip.name} layer ${i + 1} visible`}
                    checked={l.visible}
                    onChange={(e) =>
                      change((c) => {
                        c.layers![i].visible = e.target.checked;
                      })
                    }
                  />
                  Visible
                </label>
                <input
                  aria-label={`${clip.name} layer ${i + 1} name`}
                  value={l.name}
                  onChange={(e) =>
                    change((c) => {
                      c.layers![i].name = e.target.value;
                    })
                  }
                />
                <button
                  disabled={!i}
                  aria-label={`${clip.name} layer ${i + 1} down`}
                  onClick={() =>
                    change((c) => {
                      [c.layers![i - 1], c.layers![i]] = [c.layers![i], c.layers![i - 1]];
                    })
                  }
                >
                  ↓
                </button>
                <button
                  disabled={i === clip.layers!.length - 1}
                  aria-label={`${clip.name} layer ${i + 1} up`}
                  onClick={() =>
                    change((c) => {
                      [c.layers![i + 1], c.layers![i]] = [c.layers![i], c.layers![i + 1]];
                    })
                  }
                >
                  ↑
                </button>
                <button
                  disabled={clip.layers!.length === 1}
                  onClick={() =>
                    change((c) => {
                      c.layers!.splice(i, 1);
                    })
                  }
                >
                  Remove layer
                </button>
              </div>
              <details onToggle={(e) => setExpanded(e.currentTarget.open ? i : -1)}>
                <summary>Frames & offsets</summary>
                {expanded === i && (
                  <>
                    {clip.frames.length > 1 && (
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`${clip.name} layer ${i + 1} static`}
                          checked={l.frames.length === 1}
                          onChange={(e) =>
                            change((c) => {
                              c.layers![i].frames = e.target.checked
                                ? [l.frames[current % l.frames.length]]
                                : Array.from(
                                    { length: clip.frames.length },
                                    (_, f) => l.frames[f % l.frames.length],
                                  );
                            })
                          }
                        />
                        Static accessory
                      </label>
                    )}
                    {(['x', 'y'] as const).map((k) => (
                      <label key={k}>
                        Offset {k}
                        <input
                          aria-label={`${clip.name} layer ${i + 1} ${k}`}
                          type="number"
                          min={-128}
                          max={128}
                          value={l[k]}
                          onChange={(e) =>
                            change((c) => {
                              c.layers![i][k] = Math.max(
                                -128,
                                Math.min(128, Math.round(Number(e.target.value))),
                              );
                            })
                          }
                        />
                      </label>
                    ))}
                    {l.frames.map((id, f) => (
                      <select
                        key={f}
                        aria-label={`${clip.name} layer ${i + 1} frame ${f + 1}`}
                        value={id}
                        onChange={(e) =>
                          change((c) => {
                            c.layers![i].frames[f] = e.target.value;
                          })
                        }
                      >
                        {project.sprites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ))}
                  </>
                )}
              </details>
            </div>
          ))}
          <button
            disabled={clip.layers.length >= 8 || !project.sprites.length}
            onClick={() =>
              change((c) => {
                c.layers!.push({
                  name: 'Accessory',
                  visible: true,
                  x: 0,
                  y: 0,
                  frames: [project.sprites[0].id],
                });
              })
            }
          >
            + Layer
          </button>
        </>
      )}
    </details>
  );
}
