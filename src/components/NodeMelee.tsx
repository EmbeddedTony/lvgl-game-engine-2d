import type { GameNode } from '../model';
import { defaultMelee, type Melee } from '../action2d/model';
import { NumberField } from './GameplayFields';
export function NodeMelee({
  node,
  onChange,
}: {
  node: GameNode;
  onChange: (p: Partial<GameNode>) => void;
}) {
  if (node.kind !== 'sprite') return null;
  const m = node.melee;
  const patch = (c: Partial<Melee>) => onChange({ melee: { ...m!, ...c } });
  return (
    <details className="inspector-section">
      <summary>
        <h3>Sword & melee</h3>
      </summary>
      <label className="gameplay-check">
        <input
          type="checkbox"
          aria-label="Enable melee"
          checked={!!m}
          onChange={(e) => onChange({ melee: e.target.checked ? defaultMelee() : undefined })}
        />
        Enable directional melee
      </label>
      {m && (
        <>
          <p className="field-hint">
            Space / Action swings toward the facing direction. A target receives one Hit event per
            swing. Add attack clips below for the sword animation.
          </p>
          {(
            ['reach', 'width', 'windupMs', 'activeMs', 'recoveryMs', 'damage', 'mask'] as const
          ).map((k) => (
            <NumberField
              key={k}
              label={
                {
                  reach: 'Sword reach (px)',
                  width: 'Hitbox width (px)',
                  windupMs: 'Windup (ms)',
                  activeMs: 'Active (ms)',
                  recoveryMs: 'Recovery (ms)',
                  damage: 'Damage',
                  mask: 'Hit layers',
                }[k]
              }
              value={m[k]}
              min={k.endsWith('Ms') ? 17 : k === 'mask' || k === 'damage' ? 0 : 1}
              max={k.endsWith('Ms') ? 2000 : k === 'damage' ? 9999 : k === 'mask' ? 255 : 256}
              onChange={(v) => patch({ [k]: v })}
            />
          ))}
          <label className="gameplay-check">
            <input
              type="checkbox"
              checked={m.lockMovement}
              onChange={(e) => patch({ lockMovement: e.target.checked })}
            />
            Lock movement during swing
          </label>
        </>
      )}
    </details>
  );
}
