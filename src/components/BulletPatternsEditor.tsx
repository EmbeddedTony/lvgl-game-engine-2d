import { useMemo, useState } from 'react';
import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay } from '../gameplay/model';
import { defaultPattern, type BulletPattern } from '../gameplay/toolkit';
import { resourceUsageIndex } from '../gameplay/resources';
import { NumberField } from './GameplayFields';
import { PatternPreview } from './BulletPatternPreview';
type Edit = (change: (p: Project) => void) => void;
export function BulletPatternsEditor({ project, onEdit }: { project: Project; onEdit: Edit }) {
  const [selection, setSelection] = useState(''),
    [search, setSearch] = useState('');
  const patterns = project.gameplay?.patterns ?? [],
    pattern = patterns.find((v) => v.id === selection) ?? patterns[0];
  const usage = useMemo(() => resourceUsageIndex(project), [project]);
  const patch = (changes: Partial<BulletPattern>) =>
    onEdit((p) => {
      const v = p.gameplay?.patterns?.find((v) => v.id === pattern?.id);
      if (v) Object.assign(v, changes);
    });
  const add = (mode: BulletPattern['mode']) =>
    onEdit((p) => {
      p.gameplay ??= emptyGameplay();
      p.gameplay.patterns ??= [];
      const v = defaultPattern(uid('pattern'));
      v.mode = mode;
      v.name = mode === 'ring' ? 'Spiral ring' : mode === 'aimed' ? 'Aimed volley' : 'Fan volley';
      if (mode === 'ring') {
        v.count = 8;
        v.rotation = 15;
      }
      if (mode === 'aimed') {
        v.angle = 0;
        v.count = 3;
        v.spread = 20;
      }
      p.gameplay.patterns.push(v);
      setSelection(v.id);
    });
  return (
    <div className="gameplay-columns">
      <aside>
        <input
          aria-label="Find bullet pattern"
          placeholder="Find pattern or folder…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <h3>New pattern</h3>
        {(['fan', 'ring', 'aimed'] as const).map((mode) => (
          <button disabled={patterns.length >= 64} key={mode} onClick={() => add(mode)}>
            + {mode === 'ring' ? 'Spiral ring' : mode === 'aimed' ? 'Aimed volley' : 'Fan volley'}
          </button>
        ))}
        {patterns
          .filter((v) => (v.name + ' ' + v.folder).toLowerCase().includes(search.toLowerCase()))
          .map((v) => (
            <button
              key={v.id}
              className={pattern?.id === v.id ? 'selected' : ''}
              onClick={() => setSelection(v.id)}
            >
              <small>{v.folder}</small>
              {v.name}
            </button>
          ))}
        <NumberField
          label="Scene projectile limit"
          value={project.gameplay?.projectileLimit ?? 64}
          min={1}
          max={64}
          onChange={(projectileLimit) =>
            onEdit((p) => {
              p.gameplay ??= emptyGameplay();
              p.gameplay.projectileLimit = projectileLimit;
            })
          }
        />
        <p>
          One shared pool per scene. New shots are dropped when full; existing shots keep running.
          Attach patterns in the Scene inspector.
        </p>
      </aside>
      <main>
        {pattern ? (
          <>
            <div className="gameplay-resource-heading">
              <label>
                Pattern name
                <input
                  aria-label="Pattern name"
                  maxLength={128}
                  value={pattern.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                Folder
                <input
                  maxLength={128}
                  value={pattern.folder}
                  onChange={(e) => patch({ folder: e.target.value })}
                />
              </label>
              <label>
                Shape
                <select
                  aria-label="Pattern shape"
                  value={pattern.mode}
                  onChange={(e) => patch({ mode: e.target.value as BulletPattern['mode'] })}
                >
                  <option value="fan">Fan</option>
                  <option value="ring">Full ring</option>
                  <option value="aimed">Aim at player + fan</option>
                </select>
              </label>
            </div>
            <div className="pattern-layout">
              <PatternPreview project={project} pattern={pattern} />
              <div className="toolkit-fields">
                <NumberField
                  label="Bullets per burst"
                  value={pattern.count}
                  min={1}
                  max={32}
                  onChange={(count) => patch({ count })}
                />
                <NumberField
                  label="Angle · degrees"
                  value={pattern.angle}
                  min={-360}
                  max={360}
                  onChange={(angle) => patch({ angle })}
                />
                <NumberField
                  label="Spread · degrees"
                  value={pattern.spread}
                  max={360}
                  onChange={(spread) => patch({ spread })}
                />
                <NumberField
                  label="Rotation per burst · degrees"
                  value={pattern.rotation}
                  min={-360}
                  max={360}
                  onChange={(rotation) => patch({ rotation })}
                />
                <NumberField
                  label="Bullet speed · px/s"
                  value={pattern.speed}
                  min={1}
                  max={600}
                  onChange={(speed) => patch({ speed })}
                />
                <NumberField
                  label="Burst interval · ms"
                  value={pattern.intervalMs}
                  min={50}
                  max={60000}
                  onChange={(intervalMs) => patch({ intervalMs })}
                />
                <NumberField
                  label="Bullet lifetime · ms"
                  value={pattern.lifetimeMs}
                  min={17}
                  max={60000}
                  onChange={(lifetimeMs) => patch({ lifetimeMs })}
                />
                <NumberField
                  label="Bullet radius · px"
                  value={pattern.radius}
                  min={1}
                  max={8}
                  onChange={(radius) => patch({ radius })}
                />
                <NumberField
                  label="Damage payload"
                  value={pattern.damage}
                  max={9999}
                  onChange={(damage) => patch({ damage })}
                />
                <NumberField
                  label="Target layer mask"
                  value={pattern.mask}
                  max={255}
                  onChange={(mask) => patch({ mask })}
                />
                <label>
                  Bullet color
                  <input
                    aria-label="Bullet color"
                    type="color"
                    value={pattern.color}
                    onChange={(e) => patch({ color: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <p>
              0° points right; 90° points down. Aimed angle is an offset from the player direction.
              Rotation advances after each burst. Layer bits: Player 2, Enemy 4, Hurtbox 16. Hits
              emit a Hit event on the target; scripts or C hooks decide damage and invulnerability.
            </p>
            <p>
              Upper estimate: {pattern.count * Math.ceil(pattern.lifetimeMs / pattern.intervalMs)}{' '}
              live shots per emitter before hits. {usage('pattern', pattern.id).length} authored
              references.
            </p>
            <button
              disabled={usage('pattern', pattern.id).length > 0}
              onClick={() =>
                onEdit((p) => {
                  p.gameplay!.patterns = p.gameplay!.patterns!.filter((v) => v.id !== pattern.id);
                })
              }
            >
              Delete pattern
            </button>
            <code>{pattern.id} · referenced patterns cannot be deleted</code>
          </>
        ) : (
          <div className="gameplay-empty">
            <h2>Reusable bullet patterns</h2>
            <p>
              Choose a fan, aimed volley or spiral ring to begin. Then attach it to an enemy or
              group in the Scene inspector.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
