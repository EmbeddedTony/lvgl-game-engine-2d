import type { Project } from '../model';
import type { RpgDatabase } from '../gameplay/toolkit';
import { NumberField } from './GameplayFields';
export function RpgBattleFields({
  project: p,
  kind,
  id,
  patch,
}: {
  project: Project;
  kind: 'items' | 'skills' | 'actors' | 'encounters';
  id: string;
  patch: (fn: (d: RpgDatabase) => void) => void;
}) {
  const db = p.gameplay!.rpg!,
    statuses = db.statuses ?? [];
  const number = (key: string, label: string, value: number, max = 9999) => (
    <NumberField
      key={key}
      label={label}
      value={value}
      max={max}
      onChange={(v) =>
        patch((d) => {
          Object.assign(
            d[kind].find((r) => r.id === id)!,
            { [key]: v },
          );
        })
      }
    />
  );
  const status = (key: 'cure' | 'status', value: string) => (
    <label>
      {key === 'cure' ? 'Cure status' : 'Apply status'}
      <select
        aria-label={key === 'cure' ? 'Item cure status' : 'Skill status'}
        value={value}
        onChange={(e) =>
          patch((d) => {
            Object.assign(
              d[kind].find((r) => r.id === id)!,
              { [key]: e.target.value },
            );
          })
        }
      >
        <option value="">None</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (kind === 'actors') {
    const a = db.actors.find((a) => a.id === id)!;
    return (
      <div className="toolkit-fields">
        {number('mp', 'Actor MP', a.mp ?? 0)}
        {number('mpGrowth', 'MP growth per level', a.mpGrowth ?? 0, 100)}
        {number('gold', 'Gold reward', a.gold ?? 0, 1000000)}
      </div>
    );
  }
  if (kind === 'items') {
    const i = db.items.find((a) => a.id === id)!;
    return (
      <div className="toolkit-fields">
        {number('mpHeal', 'Item MP recovery', i.mpHeal ?? 0)}
        {status('cure', i.cure ?? '')}
        <label className="gameplay-check">
          <input
            type="checkbox"
            checked={i.revive ?? false}
            onChange={(e) =>
              patch((d) => {
                const v = d.items.find((a) => a.id === id)!;
                v.revive = e.target.checked;
                if (v.revive) v.heal = Math.max(1, v.heal);
              })
            }
          />
          Revive a defeated member
        </label>
      </div>
    );
  }
  if (kind === 'skills') {
    const s = db.skills.find((a) => a.id === id)!;
    return (
      <div className="toolkit-fields">
        <label>
          Skill target
          <select
            aria-label="Skill target"
            value={s.target ?? (s.effect === 'heal' ? 'ally' : 'enemy')}
            onChange={(e) =>
              patch((d) => {
                d.skills.find((a) => a.id === id)!.target = e.target.value as typeof s.target;
              })
            }
          >
            {['enemy', 'ally', 'self', 'all-enemies', 'all-allies'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {status('status', s.status ?? '')}
        {number('statusChance', 'Status chance %', s.statusChance ?? 100, 100)}
      </div>
    );
  }
  const e = db.encounters.find((a) => a.id === id)!;
  return (
    <NumberField
      label="Enemies per battle"
      value={e.enemyCount ?? 1}
      min={1}
      max={4}
      onChange={(v) =>
        patch((d) => {
          d.encounters.find((a) => a.id === id)!.enemyCount = v;
        })
      }
    />
  );
}
