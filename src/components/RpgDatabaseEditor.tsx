import { RpgBattleFields } from './RpgBattleFields';
import { useMemo, useState } from 'react';
import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay } from '../gameplay/model';
import { actorStats, emptyRpg, type RpgDatabase } from '../gameplay/toolkit';
import { resourceUsageIndex } from '../gameplay/resources';
import { NumberField } from './GameplayFields';
type Edit = (change: (p: Project) => void) => void;
type Kind = Exclude<keyof RpgDatabase, 'statuses'>;
const labels: Record<Kind, string> = {
  items: 'Items',
  skills: 'Skills',
  actors: 'Actors & species',
  encounters: 'Encounter tables',
};
export function RpgDatabaseEditor({ project, onEdit }: { project: Project; onEdit: Edit }) {
  const [kind, setKind] = useState<Kind>('items'),
    [selection, setSelection] = useState(''),
    [search, setSearch] = useState(''),
    [level, setLevel] = useState(1);
  const db = project.gameplay?.rpg ?? emptyRpg(),
    rows = db[kind],
    row = rows.find((v) => v.id === selection) ?? rows[0];
  const usage = useMemo(() => resourceUsageIndex(project), [project]);
  const edit = (fn: (db: RpgDatabase, p: Project) => void) =>
    onEdit((p) => {
      p.gameplay ??= emptyGameplay();
      p.gameplay.rpg ??= emptyRpg();
      fn(p.gameplay.rpg, p);
    });
  const patch = (fn: (db: RpgDatabase) => void) => edit(fn);
  const add = () =>
    edit((d) => {
      const id = uid(kind === 'encounters' ? 'encounter' : kind.slice(0, -1)),
        base = {
          id,
          name:
            'New ' +
            (kind === 'actors'
              ? 'actor'
              : kind === 'encounters'
                ? 'encounter table'
                : kind.slice(0, -1)),
          folder: labels[kind],
        };
      if (kind === 'items')
        d.items.push({ ...base, description: '', icon: '', stack: '', price: 0, heal: 20 });
      if (kind === 'skills')
        d.skills.push({
          ...base,
          description: '',
          effect: 'damage',
          power: 10,
          cost: 0,
          accuracy: 100,
        });
      if (kind === 'actors')
        d.actors.push({
          ...base,
          sprite: '',
          hp: 30,
          attack: 8,
          defense: 4,
          speed: 6,
          hpGrowth: 5,
          attackGrowth: 2,
          defenseGrowth: 1,
          speedGrowth: 1,
          skills: [],
          experience: 10,
        });
      if (kind === 'encounters')
        d.encounters.push({
          ...base,
          entries: [{ actor: d.actors[0].id, weight: 100, minLevel: 1, maxLevel: 3 }],
        });
      setSelection(id);
    });
  const resourceKind =
    kind === 'encounters'
      ? 'encounter'
      : kind === 'actors'
        ? 'actor'
        : kind === 'skills'
          ? 'skill'
          : 'item';
  const uses = row ? usage(resourceKind, row.id) : [];
  const item = kind === 'items' ? db.items.find((v) => v.id === row?.id) : undefined;
  const skill = kind === 'skills' ? db.skills.find((v) => v.id === row?.id) : undefined;
  const actor = kind === 'actors' ? db.actors.find((v) => v.id === row?.id) : undefined;
  const table = kind === 'encounters' ? db.encounters.find((v) => v.id === row?.id) : undefined;
  return (
    <div className="gameplay-columns">
      <aside>
        {(Object.keys(labels) as Kind[]).map((k) => (
          <button
            key={k}
            className={kind === k ? 'active' : ''}
            onClick={() => {
              setKind(k);
              setSelection('');
            }}
          >
            {labels[k]} · {db[k].length}/128
          </button>
        ))}
        <input
          aria-label="Find RPG resource"
          placeholder="Find name or folder…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          disabled={rows.length >= 128 || (kind === 'encounters' && !db.actors.length)}
          onClick={add}
        >
          + New{' '}
          {kind === 'encounters'
            ? 'encounter table'
            : kind === 'actors'
              ? 'actor'
              : kind.slice(0, -1)}
        </button>
        {kind === 'encounters' && !db.actors.length && (
          <p>Create an actor first, then add it to a weighted encounter table.</p>
        )}
        {rows
          .filter((v) => (v.name + ' ' + v.folder).toLowerCase().includes(search.toLowerCase()))
          .map((v) => (
            <button
              key={v.id}
              className={row?.id === v.id ? 'selected' : ''}
              onClick={() => setSelection(v.id)}
            >
              <small>{v.folder}</small>
              {v.name}
            </button>
          ))}
        <p>
          Stable IDs link resources across rooms. Folders organize authoring. Firmware receives
          immutable C tables and small integer helpers.
        </p>
      </aside>
      <main>
        {row ? (
          <>
            <h2>{labels[kind]}</h2>
            <div className="gameplay-resource-heading">
              <label>
                Resource name
                <input
                  aria-label="RPG resource name"
                  maxLength={128}
                  value={row.name}
                  onChange={(e) =>
                    patch((d) => {
                      d[kind].find((v) => v.id === row.id)!.name = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Folder
                <input
                  aria-label="RPG resource folder"
                  maxLength={128}
                  value={row.folder}
                  onChange={(e) =>
                    patch((d) => {
                      d[kind].find((v) => v.id === row.id)!.folder = e.target.value;
                    })
                  }
                />
              </label>
            </div>
            {item && (
              <>
                <label>
                  Description
                  <textarea
                    aria-label="Item description"
                    maxLength={512}
                    value={item.description}
                    onChange={(e) =>
                      patch((d) => {
                        d.items.find((v) => v.id === item.id)!.description = e.target.value;
                      })
                    }
                  />
                </label>
                <div className="toolkit-fields">
                  <NumberField
                    label="Price"
                    value={item.price}
                    max={1000000}
                    onChange={(price) =>
                      patch((d) => {
                        d.items.find((v) => v.id === item.id)!.price = price;
                      })
                    }
                  />
                  <NumberField
                    label="Item healing"
                    min={item.revive ? 1 : 0}
                    value={item.heal}
                    onChange={(heal) =>
                      patch((d) => {
                        d.items.find((v) => v.id === item.id)!.heal = heal;
                      })
                    }
                  />
                  <label>
                    Inventory stack
                    <select
                      aria-label="Item inventory stack"
                      value={item.stack}
                      onChange={(e) =>
                        patch((d) => {
                          d.items.find((v) => v.id === item.id)!.stack = e.target.value;
                        })
                      }
                    >
                      <option value="">Application owned</option>
                      {project.gameplay?.state
                        .filter((v) => v.kind === 'item')
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Icon
                    <select
                      value={item.icon}
                      onChange={(e) =>
                        patch((d) => {
                          d.items.find((v) => v.id === item.id)!.icon = e.target.value;
                        })
                      }
                    >
                      <option value="">None</option>
                      {project.sprites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!item.stack && (
                  <button
                    disabled={(project.gameplay?.state.length ?? 0) >= 512}
                    onClick={() =>
                      edit((d, p) => {
                        const key = uid('inventory');
                        p.gameplay!.state.push({
                          id: key,
                          name: item.name + ' quantity',
                          folder: 'Inventory',
                          kind: 'item',
                          initial: 0,
                          min: 0,
                          max: 99,
                          persistent: true,
                        });
                        d.items.find((v) => v.id === item.id)!.stack = key;
                      })
                    }
                  >
                    Create saved inventory stack
                  </button>
                )}
                <p>
                  Inventory counts use the existing state/save system. Healing and price are data
                  for your shop, menu or combat rules.
                </p>
              </>
            )}
            {skill && (
              <>
                <label>
                  Description
                  <textarea
                    maxLength={512}
                    value={skill.description}
                    onChange={(e) =>
                      patch((d) => {
                        d.skills.find((v) => v.id === skill.id)!.description = e.target.value;
                      })
                    }
                  />
                </label>
                <div className="toolkit-fields">
                  <label>
                    Effect
                    <select
                      aria-label="Skill effect"
                      value={skill.effect}
                      onChange={(e) =>
                        patch((d) => {
                          d.skills.find((v) => v.id === skill.id)!.effect = e.target.value as
                            'damage' | 'heal';
                        })
                      }
                    >
                      <option value="damage">Damage</option>
                      <option value="heal">Heal</option>
                    </select>
                  </label>
                  {(['power', 'cost', 'accuracy'] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={'Skill ' + key}
                      value={skill[key]}
                      max={key === 'accuracy' ? 100 : 9999}
                      onChange={(value) =>
                        patch((d) => {
                          d.skills.find((v) => v.id === skill.id)![key] = value;
                        })
                      }
                    />
                  ))}
                </div>
                <p>
                  Integer amount helper: damage = max(1, power + attack − defense / 2); healing =
                  power. Accuracy uses an explicit 0–99 roll. The optional party system handles
                  turns, MP and status effects.
                </p>
              </>
            )}
            {actor && (
              <>
                <label>
                  Sprite
                  <select
                    aria-label="Actor sprite"
                    value={actor.sprite}
                    onChange={(e) =>
                      patch((d) => {
                        d.actors.find((v) => v.id === actor.id)!.sprite = e.target.value;
                      })
                    }
                  >
                    <option value="">None</option>
                    {project.sprites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="toolkit-fields">
                  {(
                    [
                      'hp',
                      'attack',
                      'defense',
                      'speed',
                      'hpGrowth',
                      'attackGrowth',
                      'defenseGrowth',
                      'speedGrowth',
                      'experience',
                    ] as const
                  ).map((key) => (
                    <NumberField
                      key={key}
                      label={'Actor ' + key}
                      value={actor[key]}
                      min={key === 'hp' || key === 'attack' ? 1 : 0}
                      max={key.endsWith('Growth') ? 100 : key === 'experience' ? 1000000 : 9999}
                      onChange={(value) =>
                        patch((d) => {
                          d.actors.find((v) => v.id === actor.id)![key] = value;
                        })
                      }
                    />
                  ))}
                </div>
                <h3>Known skills · {actor.skills.length}/8</h3>
                <div className="toolkit-fields">
                  {db.skills.map((s) => (
                    <label key={s.id} className="gameplay-check">
                      <input
                        type="checkbox"
                        checked={actor.skills.includes(s.id)}
                        disabled={!actor.skills.includes(s.id) && actor.skills.length >= 8}
                        onChange={(e) =>
                          patch((d) => {
                            const a = d.actors.find((v) => v.id === actor.id)!;
                            a.skills = e.target.checked
                              ? [...a.skills, s.id]
                              : a.skills.filter((id) => id !== s.id);
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
                <div className="gameplay-inline">
                  <NumberField
                    label="Preview level"
                    value={level}
                    min={1}
                    max={100}
                    onChange={setLevel}
                  />
                  <p>
                    {Object.entries(actorStats(actor, level) ?? {})
                      .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                      .join(' · ')}
                  </p>
                </div>
                <p>
                  Stats grow linearly per level and saturate at 9,999. No per-actor runtime
                  allocation or hidden battle loop.
                </p>
              </>
            )}
            {table && (
              <>
                <p>
                  Weights are relative. Selection and level use caller-supplied random rolls, so
                  encounters are reproducible.
                </p>
                {table.entries.map((entry, i) => (
                  <div className="encounter-entry" key={i}>
                    <label>
                      Actor
                      <select
                        aria-label={`Encounter actor ${i + 1}`}
                        value={entry.actor}
                        onChange={(e) =>
                          patch((d) => {
                            d.encounters.find((v) => v.id === table.id)!.entries[i].actor =
                              e.target.value;
                          })
                        }
                      >
                        {db.actors.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumberField
                      label={`Weight ${i + 1}`}
                      value={entry.weight}
                      min={1}
                      max={255}
                      onChange={(weight) =>
                        patch((d) => {
                          d.encounters.find((v) => v.id === table.id)!.entries[i].weight = weight;
                        })
                      }
                    />
                    <NumberField
                      label={`Minimum level ${i + 1}`}
                      value={entry.minLevel}
                      min={1}
                      max={100}
                      onChange={(minLevel) =>
                        patch((d) => {
                          const e = d.encounters.find((v) => v.id === table.id)!.entries[i];
                          e.minLevel = minLevel;
                          e.maxLevel = Math.max(e.maxLevel, minLevel);
                        })
                      }
                    />
                    <NumberField
                      label={`Maximum level ${i + 1}`}
                      value={entry.maxLevel}
                      min={entry.minLevel}
                      max={100}
                      onChange={(maxLevel) =>
                        patch((d) => {
                          d.encounters.find((v) => v.id === table.id)!.entries[i].maxLevel =
                            maxLevel;
                        })
                      }
                    />
                    <span>
                      {Math.round(
                        (entry.weight / table.entries.reduce((s, e) => s + e.weight, 0)) * 100,
                      )}
                      %
                    </span>
                    <button
                      disabled={table.entries.length <= 1}
                      onClick={() =>
                        patch((d) => {
                          d.encounters.find((v) => v.id === table.id)!.entries.splice(i, 1);
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  disabled={table.entries.length >= 8 || !db.actors.length}
                  onClick={() =>
                    patch((d) => {
                      d.encounters
                        .find((v) => v.id === table.id)!
                        .entries.push({
                          actor: d.actors[0].id,
                          weight: 100,
                          minLevel: 1,
                          maxLevel: 3,
                        });
                    })
                  }
                >
                  + Encounter entry
                </button>
              </>
            )}
            <RpgBattleFields project={project} kind={kind} id={row.id} patch={patch} />
            <hr />
            <button
              disabled={uses.length > 0}
              onClick={() =>
                patch((d) => {
                  switch (kind) {
                    case 'items':
                      d.items = d.items.filter((v) => v.id !== row.id);
                      break;
                    case 'skills':
                      d.skills = d.skills.filter((v) => v.id !== row.id);
                      break;
                    case 'actors':
                      d.actors = d.actors.filter((v) => v.id !== row.id);
                      break;
                    case 'encounters':
                      d.encounters = d.encounters.filter((v) => v.id !== row.id);
                      break;
                  }
                })
              }
            >
              Delete resource
            </button>
            <code>
              {row.id} · {uses.length} authored references
            </code>
            {uses.map((s) => (
              <small key={s}>{s}</small>
            ))}
          </>
        ) : (
          <div className="gameplay-empty">
            <h2>{labels[kind]}</h2>
            <p>
              Create a resource in the left panel. Link items to saved inventory, skills to actors,
              and actors to encounter tables.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
