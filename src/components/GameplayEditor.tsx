import { PartyBattleEditor } from './PartyBattleEditor';
import { CutsceneFields, cutsceneBeatLabel } from './CutsceneFields';
import { DEFAULT_TEXT_SPEED, MAX_TEXT_SPEED } from '../gameplay/text-reveal';
import { AnimationLayers } from './AnimationLayers';
import { LayeredCharacterImporter } from './LayeredCharacterImporter';
import { BulletPatternsEditor, RpgDatabaseEditor } from './GameplayToolkit';
import { resourceUsageIndex } from '../gameplay/resources';
import { useState, useMemo } from 'react';
import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay, type Action, type EventScript, type Gameplay } from '../gameplay/model';
import { spriteUrl } from '../assets';
import { projectImages } from '../tile-assets';
import { animationFrames } from '../animation/layers';
import { installRecipe, type Recipe } from '../gameplay/recipes';
import '../gameplay.css';
const actionNames: Record<Action['type'], string> = {
  say: 'Dialogue / choice',
  state: 'Change state / inventory',
  branch: 'Branch on state',
  jump: 'Go to step',
  wait: 'Wait',
  warp: 'Change room + spawn',
  visible: 'Show / hide object',
  velocity: 'Set velocity',
  move: 'Stage actor movement',
  camera: 'Camera cue',
  checkpoint: 'Save / load checkpoint',
  sound: 'Play audio',
  end: 'End script',
  battle: 'RPG battle / outcomes',
  'party-rest': 'Rest party',
  emitter: 'Enable / disable bullet emitter',
};
export function newAction(type: Action['type'], p: Project): Action {
  const id = uid('step'),
    key = p.gameplay?.state[0]?.id ?? '';
  switch (type) {
    case 'say':
      return { id, type, speaker: 'Speaker', text: 'Hello, traveller.', choices: [] };
    case 'state':
      return { id, type, key, operation: 'add', value: 1 };
    case 'branch':
      return { id, type, condition: { key, compare: 'gte', value: 1 }, yes: '', no: '' };
    case 'jump':
      return { id, type, target: '' };
    case 'wait':
      return { id, type, ms: 500 };
    case 'warp':
      return { id, type, scene: p.scenes[0].id, x: 32, y: 64 };
    case 'visible':
      return { id, type, node: 'self', value: false };
    case 'velocity':
      return { id, type, node: 'self', x: 32, y: 0 };
    case 'move':
      return { id, type, node: 'player', x: 64, y: 64, ms: 1000 };
    case 'camera':
      return { id, type, mode: 'pan', x: 0, y: 0, ms: 1000 };
    case 'checkpoint':
      return { id, type, operation: 'save', success: '', failure: '' };
    case 'emitter':
      return { id, type, node: 'self', enabled: true };
    case 'sound':
      return { id, type, cue: p.audio[0]?.id ?? '' };
    case 'battle':
      return {
        id,
        type,
        encounter: p.gameplay?.rpg?.encounters[0]?.id ?? '',
        win: '',
        lose: '',
        escape: '',
      };
    case 'party-rest':
      return { id, type };
    case 'end':
      return { id, type };
  }
}
export function GameplayEditor({
  project,
  onEdit,
  sceneId,
}: {
  project: Project;
  onEdit: (change: (p: Project) => void) => void;
  sceneId?: string;
}) {
  const usage = useMemo(() => resourceUsageIndex(project), [project]);
  const [tab, setTab] = useState<
    'scripts' | 'cutscenes' | 'state' | 'animations' | 'patterns' | 'rpg' | 'party'
  >('scripts');
  const [selection, setSelection] = useState(''),
    [search, setSearch] = useState(''),
    [animationSearch, setAnimationSearch] = useState('');
  const g = project.gameplay ?? emptyGameplay(),
    scripts = g.scripts.filter((s) => tab !== 'cutscenes' || s.kind === 'cutscene'),
    script = scripts.find((s) => s.id === selection) ?? scripts[0];
  const animationImages = useMemo(
    () => new Map(projectImages(project).map((s) => [s.id, s])),
    [project.sprites, project.tilesets, project.gameplay],
  );
  const edit = (change: (g: Gameplay) => void) =>
    onEdit((p) => {
      p.gameplay ??= emptyGameplay();
      change(p.gameplay);
    });
  const scriptEdit = (change: (s: EventScript) => void) =>
    edit((g) => {
      const s = g.scripts.find((s) => s.id === script?.id);
      if (s) change(s);
    });
  const keySelect = (value: string, change: (v: string) => void) => (
    <select aria-label="State field" value={value} onChange={(e) => change(e.target.value)}>
      <option value="">Choose state…</option>
      {g.state.map((v) => (
        <option key={v.id} value={v.id}>
          {v.folder ? `${v.folder} / ` : ''}
          {v.name}
        </option>
      ))}
    </select>
  );
  const stepSelect = (value: string, change: (v: string) => void, emptyLabel = 'Next step') => (
    <select aria-label="Destination step" value={value} onChange={(e) => change(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {script?.actions.map((a, i) => (
        <option key={a.id} value={a.id}>
          {i + 1}. {actionNames[a.type]}
        </option>
      ))}
    </select>
  );
  const recipe = (kind: Recipe) =>
    onEdit((p) => {
      const id = installRecipe(p, kind);
      setSelection(id);
      setTab('scripts');
    });
  return (
    <div className="gameplay-editor">
      <header>
        <div>
          <h2>Gameplay</h2>
          <p>Build reusable interactions. Attach scripts to objects in the Scene inspector.</p>
        </div>
        <span>2D tools · preview + LVGL C</span>
      </header>
      <nav aria-label="Gameplay tools">
        {(['scripts', 'cutscenes', 'state', 'animations', 'patterns', 'rpg', 'party'] as const).map(
          (t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'cutscenes'
                ? 'Cutscene maker'
                : t === 'scripts'
                  ? 'Event scripts'
                  : t === 'state'
                    ? 'State & items'
                    : t === 'animations'
                      ? 'Sprite animation'
                      : t === 'patterns'
                        ? 'Bullet patterns'
                        : t === 'rpg'
                          ? 'RPG database'
                          : 'Party & battle'}
            </button>
          ),
        )}
      </nav>
      {tab === 'party' ? (
        <PartyBattleEditor project={project} onEdit={onEdit} />
      ) : tab === 'patterns' ? (
        <BulletPatternsEditor project={project} onEdit={onEdit} />
      ) : tab === 'rpg' ? (
        <RpgDatabaseEditor project={project} onEdit={onEdit} />
      ) : tab === 'scripts' || tab === 'cutscenes' ? (
        <div className="gameplay-columns">
          <aside>
            <input
              aria-label="Find gameplay script"
              placeholder="Find a script or folder…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() =>
                edit((g) => {
                  const s: EventScript = {
                    id: uid('script'),
                    name: tab === 'cutscenes' ? 'New cutscene' : 'New interaction',
                    folder: tab === 'cutscenes' ? 'Cutscenes' : 'Interactions',
                    blocking: true,
                    actions: [],
                    ...(tab === 'cutscenes' ? { kind: 'cutscene' as const } : {}),
                  };
                  g.scripts.push(s);
                  setSelection(s.id);
                })
              }
              disabled={g.scripts.length >= 512}
            >
              {tab === 'cutscenes' ? '+ New cutscene' : '+ New script'}
            </button>
            {scripts
              .filter((s) => (s.name + ' ' + s.folder).toLowerCase().includes(search.toLowerCase()))
              .map((s) => (
                <button
                  key={s.id}
                  className={s.id === script?.id ? 'selected' : ''}
                  onClick={() => setSelection(s.id)}
                >
                  <small>{s.folder || 'Scripts'}</small>
                  {s.name}
                </button>
              ))}
            <h3>Start from a recipe</h3>
            <button
              disabled={g.scripts.length >= 512 || g.state.length > 509}
              onClick={() => recipe('conversation')}
            >
              Conversation with choices
            </button>
            <button
              disabled={g.scripts.length >= 512 || g.state.length > 509}
              onClick={() => recipe('chest')}
            >
              One-time item chest
            </button>
            <button
              disabled={g.scripts.length >= 512 || g.state.length > 509}
              onClick={() => recipe('door')}
            >
              Door that needs a key
            </button>
            <button
              disabled={g.scripts.length >= 512 || g.state.length > 509}
              onClick={() => recipe('patrol')}
            >
              Timed patrol
            </button>
            <button
              disabled={g.scripts.length >= 512 || g.state.length > 509}
              onClick={() => recipe('battle')}
            >
              Simple turn-based encounter
            </button>
            <p>
              Recipes create editable scripts and state. They never add a hidden genre-specific
              runtime.
            </p>
          </aside>
          <main>
            {script ? (
              <>
                <div className="gameplay-resource-heading">
                  <label>
                    Script name
                    <input
                      aria-label="Script name"
                      value={script.name}
                      maxLength={128}
                      onChange={(e) =>
                        scriptEdit((s) => {
                          s.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Folder
                    <input
                      aria-label="Script folder"
                      value={script.folder}
                      maxLength={128}
                      onChange={(e) =>
                        scriptEdit((s) => {
                          s.folder = e.target.value;
                        })
                      }
                    />
                  </label>
                </div>
                <label className="gameplay-check">
                  <input
                    type="checkbox"
                    checked={script.blocking}
                    disabled={script.kind === 'cutscene'}
                    onChange={(e) =>
                      scriptEdit((s) => {
                        s.blocking = e.target.checked;
                      })
                    }
                  />{' '}
                  Lock player/world movement while this script runs
                </label>
                <p className="field-hint">
                  Dialogue always locks movement. Non-blocking scripts can drive patrols and timed
                  effects. At most 8 scripts run together.
                </p>
                <label className="gameplay-check">
                  <input
                    type="checkbox"
                    checked={script.kind === 'cutscene'}
                    onChange={(e) =>
                      scriptEdit((s) => {
                        s.kind = e.target.checked ? 'cutscene' : 'event';
                        if (e.target.checked) s.blocking = true;
                      })
                    }
                  />
                  Cinematic sequence
                </label>
                {script.kind === 'cutscene' && (
                  <section className="cutscene-guide">
                    <h3>Direct the scene</h3>
                    <p>
                      Add beats in order: frame a location, stage an actor, then write the
                      conversation. Attach this cutscene to a Start, Enter or Interact event in the
                      Scene inspector and press Play.
                    </p>
                    <p>
                      {(
                        script.actions.reduce(
                          (ms, a) =>
                            ms +
                            (a.type === 'move' || a.type === 'camera' || a.type === 'wait'
                              ? a.ms
                              : 0),
                          0,
                        ) / 1000
                      ).toFixed(1)}{' '}
                      seconds of timed beats + player-paced dialogue
                    </p>
                    <label>
                      Skip continues at
                      {stepSelect(
                        script.skipTo ?? '',
                        (v) =>
                          scriptEdit((s) => {
                            s.skipTo = v || undefined;
                          }),
                        'Skip disabled',
                      )}
                    </label>
                    <p className="field-hint">
                      Choose a completion beat before quest rewards or chapter flags. Leave empty to
                      disable skipping. The camera returns automatically.
                    </p>
                    <div className="gameplay-inline">
                      {(['camera', 'move', 'say', 'wait'] as const).map((type) => (
                        <button
                          key={type}
                          disabled={script.actions.length >= 128}
                          onClick={() =>
                            scriptEdit((s) => s.actions.push(newAction(type, project)))
                          }
                        >
                          + {actionNames[type]}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <ol className="event-actions" key={script.id}>
                  {script.actions.map((a, index) => {
                    const update = (change: (a: Action) => void) =>
                      scriptEdit((s) => change(s.actions[index]));
                    return (
                      <li key={a.id} data-testid="event-action">
                        <details open={script.kind === 'cutscene' ? index === 0 : true}>
                          <summary>
                            <b>{index + 1}</b> {actionNames[a.type]}
                            {script.kind === 'cutscene' && (
                              <span className="cutscene-beat-summary">{cutsceneBeatLabel(a)}</span>
                            )}
                            <code>{a.id}</code>
                          </summary>
                          <div className="event-action-fields">
                            <CutsceneFields
                              action={a}
                              project={project}
                              sceneId={sceneId}
                              update={update}
                            />
                            {a.type === 'checkpoint' && (
                              <>
                                <label>
                                  Checkpoint
                                  <select
                                    value={a.operation}
                                    onChange={(e) =>
                                      update((v) => {
                                        if (v.type === 'checkpoint')
                                          v.operation = e.target.value as 'save' | 'load';
                                      })
                                    }
                                  >
                                    <option value="save">Save progress</option>
                                    <option value="load">Load saved progress</option>
                                  </select>
                                </label>
                                <label>
                                  On success
                                  {stepSelect(a.success, (id) =>
                                    update((v) => {
                                      if (v.type === 'checkpoint') v.success = id;
                                    }),
                                  )}
                                </label>
                                <label>
                                  On missing / incompatible save
                                  {stepSelect(a.failure, (id) =>
                                    update((v) => {
                                      if (v.type === 'checkpoint') v.failure = id;
                                    }),
                                  )}
                                </label>
                                <p className="field-hint">
                                  Desktop checkpoints persist between runs. Firmware uses your
                                  storage callbacks in ui_config_t. Store a room/checkpoint state
                                  field and route to it after loading.
                                </p>
                              </>
                            )}
                            <label>
                              Action
                              <select
                                aria-label={`Action ${index + 1} type`}
                                value={a.type}
                                onChange={(e) =>
                                  scriptEdit((s) => {
                                    if (['move', 'camera'].includes(e.target.value)) {
                                      s.kind = 'cutscene';
                                      s.blocking = true;
                                    }
                                    s.actions[index] = {
                                      ...newAction(e.target.value as Action['type'], project),
                                      id: a.id,
                                    };
                                  })
                                }
                              >
                                {Object.entries(actionNames).map(([k, v]) => (
                                  <option
                                    key={k}
                                    value={k}
                                    disabled={
                                      (k === 'battle' && (!g.party || !g.rpg?.encounters.length)) ||
                                      (k === 'party-rest' && !g.party)
                                    }
                                  >
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {a.type === 'say' && (
                              <>
                                <label>
                                  Speaker
                                  <input
                                    aria-label="Dialogue speaker"
                                    maxLength={64}
                                    value={a.speaker}
                                    onChange={(e) =>
                                      update((x) => {
                                        if (x.type === 'say') x.speaker = e.target.value;
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  Text
                                  <textarea
                                    aria-label="Dialogue text"
                                    rows={3}
                                    maxLength={512}
                                    value={a.text}
                                    onChange={(e) =>
                                      update((x) => {
                                        if (x.type === 'say') x.text = e.target.value;
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  Text speed (characters/s)
                                  <input
                                    aria-label="Dialogue text speed"
                                    type="number"
                                    min={0}
                                    max={MAX_TEXT_SPEED}
                                    step={1}
                                    value={a.textSpeed ?? DEFAULT_TEXT_SPEED}
                                    onChange={(e) =>
                                      update((x) => {
                                        if (x.type === 'say')
                                          x.textSpeed = Math.max(
                                            0,
                                            Math.min(
                                              MAX_TEXT_SPEED,
                                              Math.round(Number(e.target.value) || 0),
                                            ),
                                          );
                                      })
                                    }
                                  />
                                  <small>
                                    0 = instant. Press once to reveal, then again to continue.
                                  </small>
                                </label>
                                {a.choices.map((c, i) => (
                                  <div className="gameplay-inline" key={i}>
                                    <label>
                                      Choice {i + 1}
                                      <input
                                        aria-label={`Choice ${i + 1} text`}
                                        maxLength={64}
                                        value={c.text}
                                        onChange={(e) =>
                                          update((x) => {
                                            if (x.type === 'say')
                                              x.choices[i].text = e.target.value;
                                          })
                                        }
                                      />
                                    </label>
                                    <label>
                                      Continue at
                                      {stepSelect(c.target, (v) =>
                                        update((x) => {
                                          if (x.type === 'say') x.choices[i].target = v;
                                        }),
                                      )}
                                    </label>
                                    <button
                                      onClick={() =>
                                        update((x) => {
                                          if (x.type === 'say') x.choices.splice(i, 1);
                                        })
                                      }
                                    >
                                      Remove choice
                                    </button>
                                  </div>
                                ))}
                                <button
                                  disabled={a.choices.length >= 4}
                                  onClick={() =>
                                    update((x) => {
                                      if (x.type === 'say')
                                        x.choices.push({ text: 'New choice', target: '' });
                                    })
                                  }
                                >
                                  + Choice
                                </button>
                              </>
                            )}
                            {(a.type === 'state' || a.type === 'branch') && (
                              <>
                                <label>
                                  Field
                                  {keySelect(a.type === 'state' ? a.key : a.condition.key, (v) =>
                                    update((x) => {
                                      if (x.type === 'state') x.key = v;
                                      else if (x.type === 'branch') x.condition.key = v;
                                    }),
                                  )}
                                </label>
                                {a.type === 'state' ? (
                                  <>
                                    <label>
                                      Operation
                                      <select
                                        value={a.operation}
                                        onChange={(e) =>
                                          update((x) => {
                                            if (x.type === 'state')
                                              x.operation = e.target.value as 'set' | 'add';
                                          })
                                        }
                                      >
                                        <option value="add">Add / subtract</option>
                                        <option value="set">Set</option>
                                      </select>
                                    </label>
                                    <label>
                                      Value
                                      <input
                                        type="number"
                                        aria-label="State value"
                                        min={-1000000}
                                        max={1000000}
                                        value={a.value}
                                        onChange={(e) =>
                                          update((x) => {
                                            if (x.type === 'state')
                                              x.value = Number(e.target.value);
                                          })
                                        }
                                      />
                                    </label>
                                  </>
                                ) : (
                                  <>
                                    <label>
                                      Comparison
                                      <select
                                        value={a.condition.compare}
                                        onChange={(e) =>
                                          update((x) => {
                                            if (x.type === 'branch')
                                              x.condition.compare = e.target
                                                .value as typeof a.condition.compare;
                                          })
                                        }
                                      >
                                        <option value="eq">Equals</option>
                                        <option value="ne">Does not equal</option>
                                        <option value="lt">Less than</option>
                                        <option value="gte">At least</option>
                                      </select>
                                    </label>
                                    <label>
                                      Value
                                      <input
                                        type="number"
                                        min={-1000000}
                                        max={1000000}
                                        value={a.condition.value}
                                        onChange={(e) =>
                                          update((x) => {
                                            if (x.type === 'branch')
                                              x.condition.value = Number(e.target.value);
                                          })
                                        }
                                      />
                                    </label>
                                    <label>
                                      If true
                                      {stepSelect(a.yes, (v) =>
                                        update((x) => {
                                          if (x.type === 'branch') x.yes = v;
                                        }),
                                      )}
                                    </label>
                                    <label>
                                      Otherwise
                                      {stepSelect(a.no, (v) =>
                                        update((x) => {
                                          if (x.type === 'branch') x.no = v;
                                        }),
                                      )}
                                    </label>
                                  </>
                                )}
                              </>
                            )}
                            {a.type === 'jump' && (
                              <label>
                                Continue at
                                {stepSelect(a.target, (v) =>
                                  update((x) => {
                                    if (x.type === 'jump') x.target = v;
                                  }),
                                )}
                              </label>
                            )}
                            {a.type === 'wait' && (
                              <label>
                                Milliseconds
                                <input
                                  type="number"
                                  min={0}
                                  max={600000}
                                  value={a.ms}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (x.type === 'wait') x.ms = Number(e.target.value);
                                    })
                                  }
                                />
                              </label>
                            )}
                            {a.type === 'battle' && (
                              <>
                                <label>
                                  Encounter table
                                  <select
                                    aria-label="Battle encounter"
                                    value={a.encounter}
                                    onChange={(e) =>
                                      update((x) => {
                                        if (x.type === 'battle') x.encounter = e.target.value;
                                      })
                                    }
                                  >
                                    {project.gameplay?.rpg?.encounters.map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {v.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {(['win', 'lose', 'escape'] as const).map((k) => (
                                  <label key={k}>
                                    {k === 'win'
                                      ? 'On victory'
                                      : k === 'lose'
                                        ? 'On defeat'
                                        : 'On escape'}
                                    {stepSelect(a[k], (v) =>
                                      update((x) => {
                                        if (x.type === 'battle') x[k] = v;
                                      }),
                                    )}
                                  </label>
                                ))}
                                <p>
                                  Waits for combat and Continue, then follows the outcome. Set up a
                                  starting party in Party & battle.
                                </p>
                              </>
                            )}
                            {a.type === 'warp' && (
                              <label>
                                Destination room
                                <select
                                  value={a.scene}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (x.type === 'warp') x.scene = e.target.value;
                                    })
                                  }
                                >
                                  {project.scenes.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {(a.type === 'warp' || a.type === 'velocity') && (
                              <div className="gameplay-inline">
                                {(['x', 'y'] as const).map((k) => (
                                  <label key={k}>
                                    {k.toUpperCase()}
                                    {a.type === 'warp' ? ' spawn (world px)' : ' px/s'}
                                    <input
                                      type="number"
                                      min={a.type === 'warp' ? -4096 : -1200}
                                      max={a.type === 'warp' ? 4096 : 1200}
                                      value={a[k]}
                                      onChange={(e) =>
                                        update((x) => {
                                          if (x.type === 'warp' || x.type === 'velocity')
                                            x[k] = Number(e.target.value);
                                        })
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            )}
                            {(a.type === 'visible' ||
                              a.type === 'velocity' ||
                              a.type === 'emitter') && (
                              <label>
                                Object
                                <input
                                  aria-label="Action object"
                                  value={a.node}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (
                                        x.type === 'visible' ||
                                        x.type === 'velocity' ||
                                        x.type === 'emitter'
                                      )
                                        x.node = e.target.value;
                                    })
                                  }
                                />
                                <small>
                                  self, player, other, or a resolved scene path such as hero/weapon
                                </small>
                              </label>
                            )}
                            {a.type === 'visible' && (
                              <label className="gameplay-check">
                                <input
                                  type="checkbox"
                                  checked={a.value}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (x.type === 'visible') x.value = e.target.checked;
                                    })
                                  }
                                />{' '}
                                Visible and active for collisions
                              </label>
                            )}
                            {a.type === 'emitter' && (
                              <label>
                                Emitter state
                                <select
                                  aria-label="Emitter state"
                                  value={a.enabled ? 'on' : 'off'}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (x.type === 'emitter') x.enabled = e.target.value === 'on';
                                    })
                                  }
                                >
                                  <option value="on">Enabled</option>
                                  <option value="off">Disabled</option>
                                </select>
                              </label>
                            )}
                            {a.type === 'sound' && (
                              <label>
                                Audio cue
                                <select
                                  value={a.cue}
                                  onChange={(e) =>
                                    update((x) => {
                                      if (x.type === 'sound') x.cue = e.target.value;
                                    })
                                  }
                                >
                                  <option value="">Choose audio…</option>
                                  {project.audio.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <div className="gameplay-inline">
                              <button
                                disabled={!index}
                                onClick={() =>
                                  scriptEdit((s) => {
                                    [s.actions[index - 1], s.actions[index]] = [
                                      s.actions[index],
                                      s.actions[index - 1],
                                    ];
                                  })
                                }
                              >
                                Move up
                              </button>
                              <button
                                disabled={index === script.actions.length - 1}
                                onClick={() =>
                                  scriptEdit((s) => {
                                    [s.actions[index + 1], s.actions[index]] = [
                                      s.actions[index],
                                      s.actions[index + 1],
                                    ];
                                  })
                                }
                              >
                                Move down
                              </button>
                              <button
                                onClick={() =>
                                  scriptEdit((s) => {
                                    s.actions.splice(index, 1);
                                    if (s.skipTo === a.id) s.skipTo = undefined;
                                    for (const v of s.actions)
                                      if (v.type === 'checkpoint') {
                                        if (v.success === a.id) v.success = '';
                                        if (v.failure === a.id) v.failure = '';
                                      }
                                    for (const x of s.actions) {
                                      if (x.type === 'jump' && x.target === a.id) x.target = '';
                                      if (x.type === 'branch') {
                                        if (x.yes === a.id) x.yes = '';
                                        if (x.no === a.id) x.no = '';
                                      }
                                      if (x.type === 'battle') {
                                        if (x.win === a.id) x.win = '';
                                        if (x.lose === a.id) x.lose = '';
                                        if (x.escape === a.id) x.escape = '';
                                      }
                                      if (x.type === 'say')
                                        for (const c of x.choices)
                                          if (c.target === a.id) c.target = '';
                                    }
                                  })
                                }
                              >
                                Delete step
                              </button>
                            </div>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
                <button
                  disabled={script.actions.length >= 128}
                  onClick={() => scriptEdit((s) => s.actions.push(newAction('say', project)))}
                >
                  + Add action
                </button>
                <p className="field-hint">
                  Step links use stable IDs, so reordering actions preserves branches. A blank
                  destination continues to the next step.
                </p>
                <div className="gameplay-inline">
                  <button
                    disabled={g.scripts.length >= 512}
                    onClick={() =>
                      edit((g) => {
                        const copy = structuredClone(script);
                        copy.id = uid('script');
                        copy.name = (script.name + ' copy').slice(0, 128);
                        g.scripts.push(copy);
                        setSelection(copy.id);
                      })
                    }
                  >
                    Duplicate script
                  </button>
                  <button
                    disabled={usage('script', script.id).length > 0}
                    title="Detach event pages before deleting a used script"
                    onClick={() =>
                      edit((g) => {
                        g.scripts = g.scripts.filter((s) => s.id !== script.id);
                        setSelection('');
                      })
                    }
                  >
                    Delete script
                  </button>
                </div>
                <p className="field-hint">
                  Used by:{' '}
                  {usage('script', script.id).join(' · ') ||
                    'No objects yet. Attach an event page in the Scene inspector.'}
                </p>
                <code>{script.id}</code>
              </>
            ) : (
              <div className="gameplay-empty">
                <h3>Make your first interaction</h3>
                <p>
                  Choose a recipe, then attach its script to an object’s event in the Scene
                  inspector.
                </p>
              </div>
            )}
          </main>
        </div>
      ) : tab === 'state' ? (
        <main className="gameplay-resources">
          <div className="gameplay-inline">
            <h3>State & inventory</h3>
            <button
              disabled={g.state.length >= 512}
              onClick={() =>
                edit((g) =>
                  g.state.push({
                    id: uid('state'),
                    name: 'New state',
                    folder: 'Game',
                    kind: 'counter',
                    initial: 0,
                    min: 0,
                    max: 999,
                    persistent: true,
                  }),
                )
              }
            >
              + State field
            </button>
          </div>
          <p>
            Flags track quests. Counters track health and currency. Items are stack counts.
            Persistent fields survive room changes and enter save buffers.
          </p>
          {g.state.map((v) => (
            <section className="gameplay-state" key={v.id}>
              <div className="gameplay-resource-heading">
                <label>
                  Name
                  <input
                    aria-label="State name"
                    value={v.name}
                    maxLength={128}
                    onChange={(e) =>
                      edit((g) => {
                        g.state.find((x) => x.id === v.id)!.name = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Folder
                  <input
                    value={v.folder}
                    maxLength={128}
                    onChange={(e) =>
                      edit((g) => {
                        g.state.find((x) => x.id === v.id)!.folder = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Kind
                  <select
                    aria-label="State kind"
                    value={v.kind}
                    onChange={(e) =>
                      edit((g) => {
                        const x = g.state.find((x) => x.id === v.id)!;
                        x.kind = e.target.value as typeof v.kind;
                        if (x.kind === 'flag') {
                          x.min = 0;
                          x.max = 1;
                          x.initial = Math.min(1, Math.max(0, x.initial));
                        }
                      })
                    }
                  >
                    <option value="flag">Quest flag / switch</option>
                    <option value="counter">Number / counter</option>
                    <option value="item">Inventory item stack</option>
                  </select>
                </label>
              </div>
              <div className="gameplay-inline">
                {(['min', 'initial', 'max'] as const).map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      type="number"
                      aria-label={`State ${k}`}
                      disabled={v.kind === 'flag' && k !== 'initial'}
                      min={k === 'initial' ? v.min : -1000000}
                      max={k === 'initial' ? v.max : 1000000}
                      value={v[k]}
                      onChange={(e) =>
                        edit((g) => {
                          const x = g.state.find((x) => x.id === v.id)!;
                          x[k] = Number(e.target.value);
                          if (k === 'min' && x.max < x.min) x.max = x.min;
                          if (k === 'max' && x.min > x.max) x.min = x.max;
                          x.initial = Math.max(x.min, Math.min(x.max, x.initial));
                        })
                      }
                    />
                  </label>
                ))}
                <label className="gameplay-check">
                  <input
                    type="checkbox"
                    checked={v.persistent}
                    onChange={(e) =>
                      edit((g) => {
                        g.state.find((x) => x.id === v.id)!.persistent = e.target.checked;
                      })
                    }
                  />{' '}
                  Include in save
                </label>
              </div>
              <p className="field-hint">
                Used by: {usage('state', v.id).join(' · ') || 'No authored references'}
              </p>
              <button
                disabled={usage('state', v.id).length > 0}
                title="Remove action/page references before deleting a used field"
                onClick={() =>
                  edit((g) => {
                    g.state = g.state.filter((x) => x.id !== v.id);
                  })
                }
              >
                Delete state field
              </button>
              <code>{v.id}</code>
            </section>
          ))}
        </main>
      ) : (
        <main className="gameplay-resources">
          <div className="gameplay-inline">
            <h3>Sprite clips</h3>
            <button
              disabled={!project.sprites.length || g.animations.length >= 64}
              onClick={() =>
                edit((g) =>
                  g.animations.push({
                    id: uid('clip'),
                    name: 'New clip',
                    fps: 8,
                    loop: true,
                    frames: [project.sprites[0].id],
                  }),
                )
              }
            >
              + Animation clip
            </button>
          </div>
          <LayeredCharacterImporter project={project} onEdit={onEdit} sceneId={sceneId} />
          <label className="block-label">
            Find character or clip
            <input
              aria-label="Search animations"
              placeholder="Mira, Rowan, move Right…"
              value={animationSearch}
              onChange={(e) => setAnimationSearch(e.target.value)}
            />
          </label>
          <p>
            Add frames in playback order, then assign Idle / Move / Jump / Fall clips on a sprite’s
            inspector. Frames are baked to its display size and palette packed for LVGL.
          </p>
          {g.animations
            .filter((c) =>
              `${c.name} ${c.id}`.toLowerCase().includes(animationSearch.toLowerCase()),
            )
            .map((c) => (
              <section className="gameplay-state" key={c.id}>
                <div className="gameplay-resource-heading">
                  <label>
                    Name
                    <input
                      aria-label="Animation clip name"
                      value={c.name}
                      maxLength={128}
                      onChange={(e) =>
                        edit((g) => {
                          g.animations.find((x) => x.id === c.id)!.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    FPS
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={c.fps}
                      onChange={(e) =>
                        edit((g) => {
                          g.animations.find((x) => x.id === c.id)!.fps = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                  <label className="gameplay-check">
                    <input
                      type="checkbox"
                      checked={c.loop}
                      onChange={(e) =>
                        edit((g) => {
                          g.animations.find((x) => x.id === c.id)!.loop = e.target.checked;
                        })
                      }
                    />{' '}
                    Loop
                  </label>
                </div>
                <div className="animation-frames">
                  {c.frames.map((id, i) => (
                    <label key={i}>
                      {animationImages.get(animationFrames(c)[i]) && (
                        <img
                          alt={`Frame ${i + 1}`}
                          src={spriteUrl(animationImages.get(animationFrames(c)[i])!)}
                        />
                      )}
                      {!c.layers && (
                        <select
                          aria-label={`Animation frame ${i + 1}`}
                          value={id}
                          onChange={(e) =>
                            edit((g) => {
                              g.animations.find((x) => x.id === c.id)!.frames[i] = e.target.value;
                            })
                          }
                        >
                          {project.sprites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {c.layers && <small>Shared frame {i + 1}</small>}
                      <button
                        disabled={c.frames.length === 1}
                        onClick={() =>
                          edit((g) => {
                            g.animations.find((x) => x.id === c.id)!.frames.splice(i, 1);
                            for (const layer of g.animations.find((x) => x.id === c.id)!.layers ??
                              [])
                              if (layer.frames.length > 1) layer.frames.splice(i, 1);
                          })
                        }
                      >
                        Remove
                      </button>
                    </label>
                  ))}
                </div>
                <button
                  disabled={c.frames.length >= 32}
                  onClick={() =>
                    edit((g) => {
                      const clip = g.animations.find((x) => x.id === c.id)!;
                      clip.frames.push(c.frames[c.frames.length - 1]);
                      for (const layer of clip.layers ?? [])
                        if (layer.frames.length > 1)
                          layer.frames.push(layer.frames[layer.frames.length - 1]);
                    })
                  }
                >
                  + Frame
                </button>
                <AnimationLayers
                  clip={c}
                  project={project}
                  onChange={(value) =>
                    edit((g) => {
                      g.animations[g.animations.findIndex((x) => x.id === c.id)] = value;
                    })
                  }
                />
                <p className="field-hint">
                  Used by: {usage('animation', c.id).join(' · ') || 'No sprites yet'}
                </p>
                <button
                  disabled={usage('animation', c.id).length > 0}
                  title="Detach animator references before deleting a used clip"
                  onClick={() =>
                    edit((g) => {
                      g.animations = g.animations.filter((x) => x.id !== c.id);
                    })
                  }
                >
                  Delete animation clip
                </button>
                <code>{c.id}</code>
              </section>
            ))}
        </main>
      )}
    </div>
  );
}
