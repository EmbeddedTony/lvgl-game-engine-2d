import { StateBindings } from './StateBindings';
import { ExternalLink, Link2, RotateCcw } from 'lucide-react';
import type { Project, SceneOverride } from '../model';
import type { ResolvedNode } from '../scenes';

/** Deliberately small override contract: structure and assets belong to the source. */
export function InheritedNodeInspector({
  project,
  node,
  overrides,
  onPatch,
  onRevert,
  onOpenSource,
}: {
  project: Project;
  node: ResolvedNode;
  overrides: SceneOverride | undefined;
  onPatch: (patch: SceneOverride) => void;
  onRevert: () => void;
  onOpenSource: () => void;
}) {
  return (
    <div className="inherited-inspector">
      <div className="inspector-object">
        <Link2 size={22} />
        <div>
          <h2>{node.name}</h2>
          <small>
            Inherited from {project.scenes.find((s) => s.id === node.sourceScene)?.name}
          </small>
        </div>
      </div>
      <p className="instance-note">
        This node belongs to a linked scene. Override values here, or open its source to change
        structure and behaviors.
      </p>
      <button className="source-open" onClick={onOpenSource}>
        <ExternalLink size={14} />{' '}
        {project.scenes.find((s) => s.id === node.sourceScene)?.prefab
          ? 'Edit prefab source'
          : 'Open source scene'}
      </button>
      <StateBindings
        node={node}
        project={project}
        onChange={(stateBindings) => onPatch({ stateBindings })}
      />
      <section className="inspector-section">
        <h3>
          Instance overrides <small>{Object.keys(overrides ?? {}).length}</small>
        </h3>
        <div className="field-pair">
          {(['x', 'y'] as const).map((axis) => (
            <label className="number-field" key={axis}>
              <span>{axis.toUpperCase()} · local</span>
              <input
                aria-label={`Override ${axis.toUpperCase()}`}
                type="number"
                min={-4096}
                max={4096}
                value={node[axis]}
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  if (Number.isFinite(value))
                    onPatch({ [axis]: Math.min(4096, Math.max(-4096, value)) });
                }}
              />
            </label>
          ))}
        </div>
        {(node.kind === 'button' || node.kind === 'label') && (
          <label className="block-label">
            Text
            <input
              aria-label="Override text"
              value={node.text}
              maxLength={4096}
              onChange={(e) => onPatch({ text: e.target.value })}
            />
          </label>
        )}
        <label className="form-row">
          Color
          <input
            aria-label="Override color"
            type="color"
            value={node.color}
            onChange={(e) => onPatch({ color: e.target.value })}
          />
        </label>
        <label className="form-row">
          Visible
          <input
            aria-label="Override visibility"
            type="checkbox"
            checked={node.visible}
            onChange={(e) => onPatch({ visible: e.target.checked })}
          />
        </label>
        {node.player && (
          <label className="block-label">
            Speed · px/s
            <input
              aria-label="Override speed"
              type="number"
              min={0}
              max={600}
              value={node.speed}
              onChange={(e) => {
                const value = e.target.valueAsNumber;
                if (Number.isFinite(value)) onPatch({ speed: Math.min(600, Math.max(0, value)) });
              }}
            />
          </label>
        )}
        <label className="block-label">
          Audio cue
          <select
            aria-label="Override audio cue"
            value={node.cue}
            onChange={(e) => onPatch({ cue: e.target.value })}
          >
            <option value="">None</option>
            {project.audio.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="source-open"
          disabled={!Object.keys(overrides ?? {}).length}
          onClick={onRevert}
        >
          <RotateCcw size={13} /> Revert node overrides
        </button>
      </section>
      <section className="inspector-section">
        <h3>Runtime path</h3>
        <code className="stable-id">{node.id}</code>
        <p className="field-hint">
          Use this exact path with ui_find_node(). Source names can change without breaking the
          path.
        </p>
      </section>
    </div>
  );
}
