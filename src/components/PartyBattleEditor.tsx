import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay } from '../gameplay/model';
import { emptyRpg } from '../gameplay/toolkit';
import { resourceUsageIndex } from '../gameplay/resources';
import { statusKinds, type StatusKind } from '../rpg/model';
import { NumberField } from './GameplayFields';
type Edit = (fn: (p: Project) => void) => void;
export function PartyBattleEditor({ project: p, onEdit }: { project: Project; onEdit: Edit }) {
  const d = p.gameplay?.rpg,
    party = p.gameplay?.party;
  const edit = (fn: (p: Project) => void) =>
    onEdit((q) => {
      q.gameplay ??= emptyGameplay();
      q.gameplay.rpg ??= emptyRpg();
      fn(q);
    });
  const usage = resourceUsageIndex(p);
  return (
    <div className="party-editor">
      <h2>Party & battle</h2>
      <p>
        Choose up to four starting members. Use a Battle action in an event script to start an
        encounter and branch on its result. Play: P opens inventory; arrows choose; E / Enter
        confirms.
      </p>
      {!party ? (
        <button
          disabled={!d?.actors.length}
          onClick={() =>
            edit((q) => {
              q.gameplay!.party = {
                members: [{ id: uid('member'), actor: q.gameplay!.rpg!.actors[0].id, level: 1 }],
                gold: 0,
                seed: 12345,
                allowFlee: true,
              };
            })
          }
        >
          Enable party system
        </button>
      ) : (
        <>
          <h3>Starting party · {party.members.length}/4</h3>
          {party.members.map((m, i) => (
            <div className="toolkit-fields" key={m.id}>
              <label>
                Member {i + 1}
                <select
                  aria-label={`Party actor ${i + 1}`}
                  value={m.actor}
                  onChange={(e) =>
                    edit((q) => {
                      q.gameplay!.party!.members[i].actor = e.target.value;
                    })
                  }
                >
                  {d!.actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label={`Party level ${i + 1}`}
                value={m.level}
                min={1}
                max={100}
                onChange={(v) =>
                  edit((q) => {
                    q.gameplay!.party!.members[i].level = v;
                  })
                }
              />
              <button
                disabled={party.members.length === 1}
                onClick={() =>
                  edit((q) => {
                    q.gameplay!.party!.members.splice(i, 1);
                  })
                }
              >
                Remove member
              </button>
            </div>
          ))}
          <button
            disabled={party.members.length >= 4}
            onClick={() =>
              edit((q) => {
                q.gameplay!.party!.members.push({
                  id: uid('member'),
                  actor: d!.actors[0].id,
                  level: 1,
                });
              })
            }
          >
            + Party member
          </button>
          <div className="toolkit-fields">
            <NumberField
              label="Starting gold"
              value={party.gold}
              max={1000000}
              onChange={(v) =>
                edit((q) => {
                  q.gameplay!.party!.gold = v;
                })
              }
            />
            <NumberField
              label="Random seed"
              value={party.seed}
              min={1}
              max={0xffffffff}
              onChange={(v) =>
                edit((q) => {
                  q.gameplay!.party!.seed = v;
                })
              }
            />
            <label className="gameplay-check">
              <input
                type="checkbox"
                checked={party.allowFlee}
                onChange={(e) =>
                  edit((q) => {
                    q.gameplay!.party!.allowFlee = e.target.checked;
                  })
                }
              />
              Allow escape
            </label>
          </div>
          <p>
            Speed determines initiative each round. Guard halves damage until the member’s next
            turn. Victory shares XP among surviving members and awards gold. HP, MP, inventory and
            status durations persist across rooms and saves.
          </p>
          <button
            disabled={p.gameplay!.scripts.some((s) =>
              s.actions.some((a) => a.type === 'battle' || a.type === 'party-rest'),
            )}
            onClick={() =>
              edit((q) => {
                delete q.gameplay!.party;
              })
            }
          >
            Disable party system
          </button>
        </>
      )}
      {!d?.actors.length && <p>Create actors in RPG database first.</p>}
      <h3>Status effects · {d?.statuses?.length ?? 0}/16</h3>
      <p>
        Poison and regeneration apply a percentage of maximum HP at turn end. Buffs and slow use a
        percentage; stun skips an activation. Duration counts the affected actor’s turns.
      </p>
      {(d?.statuses ?? []).map((s, i) => {
        const uses = usage('status', s.id);
        return (
          <div className="status-definition" key={s.id}>
            <div className="toolkit-fields">
              <label>
                Status name
                <input
                  aria-label={`Status name ${i + 1}`}
                  maxLength={128}
                  value={s.name}
                  onChange={(e) =>
                    edit((q) => {
                      q.gameplay!.rpg!.statuses![i].name = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Folder
                <input
                  value={s.folder}
                  maxLength={128}
                  onChange={(e) =>
                    edit((q) => {
                      q.gameplay!.rpg!.statuses![i].folder = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Behavior
                <select
                  value={s.kind}
                  onChange={(e) =>
                    edit((q) => {
                      q.gameplay!.rpg!.statuses![i].kind = e.target.value as StatusKind;
                    })
                  }
                >
                  {statusKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <NumberField
                label={`Status potency ${i + 1}`}
                value={s.potency}
                max={100}
                onChange={(v) =>
                  edit((q) => {
                    q.gameplay!.rpg!.statuses![i].potency = v;
                  })
                }
              />
              <NumberField
                label={`Status turns ${i + 1}`}
                min={1}
                max={9}
                value={s.turns}
                onChange={(v) =>
                  edit((q) => {
                    q.gameplay!.rpg!.statuses![i].turns = v;
                  })
                }
              />
              <button
                disabled={uses.length > 0}
                title={uses.join('\n')}
                onClick={() =>
                  edit((q) => {
                    q.gameplay!.rpg!.statuses!.splice(i, 1);
                  })
                }
              >
                Delete status
              </button>
            </div>
            <code>
              {s.id} · {uses.length} references
            </code>
          </div>
        );
      })}
      <button
        disabled={(d?.statuses?.length ?? 0) >= 16}
        onClick={() =>
          edit((q) => {
            (q.gameplay!.rpg!.statuses ??= []).push({
              id: uid('status'),
              name: 'Poison',
              folder: 'Statuses',
              kind: 'poison',
              potency: 10,
              turns: 3,
            });
          })
        }
      >
        + Status effect
      </button>
      <p>
        The runtime uses a fixed battle context, integer stats and immutable database tables. No
        per-turn allocation. Saving is available outside active battles; storage remains owned by
        your device.
      </p>
    </div>
  );
}
