import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Box,
  Copy,
  Flag,
  Folder,
  FolderPlus,
  ListOrdered,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { GameSequence, Project } from '../model';
import { uid } from '../model';
import { flowIssues, getFlow, sceneReferences } from '../flow';
import { resolveScene } from '../scenes';

export function FlowOrganizer({
  project,
  onEdit,
  onOpenScene,
  onAddScene,
  onPlaySequence,
  onPlayEntry,
}: {
  project: Project;
  onEdit: (change: (p: Project) => void) => void;
  onOpenScene: (id: string) => void;
  onAddScene: () => string | undefined;
  onPlaySequence: (id: string) => void;
  onPlayEntry: () => void;
}) {
  const flow = getFlow(project);
  const [selectedSequence, setSelectedSequence] = useState(flow.sequences[0]?.id ?? '');
  const [selectedScene, setSelectedScene] = useState(project.scenes[0].id);
  const [search, setSearch] = useState('');
  const [folderName, setFolderName] = useState('');
  const sequence = flow.sequences.find((s) => s.id === selectedSequence) ?? flow.sequences[0];
  const scene = project.scenes.find((s) => s.id === selectedScene);
  const references = scene ? sceneReferences(project, scene.id) : [];
  const issues = flowIssues(project);
  const edit = (change: (p: Project) => void) =>
    onEdit((p) => {
      p.flow ??= getFlow(p);
      change(p);
    });
  const editSequence = (change: (s: GameSequence) => void) =>
    edit((p) => {
      const s = p.flow!.sequences.find((s) => s.id === sequence?.id);
      if (s) change(s);
    });
  const addSequence = () => {
    const id = uid('sequence');
    edit((p) =>
      p.flow!.sequences.push({
        id,
        name: `Sequence ${flow.sequences.length + 1}`,
        steps: [],
        end: 'hold',
      }),
    );
    setSelectedSequence(id);
  };
  const entryValue = `${flow.entry.kind}:${flow.entry.id}`;
  const sceneRow = (s: Project['scenes'][number]) => (
    <div key={s.id} className={`flow-scene-row ${s.id === selectedScene ? 'selected' : ''}`}>
      <button
        className="flow-scene-name"
        onClick={() => setSelectedScene(s.id)}
        onDoubleClick={() => onOpenScene(s.id)}
      >
        <Box size={14} />
        <span>{s.name || 'Untitled scene'}</span>
        {flow.entry.kind === 'scene' && flow.entry.id === s.id && (
          <Flag size={12} aria-label="Game entry" />
        )}
      </button>
      <button
        aria-label={`Open ${s.name}`}
        title="Open in Design"
        onClick={() => onOpenScene(s.id)}
      >
        <ArrowRight size={14} />
      </button>
    </div>
  );
  return (
    <div className="flow-workspace">
      <header className="flow-heading">
        <div>
          <span className="flow-eyebrow">
            <ListOrdered size={14} /> PROJECT STRUCTURE
          </span>
          <h1>Game flow</h1>
          <p>Organize your scenes. Compose the journey between them.</p>
        </div>
        <button className="primary" onClick={onPlayEntry}>
          <Play size={14} /> Play game
        </button>
      </header>
      <div className="flow-entry">
        <Flag size={18} />
        <div>
          <strong>Game entry</strong>
          <small>
            Where exported firmware starts. Design's Play tests only the selected scene.
          </small>
        </div>
        <select
          aria-label="Game entry"
          value={entryValue}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':');
            edit((p) => {
              p.flow!.entry = { kind: kind as 'scene' | 'sequence', id };
            });
          }}
        >
          <optgroup label="Scenes">
            {project.scenes.map((s) => (
              <option key={s.id} value={`scene:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Sequences">
            {flow.sequences
              .filter((s) => s.steps.length)
              .map((s) => (
                <option key={s.id} value={`sequence:${s.id}`}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      <div className="flow-columns">
        <section className="flow-library">
          <div className="flow-section-heading">
            <h2>
              Scene library <small>{project.scenes.length} / 256</small>
            </h2>
            <button
              aria-label="New scene in library"
              disabled={project.scenes.length >= 256}
              onClick={() => {
                const id = onAddScene();
                if (id) setSelectedScene(id);
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          <label className="flow-search">
            <Search size={13} />
            <input
              aria-label="Search scenes"
              placeholder="Find a scene…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="flow-scene-list">
            {[{ id: '', name: 'Ungrouped' }, ...flow.folders].map((folder) => {
              const scenes = project.scenes.filter(
                (s) =>
                  (s.folder ?? '') === folder.id &&
                  s.name.toLowerCase().includes(search.toLowerCase()),
              );
              if (!scenes.length && search) return null;
              return (
                <details key={folder.id} open>
                  <summary>
                    <Folder size={13} />
                    <span>{folder.name}</span>
                    <small>{scenes.length}</small>
                  </summary>
                  {scenes.map(sceneRow)}
                  {!scenes.length && (
                    <p className="flow-empty-folder">
                      Move scenes here using their Folder setting.
                    </p>
                  )}
                </details>
              );
            })}
          </div>
          <form
            className="flow-folder-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!folderName.trim() || flow.folders.length >= 32) return;
              edit((p) => p.flow!.folders.push({ id: uid('folder'), name: folderName.trim() }));
              setFolderName('');
            }}
          >
            <input
              aria-label="New folder name"
              placeholder="New folder…"
              maxLength={128}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
            <button
              aria-label="Create scene folder"
              title="Create folder"
              disabled={!folderName.trim() || flow.folders.length >= 32}
            >
              <FolderPlus size={15} />
            </button>
          </form>
          {scene && (
            <div className="flow-scene-properties">
              <h3>Selected scene</h3>
              <label>
                Name
                <input
                  aria-label="Library scene name"
                  maxLength={128}
                  value={scene.name}
                  onChange={(e) =>
                    edit((p) => {
                      p.scenes.find((s) => s.id === scene.id)!.name = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Folder
                <select
                  aria-label="Scene folder"
                  value={scene.folder ?? ''}
                  onChange={(e) =>
                    edit((p) => {
                      const s = p.scenes.find((s) => s.id === scene.id)!;
                      if (e.target.value) s.folder = e.target.value;
                      else delete s.folder;
                    })
                  }
                >
                  <option value="">Ungrouped</option>
                  {flow.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <code className="flow-stable-id">{scene.id}</code>
              <div className="flow-scene-actions">
                <button onClick={() => onOpenScene(scene.id)}>
                  Open in Design <ArrowRight size={13} />
                </button>
                <button
                  aria-label="Duplicate scene"
                  title="Duplicate scene"
                  disabled={project.scenes.length >= 256}
                  onClick={() => {
                    const copy = structuredClone(scene);
                    copy.id = uid('scene');
                    copy.name = `${scene.name.slice(0, 120)} copy`;
                    edit((p) => p.scenes.push(copy));
                    setSelectedScene(copy.id);
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  aria-label="Delete scene"
                  title={references.length ? 'Remove references before deleting' : 'Delete scene'}
                  disabled={project.scenes.length === 1 || !!references.length}
                  onClick={() => {
                    edit((p) => {
                      p.scenes = p.scenes.filter((s) => s.id !== scene.id);
                    });
                    setSelectedScene(project.scenes.find((s) => s.id !== scene.id)!.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="flow-reference-note">
                {references.length
                  ? `Used by: ${references.join(', ')}. Remove these references before deleting.`
                  : 'Unused by game entry and sequences. Safe to remove; Undo restores it.'}
              </p>
              {scene.folder && (
                <label>
                  Folder name
                  <input
                    aria-label="Folder name"
                    maxLength={128}
                    value={flow.folders.find((f) => f.id === scene.folder)?.name ?? ''}
                    onChange={(e) =>
                      edit((p) => {
                        p.flow!.folders.find((f) => f.id === scene.folder)!.name = e.target.value;
                      })
                    }
                  />
                </label>
              )}
              {scene.folder && (
                <button
                  className="flow-remove-folder"
                  onClick={() =>
                    edit((p) => {
                      p.flow!.folders = p.flow!.folders.filter((f) => f.id !== scene.folder);
                      for (const s of p.scenes) if (s.folder === scene.folder) delete s.folder;
                    })
                  }
                >
                  Remove folder · keep its scenes
                </button>
              )}
            </div>
          )}
        </section>
        <section className="flow-sequences">
          <div className="flow-section-heading">
            <div>
              <h2>
                Sequences <small>{flow.sequences.length} / 32</small>
              </h2>
              <p>Reusable scene references, in order. No duplicated content.</p>
            </div>
            <button
              className="secondary"
              disabled={flow.sequences.length >= 32}
              onClick={addSequence}
            >
              <Plus size={14} /> New sequence
            </button>
          </div>
          <div className="flow-sequence-tabs" aria-label="Sequences">
            {flow.sequences.map((s) => (
              <button
                className={sequence?.id === s.id ? 'active' : ''}
                key={s.id}
                onClick={() => setSelectedSequence(s.id)}
              >
                <ListOrdered size={13} />
                {s.name || 'Untitled sequence'}
                <small>{s.steps.length}</small>
              </button>
            ))}
          </div>
          {sequence ? (
            <>
              <div className="flow-sequence-meta">
                <label>
                  Sequence name
                  <input
                    aria-label="Sequence name"
                    value={sequence.name}
                    maxLength={128}
                    onChange={(e) =>
                      editSequence((s) => {
                        s.name = e.target.value;
                      })
                    }
                  />
                </label>
                <button
                  className="secondary"
                  disabled={!sequence.steps.length || issues.some((i) => i.severity === 'error')}
                  onClick={() => onPlaySequence(sequence.id)}
                >
                  <Play size={13} /> Preview sequence
                </button>
                <button
                  aria-label="Delete sequence"
                  title={
                    flow.entry.kind === 'sequence' && flow.entry.id === sequence.id
                      ? 'Change game entry before deleting'
                      : 'Delete sequence'
                  }
                  disabled={flow.entry.kind === 'sequence' && flow.entry.id === sequence.id}
                  onClick={() =>
                    edit((p) => {
                      p.flow!.sequences = p.flow!.sequences.filter((s) => s.id !== sequence.id);
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {!!sequence.steps.length && (
                <nav className="flow-overview" aria-label="Sequence overview">
                  {sequence.steps.map((step, i) => (
                    <button
                      key={step.id}
                      title={`Jump to step ${i + 1}`}
                      onClick={() => {
                        const target = document.getElementById(`sequence-step-${step.id}`);
                        target?.scrollIntoView({ block: 'center' });
                        target?.querySelector('select')?.focus({ preventScroll: true });
                      }}
                    >
                      <span>{i + 1}</span>
                      {project.scenes.find((s) => s.id === step.scene)?.name}
                      {i < sequence.steps.length - 1 && <ArrowRight size={13} />}
                    </button>
                  ))}
                </nav>
              )}
              <ol className="flow-steps">
                {sequence.steps.map((step, i) => {
                  const current = project.scenes.find((s) => s.id === step.scene)!;
                  const buttons = resolveScene(project, current).filter((n) => n.kind === 'button');
                  return (
                    <li
                      id={`sequence-step-${step.id}`}
                      key={step.id}
                      className="flow-step"
                      data-testid={`flow-step-${step.id}`}
                    >
                      <span className="flow-step-number">{i + 1}</span>
                      <div className="flow-step-fields">
                        <div className="flow-step-top">
                          <label>
                            Scene
                            <select
                              aria-label={`Step ${i + 1} scene`}
                              value={step.scene}
                              onChange={(e) =>
                                editSequence((s) => {
                                  s.steps[i].scene = e.target.value;
                                  s.steps[i].advance = 'manual';
                                  delete s.steps[i].button;
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
                          <button
                            title="Open scene in Design"
                            aria-label={`Edit step ${i + 1} scene`}
                            onClick={() => onOpenScene(step.scene)}
                          >
                            <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="flow-step-bottom">
                          <label>
                            Advance when
                            <select
                              aria-label={`Step ${i + 1} advance`}
                              value={step.advance}
                              onChange={(e) =>
                                editSequence((s) => {
                                  const value = e.target.value as typeof step.advance;
                                  s.steps[i].advance = value;
                                  if (value === 'click') s.steps[i].button = buttons[0].id;
                                  else delete s.steps[i].button;
                                })
                              }
                            >
                              <option value="manual">C code / Next step</option>
                              <option value="complete">All collectibles found</option>
                              <option value="click" disabled={!buttons.length}>
                                A button is clicked
                              </option>
                            </select>
                          </label>
                          {step.advance === 'click' ? (
                            <label>
                              Button
                              <select
                                aria-label={`Step ${i + 1} button`}
                                value={step.button}
                                onChange={(e) =>
                                  editSequence((s) => {
                                    s.steps[i].button = e.target.value;
                                  })
                                }
                              >
                                {buttons.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <small>
                              {step.advance === 'manual'
                                ? 'Call ui_sequence_next() from your game logic.'
                                : 'Uses the scene COMPLETE event.'}
                            </small>
                          )}
                        </div>
                        <code>{step.id}</code>
                      </div>
                      <div className="flow-step-actions">
                        <button
                          aria-label={`Move step ${i + 1} up`}
                          disabled={!i}
                          onClick={() =>
                            editSequence((s) => {
                              [s.steps[i - 1], s.steps[i]] = [s.steps[i], s.steps[i - 1]];
                            })
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          aria-label={`Move step ${i + 1} down`}
                          disabled={i === sequence.steps.length - 1}
                          onClick={() =>
                            editSequence((s) => {
                              [s.steps[i + 1], s.steps[i]] = [s.steps[i], s.steps[i + 1]];
                            })
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          aria-label={`Remove step ${i + 1}`}
                          onClick={() =>
                            editSequence((s) => {
                              s.steps.splice(i, 1);
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {!sequence.steps.length && (
                <div className="flow-empty">
                  <ListOrdered size={32} />
                  <h3>Build a journey, one scene at a time</h3>
                  <p>Add scenes below, then choose what advances each step.</p>
                </div>
              )}
              <button
                className="flow-add-step"
                disabled={
                  sequence.steps.length >= 64 ||
                  flow.sequences.reduce((n, s) => n + s.steps.length, 0) >= 256
                }
                onClick={() =>
                  editSequence((s) =>
                    s.steps.push({
                      id: uid('step'),
                      scene: scene?.id ?? project.scenes[0].id,
                      advance: 'manual',
                    }),
                  )
                }
              >
                <Plus size={14} /> Add scene to sequence
              </button>
              <div className="flow-ending">
                <label>
                  After the last step
                  <select
                    aria-label="Sequence ending"
                    value={sequence.end}
                    onChange={(e) =>
                      editSequence((s) => {
                        s.end = e.target.value as typeof s.end;
                        if (s.end === 'scene') s.endScene = project.scenes[0].id;
                        else delete s.endScene;
                      })
                    }
                  >
                    <option value="hold">Finish · stay on last scene</option>
                    <option value="loop">Loop to first step</option>
                    <option value="scene">Open a scene</option>
                  </select>
                </label>
                {sequence.end === 'scene' && (
                  <label>
                    Destination
                    <select
                      aria-label="Sequence end scene"
                      value={sequence.endScene}
                      onChange={(e) =>
                        editSequence((s) => {
                          s.endScene = e.target.value;
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
              </div>
              <p className="flow-contract">
                <code>ui_sequence_start(id)</code> starts a journey.{' '}
                <code>ui_request_scene(id)</code> branches out of it. Steps keep their IDs when
                reordered; scene names and folders never control runtime behavior.
              </p>
            </>
          ) : (
            <div className="flow-empty">
              <ListOrdered size={36} />
              <h3>Give your game a clear path</h3>
              <p>
                Create a sequence for a chapter, tutorial or menu journey.
                <br />
                For example: Title → Intro → Level → Results.
              </p>
              <button className="primary" onClick={addSequence}>
                <Plus size={14} /> Create your first sequence
              </button>
            </div>
          )}
          {!!issues.length && (
            <div className="flow-diagnostics" role="status">
              {issues.map((issue, i) => (
                <p key={i}>
                  <strong>{issue.severity === 'error' ? 'Fix before export' : 'Check'}:</strong>{' '}
                  {issue.message}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
