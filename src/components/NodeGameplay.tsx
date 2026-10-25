import { NodeMelee } from './NodeMelee';
import { StateBindings } from './StateBindings';
import type { GameNode, Project } from '../model';
import { uid } from '../model';
import { triggers, type Animator, type EventPage, type Compare } from '../gameplay/model';
export function NodeGameplay({
  node,
  project,
  onChange,
  onOpen,
}: {
  node: GameNode;
  project: Project;
  onChange: (c: Partial<GameNode>) => void;
  onOpen: () => void;
}) {
  const scripts = project.gameplay?.scripts ?? [],
    fields = project.gameplay?.state ?? [];
  const change = (i: number, fn: (e: EventPage) => void) => {
    const events = structuredClone(node.events ?? []);
    fn(events[i]);
    onChange({ events });
  };
  const animationSlot = (k: keyof Animator) => (
    <label className="form-row" key={k}>
      {k.replace(/([A-Z])/g, ' $1')}
      <select
        aria-label={`${k} animation`}
        value={node.animator?.[k] ?? ''}
        onChange={(e) =>
          onChange({
            animator: {
              idle: '',
              move: '',
              jump: '',
              fall: '',
              ...node.animator,
              [k]: e.target.value,
            } as Animator,
          })
        }
      >
        <option value="">{k === 'idle' ? 'Static sprite' : 'Use idle'}</option>
        {project.gameplay?.animations.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {node.kind === 'button' && (
        <label className="form-row">
          Controller input
          <select
            aria-label="Controller input"
            value={node.inputAction ?? ''}
            onChange={(e) =>
              onChange({ inputAction: (e.target.value || undefined) as GameNode['inputAction'] })
            }
          >
            <option value="">None</option>
            {['left', 'right', 'up', 'down', 'action', 'interact', 'menu'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      <NodeMelee node={node} onChange={onChange} />
      <StateBindings
        node={node}
        project={project}
        onChange={(stateBindings) => onChange({ stateBindings })}
      />{' '}
      <details className="inspector-section" open>
        <summary>
          <h3>Gameplay events</h3>
        </summary>
        <p className="field-hint">
          Last matching page per trigger wins. Hit runs when a projectile or melee swing strikes
          this body or area. Interact uses E / Z / Enter near the object in front of the player.
        </p>
        {(node.events ?? []).map((e, i) => (
          <div key={e.id} className="node-event-page">
            <label className="block-label">
              When
              <select
                aria-label="Event trigger"
                value={e.trigger}
                onChange={(v) =>
                  change(i, (e) => {
                    e.trigger = v.target.value as EventPage['trigger'];
                  })
                }
              >
                {triggers.map((t) => (
                  <option key={t} value={t}>
                    {t === 'interact'
                      ? 'Player interacts'
                      : t === 'enter'
                        ? 'Area entered'
                        : t === 'exit'
                          ? 'Area exited'
                          : t === 'start'
                            ? 'Scene starts'
                            : t === 'collect'
                              ? 'Collected'
                              : t === 'click'
                                ? 'Button clicked'
                                : t === 'hit'
                                  ? 'Hit by projectile / melee'
                                  : 'Scene complete'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block-label">
              Run script
              <select
                aria-label="Event script"
                value={e.script}
                onChange={(v) =>
                  change(i, (e) => {
                    e.script = v.target.value;
                  })
                }
              >
                <option value="">Choose script…</option>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.folder ? `${s.folder} / ` : ''}
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-row">
              Conditional page
              <input
                type="checkbox"
                aria-label="Conditional event page"
                disabled={!fields.length}
                checked={!!e.when}
                onChange={(v) =>
                  change(i, (e) => {
                    if (v.target.checked) e.when = { key: fields[0].id, compare: 'eq', value: 1 };
                    else delete e.when;
                  })
                }
              />
            </label>
            {e.when && (
              <>
                <select
                  aria-label="Page state field"
                  value={e.when.key}
                  onChange={(v) =>
                    change(i, (e) => {
                      e.when!.key = v.target.value;
                    })
                  }
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Page comparison"
                  value={e.when.compare}
                  onChange={(v) =>
                    change(i, (e) => {
                      e.when!.compare = v.target.value as Compare;
                    })
                  }
                >
                  <option value="eq">Equals</option>
                  <option value="ne">Not equal</option>
                  <option value="gte">At least</option>
                  <option value="lt">Less than</option>
                </select>
                <input
                  type="number"
                  aria-label="Page state value"
                  min={-1000000}
                  max={1000000}
                  value={e.when.value}
                  onChange={(v) =>
                    change(i, (e) => {
                      e.when!.value = Number(v.target.value);
                    })
                  }
                />
              </>
            )}
            <button onClick={() => onChange({ events: node.events!.filter((_, j) => i !== j) })}>
              Remove page
            </button>
            <button
              disabled={i === 0}
              onClick={() => {
                const events = [...node.events!];
                [events[i - 1], events[i]] = [events[i], events[i - 1]];
                onChange({ events });
              }}
            >
              Lower priority
            </button>
          </div>
        ))}
        <button
          disabled={!scripts.length || (node.events?.length ?? 0) >= 8}
          onClick={() =>
            onChange({
              events: [
                ...(node.events ?? []),
                { id: uid('event'), trigger: 'interact', script: scripts[0].id },
              ],
            })
          }
        >
          + Event page
        </button>
        <button onClick={onOpen}>Open Gameplay tools</button>
      </details>
      {node.kind === 'sprite' && (
        <details className="inspector-section" open>
          <summary>
            <h3>Sprite animation</h3>
          </summary>
          {(['idle', 'move', 'jump', 'fall', 'attack'] as const).map(animationSlot)}
          <details>
            <summary>Directional clips · optional</summary>
            {(
              [
                'attackUp',
                'attackDown',
                'attackLeft',
                'attackRight',
                'idleUp',
                'moveUp',
                'idleDown',
                'moveDown',
                'idleLeft',
                'moveLeft',
                'idleRight',
                'moveRight',
              ] as const
            ).map(animationSlot)}
          </details>
          <p className="field-hint">
            Motion clips switch from actual body velocity. Use the Gameplay workspace to edit frame
            order.
          </p>
        </details>
      )}
    </>
  );
}
