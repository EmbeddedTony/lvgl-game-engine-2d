import type { GameNode, Project } from '../model';
export function NodeEmitter({
  node,
  project,
  onChange,
  onOpen,
}: {
  node: GameNode;
  project: Project;
  onChange: (changes: Partial<GameNode>) => void;
  onOpen: () => void;
}) {
  if (node.layer !== 'world' || node.kind === 'instance') return null;
  return (
    <details className="inspector-section">
      <summary>
        <h3>Bullet emitter</h3>
      </summary>
      <label className="block-label">
        Pattern
        <select
          aria-label="Object bullet pattern"
          value={node.emitter?.pattern ?? ''}
          onChange={(e) =>
            onChange({
              emitter: e.target.value ? { pattern: e.target.value, autoplay: true } : undefined,
            })
          }
        >
          <option value="">None</option>
          {project.gameplay?.patterns?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.folder ? v.folder + ' / ' : ''}
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {node.emitter && (
        <label className="form-row">
          Start automatically
          <input
            type="checkbox"
            aria-label="Emitter autoplay"
            checked={node.emitter.autoplay}
            onChange={(e) =>
              onChange({ emitter: { ...node.emitter!, autoplay: e.target.checked } })
            }
          />
        </label>
      )}
      <p className="field-hint">
        Emits from the object center in world space. Event scripts can enable or disable it.
      </p>
      <button className="source-open" onClick={onOpen}>
        Open Gameplay tools
      </button>
    </details>
  );
}
