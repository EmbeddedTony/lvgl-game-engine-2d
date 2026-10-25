import { useState } from 'react';
import { ArrowRight, Box, FolderOpen, Gamepad2, Monitor, Plus, Sparkles } from 'lucide-react';
import { desktop, type RecentProject } from '../desktop';
export interface NewProjectOptions {
  name: string;
  width: number;
  height: number;
  colorDepth: 16 | 32;
  dimension?: '2d';
  template:
    | 'blank'
    | 'starter'
    | 'physics'
    | 'tileset'
    | 'gameplay'
    | 'rpg'
    | 'h7-adventure'
    | 'toolkit'
    | 'side-scroller'
    | 'adventure';
}
export function Welcome({
  recent,
  onNew,
  onOpen,
  onRecent,
  onStarter,
  onPhysics,
  onSideScroller,
  onAdventure,
}: {
  recent: RecentProject[];
  onNew: () => void;
  onOpen: () => void;
  onRecent: (index: number) => void;
  onStarter: () => void;
  onPhysics: () => void;
  onSideScroller: () => void;
  onAdventure: () => void;
}) {
  return (
    <div className="welcome-content">
      <div className="welcome-intro">
        <div className="welcome-logo">
          <Gamepad2 size={32} />
        </div>
        <div className="eyebrow">LVGL GAME ENGINE · {desktop ? 'DESKTOP' : 'BROWSER'}</div>
        <h1>
          Small screens.
          <br />
          <em>Real games.</em>
        </h1>
        <p>
          Build visually. Add your logic in C.
          <br />
          Bring your game to an LVGL display.
        </p>
        <div className="welcome-chips">
          <span>Scenes + UI</span>
          <span>Tilemaps</span>
          <span>Audio</span>
        </div>
      </div>
      <div className="welcome-actions">
        <h2>What would you like to make?</h2>
        <button className="start-choice" onClick={onNew}>
          <span>
            <Plus size={20} />
          </span>
          <div>
            <strong>Create a project</strong>
            <small>Choose a display and start with a blank scene.</small>
          </div>
          <ArrowRight size={16} />
        </button>
        <button className="start-choice" onClick={onOpen}>
          <span>
            <FolderOpen size={20} />
          </span>
          <div>
            <strong>Open a project</strong>
            <small>Pick up where you left off with a .lge.json file.</small>
          </div>
          <ArrowRight size={16} />
        </button>
        <button className="starter-choice" onClick={onStarter}>
          <Sparkles size={17} />
          <div>
            <strong>Explore The Little Grove</strong>
            <small>A playable example you can take apart.</small>
          </div>
          <ArrowRight size={15} />
        </button>
        <button className="starter-choice" onClick={onPhysics}>
          <Box size={17} />
          <div>
            <strong>Explore Physics Playground</strong>
            <small>Colliders, platforms, hitboxes and triggers.</small>
          </div>
          <ArrowRight size={15} />
        </button>
        <button className="starter-choice" onClick={onSideScroller}>
          <Gamepad2 size={17} />
          <div>
            <strong>Explore Amber Trail</strong>
            <small>Side scrolling, jumps, sparks and dialogue.</small>
          </div>
          <ArrowRight size={15} />
        </button>
        <button className="starter-choice" onClick={onAdventure}>
          <Sparkles size={17} />
          <div>
            <strong>Explore Willowlight Adventure</strong>
            <small>Handheld-style rooms, relics and dialogue.</small>
          </div>
          <ArrowRight size={15} />
        </button>
        {recent.length > 0 && (
          <div className="recent-projects">
            <h3>RECENT PROJECTS</h3>
            {recent.slice(0, 3).map((r) => (
              <button key={r.index} onClick={() => onRecent(r.index)} title={r.path}>
                <Box size={13} />
                <span>{r.name}</span>
                <ArrowRight size={12} />
              </button>
            ))}
          </div>
        )}
        <p className="welcome-offline">
          <i /> {desktop ? 'Runs entirely on your computer. No account needed.' : 'No account needed. Save project downloads to keep backups.'}
        </p>
      </div>
    </div>
  );
}
export function NewProject({
  onCreate,
  onCancel,
}: {
  onCreate: (options: NewProjectOptions) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('Untitled game'),
    [width, setWidth] = useState(320),
    [height, setHeight] = useState(240),
    [depth, setDepth] = useState<16 | 32>(16);
  const presets = [
    [128, 128],
    [240, 240],
    [320, 240],
    [240, 320],
    [480, 272],
    [480, 320],
    [800, 480],
  ];
  return (
    <>
      <div className="modal-icon">
        <Plus size={23} />
      </div>
      <div className="eyebrow">MAKE ROOM FOR YOUR NEXT IDEA</div>
      <h1>Create a project</h1>
      <p>Set your display size. Hardware drivers can come later.</p>
      <label className="block-label">
        Project name
        <input
          aria-label="New project name"
          autoFocus
          maxLength={128}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <></>
      <div className="new-display-layout">
        <div>
          <label className="block-label">
            Display preset
            <select
              aria-label="New display preset"
              value={`${width}x${height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setWidth(w);
                setHeight(h);
              }}
            >
              {!presets.some(([w, h]) => w === width && h === height) && (
                <option value={`${width}x${height}`}>Custom</option>
              )}
              {presets.map(([w, h]) => (
                <option key={`${w}x${h}`} value={`${w}x${h}`}>
                  {w} × {h}
                </option>
              ))}
            </select>
          </label>
          <div className="new-dimensions">
            <label>
              Width
              <input
                aria-label="New display width"
                type="number"
                min={16}
                max={2048}
                value={width}
                onChange={(e) => {
                  if (e.target.valueAsNumber)
                    setWidth(Math.max(16, Math.min(2048, Math.round(e.target.valueAsNumber))));
                }}
              />
            </label>
            <span>×</span>
            <label>
              Height
              <input
                aria-label="New display height"
                type="number"
                min={16}
                max={2048}
                value={height}
                onChange={(e) => {
                  if (e.target.valueAsNumber)
                    setHeight(Math.max(16, Math.min(2048, Math.round(e.target.valueAsNumber))));
                }}
              />
            </label>
          </div>
          <label className="block-label">
            Color format
            <select
              aria-label="New output color"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) as 16 | 32)}
            >
              <option value={16}>RGB565 · 16 bit</option>
              <option value={32}>ARGB8888 · 32 bit</option>
            </select>
          </label>
        </div>
        <div className="display-preview">
          <div
            style={{
              width: Math.min(150, (150 * width) / height),
              height: Math.min(150, (150 * height) / width),
            }}
          >
            <Monitor size={24} />
          </div>
          <strong>
            {width} × {height}
          </strong>
          <span>Logical pixels · custom sizes welcome</span>
        </div>
      </div>
      <div className="new-project-tip">
        <Box size={16} />
        <span>
          {
            'Your project starts with one empty scene. Add sprites, tilemaps and UI from the object menu.'
          }
        </span>
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            onCreate({
              name: name.trim(),
              width,
              height,
              colorDepth: depth,
              template: 'blank',
              dimension: '2d',
            })
          }
        >
          Create project <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
