import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  FolderOpen,
  Grid2X2,
  Image,
  Info,
  List,
  Minus,
  Plus,
  Search,
  SquareTerminal,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { AudioCue, Issue, Project, SpriteAsset } from '../model';
import { resolveScene } from '../scenes';
type Category = 'scenes' | 'prefabs' | 'sprites' | 'tilesets' | 'audio' | 'code';
interface Entry {
  id: string;
  name: string;
  kind: Category;
  detail: string;
  dimension?: '2d';
}
const folders: {
  id: Category;
  name: string;
  icon: typeof Box;
}[] = [
  { id: 'scenes', name: 'Scenes', icon: Box },
  { id: 'prefabs', name: 'Prefabs', icon: Box },
  { id: 'sprites', name: 'Sprites', icon: Image },
  { id: 'tilesets', name: 'Tilesets', icon: Grid2X2 },
  { id: 'audio', name: 'Audio', icon: Volume2 },
  { id: 'code', name: 'Code', icon: Code2 },
];
const extension = {
  scenes: '.scene',
  prefabs: '.prefab',
  sprites: '.image',
  tilesets: '.tileset',
  audio: '.wav',
  code: '',
};
export function ProjectDock({
  project,
  tilesPanel,
  tilesRequest,
  onOpenTileset,
  sprites,
  playing,
  collapsed,
  onCollapse,
  onOpenScene,
  onNewScene,
  onInstanceScene,
  onCreatePool,
  onAddSprite,
  onAudition,
  onOpenCode,
  onImport,
  logs,
  issues,
  onClearLogs,
}: {
  project: Project;
  tilesPanel: ReactNode;
  tilesRequest: number;
  onOpenTileset: (id: string) => void;
  sprites: Record<string, string>;
  playing: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onOpenScene: (id: string) => void;
  onNewScene: () => void;
  onInstanceScene: (id: string) => void;
  onCreatePool: (id: string, capacity: number) => void;
  onAddSprite: (sprite: SpriteAsset) => void;
  onAudition: (cue: AudioCue) => void;
  onOpenCode: (id: 'user' | 'api' | 'ids') => void;
  onImport: (kind: 'sprites' | 'tilesets' | 'audio') => void;
  logs: string[];
  issues: Issue[];
  onClearLogs: () => void;
}) {
  const [tab, setTab] = useState<'project' | 'console' | 'tiles'>('project'),
    [category, setCategory] = useState<Category>('scenes');
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [list, setList] = useState(false);
  const [consoleFilter, setConsoleFilter] = useState('all');
  const [poolCapacity, setPoolCapacity] = useState(4);
  const consoleBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === 'console' && consoleBody.current)
      consoleBody.current.scrollTop = consoleBody.current.scrollHeight;
  }, [logs.length, tab]);
  useEffect(() => {
    if (tilesRequest) setTab('tiles');
  }, [tilesRequest]);
  const entries: Entry[] = [
    ...project.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      kind: (s.prefab ? 'prefabs' : 'scenes') as Category,
      dimension: '2d' as const,
      detail: `${resolveScene(project, s).length} HUD/2D nodes${s.prefab ? ' · reusable prefab' : ' · reusable scene'}`,
    })),
    ...project.sprites.map((s) => ({
      id: s.id,
      name: s.name,
      kind: 'sprites' as const,
      detail: `${s.width} × ${s.height} px · palette packed`,
    })),
    ...(project.tilesets ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: 'tilesets' as const,
      detail: `${s.tileSize}px · ${s.tiles.length} unique tiles · reusable atlas`,
    })),
    ...project.audio.map((s) => ({
      id: s.id,
      name: s.name,
      kind: 'audio' as const,
      detail: `${s.duration.toFixed(2)}s · ${s.sampleRate} Hz · ${s.bus.toUpperCase()}`,
    })),
    ...(['user', 'api', 'ids'] as const).map((id) => ({
      id,
      name: { user: 'game_hooks.c', api: 'ui.h', ids: 'ui_ids.h' }[id],
      kind: 'code' as const,
      detail: id === 'user' ? 'C99 · editable game logic' : 'Generated · read only',
    })),
  ];
  const visible = entries.filter(
    (e) => e.kind === category && e.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selection = entries.find((e) => `${e.kind}:${e.id}` === selected);
  const open = (entry: Entry) => {
    if (entry.kind === 'scenes' || entry.kind === 'prefabs') onOpenScene(entry.id);
    if (entry.kind === 'sprites' && !playing)
      onAddSprite(project.sprites.find((s) => s.id === entry.id)!);
    if (entry.kind === 'audio' && !playing)
      onAudition(project.audio.find((s) => s.id === entry.id)!);
    if (entry.kind === 'tilesets') {
      onOpenTileset(entry.id);
      setTab('tiles');
    }
    if (entry.kind === 'code') onOpenCode(entry.id as 'user' | 'api' | 'ids');
  };
  const switchTab = (next: 'project' | 'console' | 'tiles') => {
    setTab(next);
    if (collapsed) onCollapse();
  };
  const messages = [
    ...issues.map((i) => ({ severity: i.severity, message: i.message })),
    ...logs.map((message) => ({ severity: 'info', message })),
  ].filter((m) => consoleFilter === 'all' || m.severity === consoleFilter);
  return (
    <section
      className={`project-dock ${collapsed ? 'collapsed' : ''}`}
      aria-label="Project and console dock"
    >
      <header className="dock-tabs">
        <div role="tablist" aria-label="Bottom dock">
          <button role="tab" aria-selected={tab === 'project'} onClick={() => switchTab('project')}>
            <FolderOpen size={13} /> Project
          </button>
          <button role="tab" aria-selected={tab === 'tiles'} onClick={() => switchTab('tiles')}>
            <Grid2X2 size={13} /> Tilemap
          </button>
          <button role="tab" aria-selected={tab === 'console'} onClick={() => switchTab('console')}>
            <SquareTerminal size={13} /> Console <small>{logs.length + issues.length}</small>
          </button>
        </div>
        <span className="dock-summary">
          {tab === 'console'
            ? `${issues.filter((i) => i.severity === 'error').length} errors · ${issues.filter((i) => i.severity === 'warning').length} warnings`
            : `${project.scenes.length} scenes · ${project.sprites.length} sprites · ${project.audio.length} sounds`}
        </span>
        <button
          aria-label={collapsed ? 'Expand project dock' : 'Collapse project dock'}
          title={collapsed ? 'Expand dock' : 'Collapse dock'}
          onClick={onCollapse}
        >
          {collapsed ? <ChevronDown size={13} /> : <Minus size={13} />}
        </button>
      </header>
      {!collapsed &&
        (tab === 'tiles' ? (
          tilesPanel
        ) : tab === 'project' ? (
          <div className="project-browser">
            <nav className="project-folders" aria-label="Project folders">
              <div className="project-root">
                <ChevronDown size={12} />
                <FolderOpen size={14} />
                <strong>res://</strong>
              </div>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className={category === folder.id ? 'active' : ''}
                  onClick={() => {
                    setCategory(folder.id);
                    setSelected('');
                  }}
                >
                  <ChevronRight size={11} />
                  <folder.icon size={13} />
                  <span>{folder.name}</span>
                  <small>{entries.filter((e) => e.kind === folder.id).length}</small>
                </button>
              ))}
            </nav>
            <div className="project-files">
              <div className="project-pathbar">
                <span>
                  <Folder size={12} /> res:// <ChevronRight size={10} />{' '}
                  {folders.find((f) => f.id === category)?.name}
                </span>
                <label className="project-search">
                  <Search size={12} />
                  <input
                    aria-label="Search project assets"
                    placeholder="Search assets…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button
                  aria-label={list ? 'Show asset thumbnails' : 'Show asset list'}
                  title="Toggle list / thumbnails"
                  onClick={() => setList(!list)}
                >
                  <List size={13} />
                </button>
                <button
                  className="project-import"
                  disabled={playing}
                  onClick={() => {
                    if (category === 'scenes') onNewScene();
                    else if (category === 'prefabs') onOpenCode('api');
                    else if (category === 'code') onOpenCode('user');
                    else onImport(category);
                  }}
                >
                  <Plus size={12} />{' '}
                  {
                    {
                      scenes: 'New scene',
                      prefabs: 'Spawn API',
                      sprites: 'Import image',
                      tilesets: 'Import tileset',
                      audio: 'Import WAV',
                      code: 'Open hooks',
                    }[category]
                  }
                </button>
              </div>
              <div
                className={`project-file-grid ${list ? 'list' : ''}`}
                role="list"
                aria-label={`${folders.find((f) => f.id === category)?.name} assets`}
              >
                {visible.map((entry) => {
                  const Icon = folders.find((f) => f.id === entry.kind)!.icon;
                  return (
                    <button
                      key={entry.id}
                      role="listitem"
                      className={`project-file ${selected === `${entry.kind}:${entry.id}` ? 'selected' : ''}`}
                      title={`${entry.name}${extension[entry.kind]} · ${entry.detail}`}
                      aria-label={`${entry.name}${extension[entry.kind]}`}
                      onClick={() => setSelected(`${entry.kind}:${entry.id}`)}
                      onDoubleClick={() => open(entry)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          open(entry);
                        }
                      }}
                    >
                      <span className={`project-thumbnail ${entry.kind}`}>
                        {entry.kind === 'sprites' ? (
                          <img src={sprites[entry.id]} draggable={false} alt="" />
                        ) : (
                          <Icon size={25} strokeWidth={1.25} />
                        )}
                        {(entry.kind === 'scenes' || entry.kind === 'prefabs') && (
                          <small>{'2D'}</small>
                        )}
                        {entry.kind === 'code' && <small>C</small>}
                      </span>
                      <span>{entry.name}</span>
                      <small>
                        {entry.kind === 'sprites'
                          ? project.sprites.find((s) => s.id === entry.id)!.width + ' px'
                          : entry.kind === 'scenes'
                            ? 'Scene'
                            : entry.kind === 'prefabs'
                              ? 'Prefab'
                              : entry.kind === 'tilesets'
                                ? 'Tileset'
                                : entry.kind === 'audio'
                                  ? 'WAV'
                                  : 'C99'}
                      </small>
                    </button>
                  );
                })}
                {!visible.length && (
                  <div className="project-empty">
                    <Folder size={22} />
                    <span>{query ? 'No matching assets' : 'This folder is empty'}</span>
                    <small>
                      {category === 'sprites' || category === 'tilesets' || category === 'audio'
                        ? 'Use Import to add assets to this project.'
                        : category === 'prefabs'
                          ? 'Select an object in Hierarchy, then Inspector → Create prefab from branch.'
                          : 'Create content using the editor menus.'}
                    </small>
                  </div>
                )}
              </div>
              <div className="project-selection">
                <span>
                  {selection
                    ? `${selection.name} · ${selection.detail}`
                    : 'Select an asset · double-click or Enter to open / place it'}
                </span>
                {selection && (
                  <>
                    <button
                      disabled={playing && ['sprites', 'audio'].includes(selection.kind)}
                      onClick={() => open(selection)}
                    >
                      {selection.kind === 'scenes'
                        ? 'Open scene'
                        : selection.kind === 'prefabs'
                          ? 'Edit prefab'
                          : selection.kind === 'sprites'
                            ? 'Add to scene'
                            : selection.kind === 'audio'
                              ? 'Audition'
                              : selection.kind === 'tilesets'
                                ? 'Open tileset'
                                : 'Open code'}{' '}
                      <ChevronRight size={11} />
                    </button>
                    {(selection.kind === 'scenes' || selection.kind === 'prefabs') && (
                      <button disabled={playing} onClick={() => onInstanceScene(selection.id)}>
                        {selection.kind === 'prefabs' ? 'Place instance' : 'Instance in scene'}{' '}
                        <Plus size={11} />
                      </button>
                    )}
                    {selection.kind === 'prefabs' && (
                      <>
                        <label>
                          Copies{' '}
                          <input
                            aria-label="Prefab pool capacity"
                            type="number"
                            min={1}
                            max={16}
                            value={poolCapacity}
                            disabled={playing}
                            onChange={(e) => setPoolCapacity(Number(e.target.value))}
                            style={{ width: 42 }}
                          />
                        </label>
                        <button
                          disabled={
                            playing ||
                            !Number.isInteger(poolCapacity) ||
                            poolCapacity < 1 ||
                            poolCapacity > 16
                          }
                          onClick={() => onCreatePool(selection.id, poolCapacity)}
                        >
                          Create spawn pool
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="console-dock">
            <div className="console-toolbar">
              <button aria-label="Clear console messages" onClick={onClearLogs}>
                <Trash2 size={12} /> Clear
              </button>
              <span>Editor output</span>
              {(['all', 'info', 'warning', 'error'] as const).map((filter) => (
                <button
                  key={filter}
                  aria-pressed={consoleFilter === filter}
                  className={consoleFilter === filter ? 'active' : ''}
                  onClick={() => setConsoleFilter(filter)}
                >
                  {filter === 'all'
                    ? 'All'
                    : filter === 'info'
                      ? 'Messages'
                      : filter === 'warning'
                        ? 'Warnings'
                        : 'Errors'}
                </button>
              ))}
            </div>
            <div
              className="console-messages"
              ref={consoleBody}
              role="log"
              aria-label="Editor console"
            >
              {messages.map((message, index) => (
                <div key={index} className={`console-message ${message.severity}`}>
                  {message.severity === 'error' ? (
                    <AlertCircle size={13} />
                  ) : message.severity === 'warning' ? (
                    <AlertTriangle size={13} />
                  ) : (
                    <Info size={13} />
                  )}
                  <span>{message.message}</span>
                  <small>{message.severity === 'info' ? 'Editor' : 'Validation'}</small>
                </div>
              ))}
              {!messages.length && (
                <div className="project-empty">
                  <SquareTerminal size={22} />
                  <span>No messages</span>
                </div>
              )}
            </div>
          </div>
        ))}
    </section>
  );
}
