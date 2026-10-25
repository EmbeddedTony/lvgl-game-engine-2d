import type { GameNode, Project } from '../model';
/** Remapping makes reusable characters/chests share behavior while owning independent saved state. */
export function StateBindings({
  node,
  project,
  onChange,
}: {
  node: GameNode;
  project: Project;
  onChange: (stateBindings: Record<string, string>) => void;
}) {
  const fields = project.gameplay?.state ?? [],
    bindings = node.stateBindings ?? {};
  if (!fields.length) return null;
  return (
    <details className="inspector-section">
      <summary>
        <h3>Object state remaps</h3>
      </summary>
      <p className="field-hint">
        Reuse a script with this object’s own health or opened flag. Leave inventory and quest
        fields shared. Remaps also work on linked scene instances.
      </p>
      {Object.entries(bindings).map(([from, to]) => (
        <div key={from} className="node-event-page">
          <label className="block-label">
            Script field
            <select
              value={from}
              aria-label="Remap source"
              onChange={(e) => {
                const next = { ...bindings };
                delete next[from];
                next[e.target.value] = to;
                onChange(next);
              }}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block-label">
            This object uses
            <select
              value={to}
              aria-label="Remap destination"
              onChange={(e) => onChange({ ...bindings, [from]: e.target.value })}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              const next = { ...bindings };
              delete next[from];
              onChange(next);
            }}
          >
            Remove remap
          </button>
        </div>
      ))}
      <button
        disabled={Object.keys(bindings).length >= 16 || fields.every((f) => f.id in bindings)}
        onClick={() => {
          const field = fields.find((f) => !(f.id in bindings));
          if (field) onChange({ ...bindings, [field.id]: field.id });
        }}
      >
        + State remap
      </button>
    </details>
  );
}
