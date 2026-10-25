import { useState } from 'react';
import { Box, Link2, X } from 'lucide-react';
import type { Project, Scene } from '../model';
import { instanceSources, resolveScene } from '../scenes';

export function SceneInstancePicker({
  project,
  scene,
  onChoose,
  onClose,
}: {
  project: Project;
  scene: Scene;
  onChoose: (source: Scene) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const sources = instanceSources(project, scene).filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal scene-instance-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Instance scene"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <button className="modal-close" aria-label="Close scene picker" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="modal-icon">
          <Link2 size={26} />
        </div>
        <h2>Instance a scene</h2>
        <p>Place a linked copy in {scene.name}. Source edits update every instance.</p>
        <input
          autoFocus
          aria-label="Find source scene"
          placeholder="Find a scene…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="scene-picker-list">
          {sources.map((source) => {
            const count = resolveScene(project, source).length;
            return (
              <button key={source.id} onClick={() => onChoose(source)}>
                <Box size={18} />
                <span>
                  <strong>{source.name}</strong>
                  <small>
                    {count} nodes · {source.prefab ? 'prefab source' : 'linked scene source'}
                  </small>
                </span>
                <Link2 size={16} />
              </button>
            );
          })}
          {!sources.length && (
            <p className="field-hint">
              Create another scene or use “Save branch as scene” in the Inspector. Scenes that would
              create a dependency cycle are excluded.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
