import { experimentalPlatform } from './build-info';
import { inputFiles } from './input/export';
import { InputSettings } from './components/InputSettings';
import { rpgNodes } from './rpg/view';
import { useAgentBridge } from './automation/use-agent-bridge';
import { setTileAnimation } from './tiles/animation';
import { refreshTerrain } from './tiles/terrain';
import { NodeEmitter } from './components/NodeEmitter';
import { projectileNodes } from './gameplay/projectiles';
import { drawNodes2D } from './draw-order2d';
import { initialAnimationImage } from './animation/layers';
import { gameplayIssues } from './gameplay/model';
import './gameplay.css';
import { NodeGameplay } from './components/NodeGameplay';
import { dialogueNodes } from './gameplay/dialogue-view';
import { checkpointNodes } from './gameplay/checkpoint-feedback';
import { serializeProject } from './project-file';
import { cameraNodes2D, cameraPosition2D, clampCamera2D } from './camera2d';
import { Camera2DControls } from './components/Camera2DControls';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  Code2,
  Copy,
  Cpu,
  Download,
  FilePlus2,
  FolderOpen,
  Gamepad2,
  Grid2X2,
  Image,
  Layers,
  Link2,
  ListOrdered,
  Maximize,
  Focus,
  Monitor,
  MonitorPlay,
  MousePointer2,
  Music2,
  Paintbrush,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Square,
  SquareMousePointer,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Project, Scene, GameNode, SpriteAsset, AudioCue, NodeKind, Bus } from './model';
import { makeNode, parseProject, sortedNodes, uid, validate, projectIdentity } from './model';
import { setTouchControls, touchControlsEnabled } from './input/touch-controls';
import { controllerAt } from './input/pointer-input';
import { base64ToBytes, bytesToBase64, createStarter, readWav, spriteUrl } from './assets';
import { useScenePreview } from './editor/useScenePreview';
import { generate, zipProject, type ExportStats } from './exporter';
import { runtimeFiles } from './runtime';
import { physicsFor, makePhysics } from './physics';
import { createPhysicsDemo } from './physics-demo';
import { PhysicsInspector } from './components/PhysicsInspector';
import { ColliderOverlay } from './components/ColliderOverlay';
import { packTilemap } from './compression';
import { produce } from 'immer';
import { desktop, uiEntries, type RecentProject, type DesktopAction } from './desktop';
import { Welcome, NewProject, type NewProjectOptions } from './components/ProjectStart';
import { ExportPanel } from './components/ExportPanel';
import { BoardPanel } from './components/BoardPanel';
import { NativePlaytestPanel } from './components/NativePlaytestPanel';
import { FlowOrganizer } from './components/FlowOrganizer';
import { getFlow, flowEntry, sequenceStart } from './flow';
const GameplayEditor = lazy(() =>
  import('./components/GameplayEditor').then((m) => ({ default: m.GameplayEditor })),
);
const CodeEditor = lazy(() =>
  import('./components/CodeEditor').then((module) => ({ default: module.CodeEditor })),
);
import { ApiReference } from './components/ApiReference';
import { uiHeader, uiIds } from './ui-api';
import {
  branchIds,
  displaySceneNodes,
  instanceSources,
  reparentNode,
  moveSceneNode,
  resolveScene,
  sceneGraphIssues,
} from './scenes';
import {
  duplicateBranch,
  extractScene,
  patchSceneNode,
  unpackInstance,
} from './editor/scene-commands';
import { SceneTree } from './components/SceneTree';
import { PrefabPreview } from './components/PrefabPreview';
import { createPrefab, createPrefabPool } from './editor/prefab-commands';
import { SceneInstancePicker } from './components/SceneInstancePicker';
import { InheritedNodeInspector } from './components/InheritedNodeInspector';
import { validFlow } from './flow';
import { useWorkbenchLayout, defaultLayout } from './editor/useWorkbenchLayout';
import { DockSeparator } from './components/DockSeparator';
import { EditorMenuBar, type EditorMenu } from './components/EditorMenuBar';
import { ProjectDock } from './components/ProjectDock';
import type { TilesetImportAction } from './components/TilesetImporter';
import { TilemapCanvas } from './components/TilemapCanvas';
import { TilePaintOverlay } from './components/TilePaintOverlay';
import { SpritePixelScale } from './components/SpritePixelScale';
import { ScenePixels } from './components/ScenePixels';
import { useH7Board } from './boards/stm32h7s78';
import { useTargetGuidance } from './targets/useTargetGuidance';
import { TargetSummary } from './components/TargetSummary';
import { buttonTextColor, pixelPerfectEnabled, renderPixel } from './pixel-perfect';
import { useDevicePixelRatio, usePixelAlignment } from './editor/usePixelViewport';
import { useSceneNavigation } from './editor/useSceneNavigation';
import { sceneBounds } from './editor/viewport-navigation';
import { useTilePainter } from './editor/useTilePainter';
import type { TileStamp, TileTool } from './editor/tile-tools';
import type { TilesetAsset } from './model';
import {
  projectImages,
  attachTileset,
  makeTilemap,
  setTileSolid,
  setTileSlope,
  MAX_PROJECT_TILES,
} from './tilesets';
import { CanvasRulers } from './components/CanvasRulers';
const STORAGE = 'lvgl-game-engine-2d.project.v1';
type Tab = 'scene' | 'code' | 'audio' | 'flow' | 'gameplay';
const TilesetImporter = lazy(() =>
  import('./components/TilesetImporter').then((module) => ({ default: module.TilesetImporter })),
);
const TilemapPanel = lazy(() =>
  import('./components/TilemapPanel').then((module) => ({ default: module.TilemapPanel })),
);
const TargetGuidance = lazy(() =>
  import('./components/TargetGuidance').then((module) => ({ default: module.TargetGuidance })),
);
type Modal =
  | 'inputs'
  | 'board'
  | 'settings'
  | 'export'
  | 'help'
  | 'welcome'
  | 'new'
  | 'playtest'
  | 'tileset'
  | 'target'
  | null;
const iconFor = (n: GameNode, size = 14) =>
  n.kind === 'instance' ? (
    <Link2 size={size} />
  ) : n.kind === 'group' ? (
    <Box size={size} />
  ) : n.kind === 'tilemap' ? (
    <Grid2X2 size={size} />
  ) : n.player ? (
    <Gamepad2 size={size} />
  ) : n.kind === 'sprite' ? (
    <Image size={size} />
  ) : n.kind === 'label' ? (
    <span className="text-icon" aria-hidden="true">
      T
    </span>
  ) : n.kind === 'button' ? (
    <SquareMousePointer size={size} />
  ) : (
    <Square size={size} />
  );
function loadInitial() {
  if (desktop) return createStarter();
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return parseProject(saved);
  } catch {
    /* Keep a corrupt save available for manual recovery. */
  }
  return createStarter();
}
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'game';
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
function Section({
  title,
  children,
  extra,
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <details className="inspector-section" open>
      <summary>
        <h3>
          <ChevronDown size={12} />
          {title}
          {extra}
        </h3>
      </summary>
      {children}
    </details>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min = -4096,
  max = 4096,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        disabled={disabled}
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber))
            onChange(Math.min(max, Math.max(min, e.target.valueAsNumber)));
        }}
      />
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  );
}
export function App() {
  const { layout, setLayout, resetLayout } = useWorkbenchLayout();
  const [project, setProject] = useState<Project>(loadInitial);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [sceneId, setSceneId] = useState(project.scenes[0].id);
  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0];
  const [selected, setSelected] = useState<string>('player');
  const resolvedNodes = useMemo(() => resolveScene(project, scene), [project, scene]);
  const touchEnabled = useMemo(() => touchControlsEnabled(project, scene), [project, scene]);
  const inheritedNode = resolvedNodes.find((n) => n.id === selected && n.instanceRoot);
  const node = scene.nodes.find((n) => n.id === selected) ?? inheritedNode;
  const nodeSource =
    node?.kind === 'instance' ? project.scenes.find((s) => s.id === node.scene) : undefined;
  const [instancePicker, setInstancePicker] = useState(false);
  const [sceneTrail, setSceneTrail] = useState<
    {
      scene: string;
      node: string;
    }[]
  >([]);
  const [tab, setTab] = useState<Tab>('scene');
  const gameLookDrag = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const [compactPanel, setCompactPanel] = useState<'left' | 'right' | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [codeFile, setCodeFile] = useState<'user' | 'api' | 'ids'>('user');
  const [codeLine, setCodeLine] = useState<number | undefined>();
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  // Navigation belongs to the open document session, not its mutable name or save path.
  const [viewSession, setViewSession] = useState(0);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [hydrated, setHydrated] = useState(!desktop);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const lastSavedProject = useRef<Project | null>(project);
  const actionHandler = useRef<(action: DesktopAction) => void>(() => {});
  const [exportDestination, setExportDestination] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportConflicts, setExportConflicts] = useState<string[]>([]);
  const [grid, setGrid] = useState(false),
    [snap, setSnap] = useState(true),
    [paint, setPaint] = useState(false),
    [brush, setBrush] = useState(1);
  const [tileTool, setTileTool] = useState<TileTool>('brush');
  const [tileStamp, setTileStamp] = useState<TileStamp | null>(null);
  const [activeTileset, setActiveTileset] = useState('');
  const [tilesRequest, setTilesRequest] = useState(0);
  const [showColliders, setShowColliders] = useState(false);
  const [colliderEditing, setColliderEditing] = useState('');
  const [filter, setFilter] = useState('');
  const [editorCamera, setEditorCamera] = useState({ scene: '', x: 0, y: 0 });
  const editorView = clampCamera2D(
    scene.camera2d,
    project,
    editorCamera.scene === scene.id ? editorCamera.x : 0,
    editorCamera.scene === scene.id ? editorCamera.y : 0,
  );
  const [logs, setLogs] = useState<string[]>(['Project ready. Select an object to get started.']);
  const [toast, setToast] = useState(''),
    [saved, setSaved] = useState(true);
  const tileGestureCancel = useRef<() => void>(() => {});
  const [historyTick, setHistoryTick] = useState(0);
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const viewport = useRef<HTMLDivElement>(null),
    stageFrame = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    openInput = useRef<HTMLInputElement>(null),
    assetInput = useRef<HTMLInputElement>(null),
    audioInput = useRef<HTMLInputElement>(null);
  const pixelPerfect = pixelPerfectEnabled(project);
  const deviceRatio = useDevicePixelRatio();
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    painting: boolean;
    changed: boolean;
    corner?: string;
    width?: number;
    height?: number;
  } | null>(null);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null),
    [exporting, setExporting] = useState(false);
  const [gains, setGains] = useState<Record<Bus, number>>({ sfx: 1, music: 0.7, ui: 1 }),
    [muted, setMuted] = useState(false);
  const images = useMemo(
    () => projectImages(project),
    [project.sprites, project.tilesets, project.gameplay],
  );
  const imageById = useMemo(() => Object.fromEntries(images.map((a) => [a.id, a])), [images]);
  const importedTileIds = useMemo(
    () => new Set(project.tilesets?.flatMap((set) => set.tiles.map((t) => t.id)) ?? []),
    [project.tilesets],
  );
  const sprites = useMemo(
    () => Object.fromEntries(images.map((a) => [a.id, spriteUrl(a)])),
    [images],
  );
  const { report: targetReport, pending: targetPending } = useTargetGuidance(project);
  const projectIssues = useMemo(() => validate(project), [project]);
  const issues = useMemo(
    () => [
      ...projectIssues.filter((i) => i.severity === 'error'),
      ...(!targetPending
        ? targetReport.alerts
            .filter((a) => a.level !== 'info')
            .map((a) => ({
              severity: 'warning' as const,
              message: `Target: ${a.title}. ${a.suggestion}`,
            }))
        : []),
      ...projectIssues.filter((i) => i.severity !== 'error'),
    ],
    [projectIssues, targetReport, targetPending],
  );
  const errors = issues.filter((i) => i.severity === 'error');
  const notify = useCallback((message: string) => setToast(message), []);
  const log = useCallback((message: string) => setLogs((old) => [...old.slice(-49), message]), []);
  const commit = useCallback((next: Project, record = true) => {
    if (record) {
      past.current.push(projectRef.current);
      if (past.current.length > 60) past.current.shift();
      future.current = [];
      setHistoryTick((t) => t + 1);
    }
    projectRef.current = next;
    setProject(next);
    setSaved(false);
    setDocumentDirty(next !== lastSavedProject.current);
  }, []);
  const edit = (fn: (p: Project) => void, record = true) => {
    commit(
      produce(projectRef.current, (draft) => {
        fn(draft as Project);
      }),
      record,
    );
  };
  const editScene = (fn: (s: Scene) => void, record = true) =>
    edit((p) => fn(p.scenes.find((s) => s.id === scene.id)!), record);
  const editGraph = (change: (p: Project, s: Scene) => void, record = true): boolean => {
    try {
      const next = produce(projectRef.current, (draft) => {
        change(draft as Project, draft.scenes.find((s) => s.id === scene.id)! as Scene);
      });
      const gameplayIssue = gameplayIssues(next).find((m) =>
        m.includes('does not exist. Use self'),
      );
      if (gameplayIssue) throw new Error(gameplayIssue);
      const issue = sceneGraphIssues(next)[0];
      if (issue) throw new Error(issue.message);
      if (!validFlow(next))
        throw new Error(
          'This button advances a sequence. Change its rule in Game flow before deleting or changing this branch.',
        );
      commit(next, record);
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    }
  };
  const editNode = (changes: Partial<GameNode>) =>
    editGraph((p, s) => patchSceneNode(p, s, selected, changes));
  const undo = useCallback(() => {
    tileGestureCancel.current();
    const p = past.current.pop();
    if (!p) return;
    future.current.push(projectRef.current);
    projectRef.current = p;
    setProject(p);
    setHistoryTick((t) => t + 1);
    setSaved(false);
    setDocumentDirty(p !== lastSavedProject.current);
  }, []);
  const redo = useCallback(() => {
    tileGestureCancel.current();
    const p = future.current.pop();
    if (!p) return;
    past.current.push(projectRef.current);
    projectRef.current = p;
    setProject(p);
    setHistoryTick((t) => t + 1);
    setSaved(false);
    setDocumentDirty(p !== lastSavedProject.current);
  }, []);
  const preview = useScenePreview({
    project: projectRef,
    scene,
    stage,
    selectScene: setSceneId,
    clearSelection: () => setSelected(''),
    onStart: () => {
      setTab('scene');
      setPaint(false);
    },
    onInvalid: () => setModal('export'),
    notify,
    log,
    undo,
    redo,
    editorShortcuts: !desktop,
  });
  const { playing, paused, starting, sim, flowCursor, run, stop, pause, nextPreviewStep } = preview;
  const navigation = useSceneNavigation({
    viewport,
    frame: stageFrame,
    focusTarget: stage,
    context: `${viewSession}:${scene.id}:${playing ? 'game' : 'scene'}`,
    active: tab === 'scene',
    playing,
    painting: paint,
    pixels: pixelPerfect,
    ratio: deviceRatio,
    display: project,
    bounds: (selection) =>
      sceneBounds(
        displaySceneNodes(project, scene).map((n) => ({
          ...n,
          x: n.x - (n.layer === 'world' ? editorView.x : 0),
          y: n.y - (n.layer === 'world' ? editorView.y : 0),
        })),
        project,
        selection ? selected : undefined,
      ),
  });
  const { zoom, zoomOptions, fit } = navigation;
  const pixelAlignment = usePixelAlignment(
    pixelPerfect,
    deviceRatio,
    viewport,
    stageFrame,
    `${tab}:${project.width}:${project.height}:${zoom}:${navigation.pan.x}:${navigation.pan.y}`,
  );
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop
      .bootstrap()
      .then((data) => {
        if (!active) return;
        document.documentElement.dataset.desktop = data.platform;
        setRecent(data.recent);
        setExportDestination(data.exportFolder);
        if (data.recovery) {
          const restored = parseProject(data.recovery.text);
          projectRef.current = restored;
          setProject(restored);
          setViewSession((v) => v + 1);
          setSceneId(restored.scenes[0].id);
          setTab('scene');
          setSelected('');
          lastSavedProject.current = data.recovery.dirty ? null : restored;
          setDocumentDirty(data.recovery.dirty);
          setDocumentPath(data.documentPath);
          log(
            data.recovery.dirty ? 'Recovered your unsaved session.' : 'Restored your last project.',
          );
        } else setModal('welcome');
        setHydrated(true);
        if (data.initialAction) actionHandler.current(data.initialAction);
      })
      .catch((error) => {
        if (active) {
          setHydrated(true);
          notify(`Could not restore session: ${error.message}`);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (desktop && hydrated)
      void desktop
        .setDocumentState({ name: project.name, dirty: documentDirty })
        .catch((error) => notify(error.message));
  }, [hydrated, project.name, documentDirty, notify]);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const text = JSON.stringify(project);
        if (desktop) await desktop.saveRecovery(text, documentDirty);
        else localStorage.setItem(STORAGE, text);
        if (active) setSaved(true);
      } catch {
        if (active) {
          setSaved(false);
          notify('Recovery could not be saved. Use Save to keep a project file.');
        }
      }
    }, 650);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [project, documentDirty, hydrated, notify]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const save = async (saveAs = false) => {
    const snapshot = projectRef.current;
    try {
      if (desktop) {
        const result = await desktop.saveProject(serializeProject(snapshot), saveAs);
        if (!result) return false;
        lastSavedProject.current = snapshot;
        setDocumentPath(result.path);
        setDocumentDirty(projectRef.current !== snapshot);
        notify(`Saved ${result.name}`);
        return true;
      }
      download(
        new Blob([serializeProject(snapshot)], { type: 'application/json' }),
        `${fileName(snapshot.name)}.lge.json`,
      );
      lastSavedProject.current = snapshot;
      setDocumentDirty(false);
      notify('Project file saved.');
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    }
  };
  useAgentBridge({
    project: projectRef,
    savedProject: lastSavedProject,
    commit: (next) => {
      commit(next);
      if (!next.scenes.some((s) => s.id === sceneId)) setSceneId(next.scenes[0].id);
      setSelected('');
      log('Applied CLI transaction (Undo available).');
    },
    save: () => save(false),
    playing,
    path: documentPath,
    hydrated,
  });
  const mayReplace = async () => {
    if (!desktop) return true;
    const result = await desktop.confirmDiscard(serializeProject(projectRef.current));
    if (result.saved) {
      lastSavedProject.current = projectRef.current;
      setDocumentDirty(false);
      setDocumentPath(result.saved.path);
    }
    return result.proceed;
  };
  const nativeOpen = async (index?: number, fromSystem = false) => {
    if (!desktop) {
      openInput.current?.click();
      return;
    }
    try {
      if (!(await mayReplace())) return;
      const result = fromSystem
        ? await desktop.openPending()
        : index === undefined
          ? await desktop.openProject()
          : await desktop.openRecent(index);
      if (!result) return;
      const next = parseProject(result.text);
      await desktop.acceptProject(result.ticket);
      stop();
      lastSavedProject.current = next;
      commit(next);
      setDocumentDirty(false);
      setDocumentPath(result.path);
      setViewSession((v) => v + 1);
      past.current = [];
      future.current = [];
      setHistoryTick((t) => t + 1);
      setSceneId(next.scenes[0].id);
      setSelected('');
      setTab('scene');
      setModal(null);
      log(`Opened ${next.name}.`);
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const createProject = async (options: NewProjectOptions) => {
    try {
      if (!(await mayReplace())) return;
      const next =
        options.template === 'h7-adventure'
          ? (await import('./examples/h7-adventure')).createH7Adventure()
          : options.template === 'rpg'
            ? (await import('./rpg/demo')).createRpgDemo()
            : options.template === 'toolkit'
              ? (await import('./gameplay/toolkit-demo')).createToolkitDemo()
              : options.template === 'gameplay'
                ? (await import('./gameplay/demo')).createGameplayDemo()
                : options.template === 'side-scroller'
                  ? (await import('./examples/side-scroller')).createSideScrollerDemo()
                  : options.template === 'adventure'
                    ? (await import('./examples/topdown-adventure')).createAdventureDemo()
                    : options.template === 'tileset'
                      ? (await import('./tileset-demo')).createTilesetDemo()
                      : options.template === 'physics'
                        ? createPhysicsDemo()
                        : createStarter();
      if (options.template === 'blank') {
        next.name = options.name;
        next.width = options.width;
        next.height = options.height;
        next.colorDepth = options.colorDepth;
        next.scenes = [
          {
            id: uid('scene'),
            name: 'Main scene',
            background: '#263f35',
            objective: '',
            completion: 'Complete!',
            music: '',
            nodes: [],
          },
        ];
        next.sprites = [];
        next.audio = [];
      }
      if (desktop) {
        await desktop.newDocument();
        // The example can equal the initial name/dirty state, so React's state effect may not rerun.
        await desktop.setDocumentState({ name: next.name, dirty: options.template === 'blank' });
      }
      stop();
      lastSavedProject.current = options.template !== 'blank' ? next : null;
      commit(next);
      setDocumentPath(null);
      setViewSession((v) => v + 1);
      setDocumentDirty(options.template === 'blank');
      past.current = [];
      future.current = [];
      setHistoryTick((t) => t + 1);
      setSceneId(next.scenes[0].id);
      setSelected(
        options.template === 'tileset' ? 'terrain' : options.template !== 'blank' ? 'player' : '',
      );
      setShowColliders(options.template === 'physics');
      setColliderEditing('');
      setTab('scene');
      setPaint(options.template === 'tileset');
      if (options.template === 'tileset') {
        setGrid(true);
        showTiles();
      }
      setModal(null);
      log(
        options.template !== 'blank'
          ? 'Example ready. Press Play to explore.'
          : 'Project created. Add your first object to the scene.',
      );
    } catch (error) {
      notify((error as Error).message);
    }
  };
  useEffect(() => {
    if (desktop) return desktop.onAction((action) => actionHandler.current(action));
  }, []);
  actionHandler.current = (action) => {
    if (action.type === 'save') void save();
    else if (action.type === 'save-as') void save(true);
    else if (action.type === 'open') void nativeOpen();
    else if (action.type === 'open-recent') void nativeOpen(action.index);
    else if (action.type === 'open-file') void nativeOpen(undefined, true);
    else if (action.type === 'new') setModal('new');
    else if (action.type === 'export') {
      setExportResult(null);
      setExportConflicts([]);
      setModal('export');
    } else if (action.type === 'native-play') {
      stop();
      setModal('playtest');
    } else if (action.type === 'target-guidance') {
      stop();
      setModal('target');
    } else if (action.type === 'help') setModal('help');
    else if (action.type === 'api') {
      stop();
      setTab('code');
      setCodeFile('api');
    } else if (
      action.type === 'code' ||
      action.type === 'audio' ||
      action.type === 'design' ||
      action.type === 'flow'
    ) {
      stop();
      setTab(action.type === 'design' ? 'scene' : action.type);
    } else if (action.type === 'undo' && !playing) undo();
    else if (action.type === 'redo' && !playing) redo();
    else if (action.type === 'close')
      void mayReplace()
        .then((approved) => desktop!.closeResponse(approved))
        .catch((error) => {
          notify(error.message);
          void desktop!.closeResponse(false);
        });
  };
  const open = async (file?: File) => {
    if (!file) return;
    try {
      const next = parseProject(await file.text());
      stop();
      commit(next);
      setViewSession((v) => v + 1);
      setSceneId(next.scenes[0].id);
      setSelected('');
      setTab('scene');
      log(`Opened ${next.name}.`);
      notify('Project opened.');
      setModal(null);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const addNode = (kind: NodeKind, asset?: SpriteAsset) => {
    if (scene.nodes.length >= 128) {
      notify('This scene has reached its 128 object limit.');
      return;
    }
    const n = makeNode(kind, {
      x: Math.min(32, project.width - 32),
      y: Math.min(64, project.height - 32),
    });
    if (kind === 'sprite') {
      const a = asset ?? project.sprites[0];
      if (!a) {
        notify('Import a sprite first.');
        return;
      }
      n.asset = a.id;
      n.name = a.name;
      n.width = a.width;
      n.height = a.height;
    }
    if (kind === 'tilemap') {
      const tiles = project.sprites
          .filter((a) => a.width === 32 && a.height === 32)
          .slice(0, 32)
          .map((a) => a.id),
        columns = Math.ceil(project.width / 32),
        rows = Math.ceil(project.height / 32);
      n.name = 'Tilemap';
      n.x = 0;
      n.y = 0;
      n.width = columns * 32;
      n.height = rows * 32;
      n.tilemap = {
        tileSize: 32,
        columns,
        rows,
        tiles,
        cells: Array(columns * rows).fill(0),
        solidTiles: [],
      };
    }
    if (node && !inheritedNode && ['group', 'instance'].includes(node.kind)) {
      n.parent = node.id;
      n.x = 0;
      n.y = 0;
    }
    if (!editGraph((_p, s) => s.nodes.push(n))) return;
    setSelected(n.id);
    setAddMenu(false);
    setTab('scene');
    setPaint(kind === 'tilemap');
  };
  const deleteNode = () => {
    if (!node || inheritedNode) return;
    if (
      !editGraph((_p, s) => {
        const ids = branchIds(s, node.id);
        s.nodes = s.nodes.filter((n) => !ids.has(n.id));
      })
    )
      return;
    setSelected('');
  };
  const duplicate = () => {
    if (!node || inheritedNode) return;
    if (scene.nodes.length >= 128) {
      notify('Maximum 128 objects per scene.');
      return;
    }
    let id = '';
    if (
      editGraph((_p, s) => {
        id = duplicateBranch(s, node.id);
      })
    )
      setSelected(id);
  };
  const reorder = (offset: number) => {
    if (!node) return;
    editScene((s) => {
      const siblings = s.nodes.filter((n) => n.parent === node.parent);
      const siblingIndex = siblings.findIndex((n) => n.id === node.id),
        target = siblings[siblingIndex + offset];
      if (!target) return;
      const i = s.nodes.findIndex((n) => n.id === node.id),
        j = s.nodes.findIndex((n) => n.id === target.id);
      const [item] = s.nodes.splice(i, 1);
      s.nodes.splice(j, 0, item);
    });
  };
  const chooseScene = (id: string) => {
    stop();
    setSceneId(id);
    setSelected('');
    setPaint(false);
  };
  const openSceneSource = (id: string) => {
    if (id === scene.id) {
      chooseScene(id);
      return;
    }
    setSceneTrail((trail) => [...trail, { scene: scene.id, node: selected }]);
    chooseScene(id);
  };
  const placeInstance = (source: Scene) => {
    const instance = makeNode('instance', {
      name: source.name,
      scene: source.id,
      x: 0,
      y: 0,
      ...(node && !inheritedNode && ['group', 'instance'].includes(node.kind)
        ? { parent: node.id }
        : {}),
    });
    if (editGraph((_p, s) => s.nodes.push(instance))) {
      setSelected(instance.id);
      setInstancePicker(false);
      setAddMenu(false);
    }
  };
  const addScene = () => {
    if (project.scenes.length >= 256) {
      notify('Maximum 256 scenes per project.');
      return;
    }
    const s: Scene = {
      id: uid('scene'),
      name: `Scene ${project.scenes.length + 1}`,
      background: '#294b39',
      objective: '',
      completion: 'Complete!',
      music: '',
      nodes: [],
    };
    edit((p) => p.scenes.push(s));
    chooseScene(s.id);
    return s.id;
  };
  const importSprite = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('Image limit: 4 MB.');
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 512 || bitmap.height > 512) {
        bitmap.close();
        throw new Error(
          'Sprite limit: 512 × 512. Import individual sprites rather than full sheets.',
        );
      }
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const asset: SpriteAsset = {
        id: uid('spr'),
        name: file.name.replace(/\.[^.]+$/, ''),
        width: c.width,
        height: c.height,
        pixels: [...ctx.getImageData(0, 0, c.width, c.height).data],
      };
      if (project.sprites.length >= 2048) throw new Error('Maximum 2048 source sprite assets.');
      edit((p) => p.sprites.push(asset));
      notify(`Imported ${asset.name}. Click its asset card to place it.`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const importAudio = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Audio limit: 2 MB per clip.');
      if (project.audio.length >= 64) throw new Error('Maximum 64 audio cues.');
      const bytes = new Uint8Array(await file.arrayBuffer()),
        meta = readWav(bytes);
      const cue: AudioCue = {
        id: uid('cue'),
        name: file.name.replace(/\.[^.]+$/, ''),
        file: fileName(file.name.replace(/\.wav$/i, '')) + '.wav',
        data: bytesToBase64(bytes),
        ...meta,
        bus: 'sfx',
        gain: 0.8,
        loop: false,
        priority: 128,
      };
      edit((p) => p.audio.push(cue));
      notify(`Imported ${cue.name}. Bind it to a collectible or UI button.`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const audition = preview.audition;
  const chooseExport = async () => {
    try {
      const path = await desktop?.chooseExportFolder();
      if (path) {
        setExportDestination(path);
        setExportResult(null);
        setExportStats(null);
        setExportConflicts([]);
        return path;
      }
    } catch (error) {
      notify((error as Error).message);
    }
    return null;
  };
  const exportGame = async (kind: 'folder' | 'zip' = 'zip', replaceModified = false) => {
    setExporting(true);
    try {
      if (kind === 'folder' && desktop && !exportDestination && !(await chooseExport())) return;
      const result = generate(projectRef.current, runtimeFiles);
      setExportStats(result.stats);
      if (kind === 'folder' && desktop) {
        const written = await desktop.exportUi(
          uiEntries(result.files),
          projectIdentity(projectRef.current),
          replaceModified,
        );
        if (!written.ok) {
          setExportConflicts(written.conflicts ?? []);
          return;
        }
        setExportConflicts([]);
        setExportResult(written.path);
        log(
          `Exported ui folder · ${written.files} files${written.preserved?.length ? ` · kept ${written.preserved.length} external edits` : ''}`,
        );
        notify(
          written.preserved?.length
            ? 'Export complete. Firmware-side edits were preserved.'
            : 'LVGL ui folder exported.',
        );
      } else {
        const zip = await zipProject(result.files),
          name = `${fileName(projectRef.current.name)}_lvgl.zip`;
        if (desktop) {
          const path = await desktop.saveArchive(new Uint8Array(await zip.arrayBuffer()), name);
          if (path) {
            setExportResult(path);
            notify('LVGL package saved.');
          }
        } else {
          download(zip, name);
          notify('LVGL package downloaded.');
        }
      }
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const showTiles = () => {
    setTilesRequest((value) => value + 1);
    setLayout((old) => ({ ...old, collapsed: false, project: Math.max(260, old.project) }));
  };
  const chooseTileTool = useCallback((tool: TileTool) => {
    setTileTool(tool);
    setPaint(true);
    setGrid(true);
    if (tool !== 'erase') setBrush((old) => Math.max(1, old));
  }, []);
  const chooseStamp = (stamp: TileStamp) => {
    setTileStamp(stamp);
    setPaint(true);
    setGrid(true);
    const index = node?.tilemap?.tiles.indexOf(stamp.cells.find(Boolean) ?? '') ?? -1;
    if (index >= 0) setBrush(index + 1);
  };
  useEffect(() => {
    setTileStamp(null);
    setTileTool('brush');
    setBrush(1);
    setActiveTileset(node?.tilemap?.tileset ?? '');
    if (!node?.tilemap) setPaint(false);
  }, [scene.id, selected]);
  const stamp = tileStamp ?? {
    width: 1,
    height: 1,
    cells: [node?.tilemap?.tiles[brush - 1] ?? ''],
  };
  const tileWorld = resolvedNodes.find((n) => n.id === selected);
  const tilePainter = useTilePainter({
    enabled: paint && !!node?.tilemap && !inheritedNode && !playing,
    node,
    worldX: renderPixel((tileWorld?.worldX ?? 0) - (node?.layer === 'world' ? editorView.x : 0)),
    worldY: renderPixel((tileWorld?.worldY ?? 0) - (node?.layer === 'world' ? editorView.y : 0)),
    zoom,
    stage,
    tool: tileTool,
    stamp,
    onTool: chooseTileTool,
    onError: notify,
    onPick: (id) => {
      setTileStamp({ width: 1, height: 1, cells: [id] });
      setBrush(Math.max(0, (node?.tilemap?.tiles.indexOf(id) ?? -1) + 1));
      setTileTool(id ? 'brush' : 'erase');
    },
    onApply: (id, changes, record) =>
      editGraph((_p, s) => {
        const map = s.nodes.find((n) => n.id === id)?.tilemap;
        if (map) {
          for (const [index, value] of changes) map.cells[index] = value;
          refreshTerrain(map, changes.keys());
        }
      }, record),
  });
  tileGestureCancel.current = tilePainter.pointerCancel;
  const createTileLayer = (id: string) => {
    let added = '';
    if (
      editGraph((p, s) => {
        const set = p.tilesets?.find((a) => a.id === id);
        if (!set) throw new Error('Tileset no longer exists.');
        const layer = makeTilemap(p, set);
        s.nodes.push(layer);
        added = layer.id;
      })
    ) {
      setSelected(added);
      setActiveTileset(id);
      setPaint(true);
      setGrid(true);
      setTab('scene');
      showTiles();
    }
  };
  const useTileset = (id: string) => {
    if (!node?.tilemap || inheritedNode) return;
    if (
      editGraph((p, s) => {
        const map = s.nodes.find((n) => n.id === selected)?.tilemap,
          set = p.tilesets?.find((a) => a.id === id);
        if (map && set) attachTileset(map, set);
      })
    ) {
      setActiveTileset(id);
      chooseTileTool('brush');
    }
  };
  const importTilesets = (sets: TilesetAsset[], action: TilesetImportAction) => {
    const set = sets[sets.length - 1];
    let layerId = '';
    if (
      editGraph((p, s) => {
        if ((p.tilesets?.length ?? 0) + sets.length > 32)
          throw new Error('Maximum 32 tilesets per project.');
        if (
          (p.tilesets?.reduce((sum, a) => sum + a.tiles.length, 0) ?? 0) +
            sets.reduce((n, s) => n + s.tiles.length, 0) >
          MAX_PROJECT_TILES
        )
          throw new Error('Project limit: 2048 unique tiles.');
        p.tilesets ??= [];
        p.tilesets.push(...sets);
        for (const set of sets) {
          if (action === 'new-layer') {
            const layer = makeTilemap(p, set);
            s.nodes.push(layer);
            layerId = layer.id;
          }
          if (action === 'selected-layer') {
            const map = s.nodes.find((n) => n.id === selected)?.tilemap;
            if (!map) throw new Error('Select a tilemap first.');
            attachTileset(map, set);
            layerId = selected;
          }
        }
        parseProject(JSON.stringify(p));
      })
    ) {
      setModal(null);
      setActiveTileset(set.id);
      if (layerId) {
        setSelected(layerId);
        setPaint(true);
        setGrid(true);
        setTab('scene');
      }
      setTileStamp({ width: 1, height: 1, cells: [set.tiles[0].id] });
      showTiles();
      notify(`Imported ${set.name} · ${set.tiles.length} unique tiles.`);
    }
  };
  const editTileSolids = (ids: string[], solid: boolean) =>
    editGraph((p, s) => {
      const map = s.nodes.find((n) => n.id === selected)?.tilemap;
      for (const id of ids)
        if (!setTileSolid(p, id, solid) && map) {
          const index = map.tiles.indexOf(id) + 1;
          if (!index) continue;
          map.solidTiles = map.solidTiles.filter((v) => v !== index);
          if (solid) map.solidTiles.push(index);
          else if (map.slopes) delete map.slopes[index];
        }
    });
  const pointerDown = (e: React.PointerEvent, id: string) => {
    if (playing) return;
    if (paint && node?.tilemap) {
      tilePainter.pointerDown(e);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(id);
    const n = resolvedNodes.find((n) => n.id === id);
    if (!n) return;
    drag.current = {
      id,
      x: n.x,
      y: n.y,
      startX: e.clientX,
      startY: e.clientY,
      painting: false,
      changed: false,
    };
  };
  const beginResize = (e: React.PointerEvent, n: GameNode, corner: string) => {
    const authored = scene.nodes.find((a) => a.id === n.id);
    if (!authored) return;
    n = authored;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: n.id,
      x: n.x,
      y: n.y,
      startX: e.clientX,
      startY: e.clientY,
      painting: false,
      changed: false,
      corner,
      width: n.width,
      height: n.height,
    };
  };
  const resizeMap = (columns: number, rows: number, tileSize: number) => {
    if (!node?.tilemap) return;
    const old = node.tilemap;
    const cells = Array.from({ length: columns * rows }, (_, i) => {
      const c = i % columns,
        r = Math.floor(i / columns);
      return c < old.columns && r < old.rows ? old.cells[r * old.columns + c] : 0;
    });
    editNode({
      width: columns * tileSize,
      height: rows * tileSize,
      tilemap: { ...old, columns, rows, tileSize, cells },
    });
  };
  const pointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const snapValue = snap ? 4 : 1,
      round = (v: number) => Math.round(v / snapValue) * snapValue;
    if (d.corner) {
      const dx = (e.clientX - d.startX) / zoom,
        dy = (e.clientY - d.startY) / zoom;
      const left = d.corner.includes('l'),
        top = d.corner.includes('t');
      const width = Math.max(1, Math.min(2048, round(d.width! + (left ? -dx : dx))));
      const height = Math.max(1, Math.min(2048, round(d.height! + (top ? -dy : dy))));
      const x = left ? d.x + d.width! - width : d.x,
        y = top ? d.y + d.height! - height : d.y;
      const current = projectRef.current.scenes
        .find((s) => s.id === scene.id)
        ?.nodes.find((n) => n.id === d.id);
      if (
        current &&
        (current.width !== width || current.height !== height || current.x !== x || current.y !== y)
      ) {
        editScene((s) => {
          Object.assign(
            s.nodes.find((n) => n.id === d.id)!,
            { x, y, width, height },
          );
        }, !d.changed);
        d.changed = true;
      }
      return;
    }
    const x = round(d.x + (e.clientX - d.startX) / zoom),
      y = round(d.y + (e.clientY - d.startY) / zoom);
    const currentScene = projectRef.current.scenes.find((s) => s.id === scene.id)!;
    const current = resolveScene(projectRef.current, currentScene).find((n) => n.id === d.id);
    if (current && (current.x !== x || current.y !== y)) {
      editGraph(
        (p, s) =>
          patchSceneNode(p, s, d.id, {
            x: Math.min(4096, Math.max(-4096, x)),
            y: Math.min(4096, Math.max(-4096, y)),
          }),
        !d.changed,
      );
      d.changed = true;
    }
  };
  const worldNodes =
    sim?.nodes ??
    sortedNodes({ ...scene, nodes: displaySceneNodes(project, scene) }).map((n) => ({
      ...n,
      asset: initialAnimationImage(n, project),
    }));
  const viewPosition = playing
    ? (sim?.cameraOverride ?? cameraPosition2D(scene.camera2d, worldNodes, project))
    : editorView;
  const displayNodes = [
    ...cameraNodes2D(
      [
        ...drawNodes2D(worldNodes.filter((n) => n.layer === 'world')),
        ...projectileNodes(sim ?? undefined),
      ],
      viewPosition,
    ),
    ...drawNodes2D(worldNodes.filter((n) => n.layer === 'ui')),
    ...dialogueNodes(sim?.gameplay, project),
    ...rpgNodes(sim?.gameplay, project),
    ...checkpointNodes(sim?.gameplay?.checkpointFeedback, project.width, project.height),
  ];
  const displayText = (n: GameNode) =>
    n.binding === 'score'
      ? `${n.text} ${sim?.score ?? 0} / ${sim?.total ?? resolvedNodes.filter((n) => n.collectible && n.effectiveVisible).length}`
      : n.binding === 'status'
        ? sim?.complete
          ? scene.completion
          : scene.objective
        : n.text;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !playing &&
        layout.focused &&
        !(event.target as HTMLElement)?.matches('input,textarea,select,[contenteditable="true"]')
      )
        setLayout((old) => ({ ...old, focused: false }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, layout.focused, setLayout]);
  const showExport = () => {
    setExportStats(null);
    setExportResult(null);
    setExportConflicts([]);
    setModal('export');
  };
  const editorMenus: EditorMenu[] = [
    {
      label: 'File',
      items: [
        { label: 'New project…', shortcut: '⌘N', action: () => setModal('new') },
        { label: 'Open project…', shortcut: '⌘O', action: () => void nativeOpen() },
        { label: 'Save project', shortcut: '⌘S', action: () => void save() },
        { label: 'Save project as…', shortcut: '⇧⌘S', action: () => void save(true) },
        { label: 'Export to LVGL…', shortcut: '⌘E', action: showExport, separator: true },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌘Z', action: undo, disabled: !past.current.length || playing },
        {
          label: 'Redo',
          shortcut: '⇧⌘Z',
          action: redo,
          disabled: !future.current.length || playing,
        },
        {
          label: 'Duplicate branch',
          action: duplicate,
          disabled: !node || !!inheritedNode || playing,
          separator: true,
        },
        {
          label: 'Delete branch',
          action: deleteNode,
          disabled: !node || !!inheritedNode || playing,
        },
      ],
    },
    {
      label: 'Scene',
      items: [
        { label: 'New scene', action: addScene, disabled: playing },
        { label: 'Instance scene…', action: () => setInstancePicker(true), disabled: playing },
        { label: 'Add group', action: () => addNode('group'), disabled: playing },
        {
          label: 'Organize scenes & sequences',
          action: () => {
            stop();
            setTab('flow');
          },
          separator: true,
        },
      ],
    },
    {
      label: 'Project',
      items: [
        {
          label: 'Inputs & controllers…',
          action: () => {
            stop();
            setModal('inputs');
          },
        },
        {
          label: 'Project settings…',
          action: () => {
            stop();
            setModal('settings');
          },
        },
        {
          label: 'Gameplay tools…',
          action: () => {
            stop();
            setTab('gameplay');
          },
        },
        { label: 'Import tileset…', action: () => setModal('tileset'), disabled: playing },
        {
          label: 'Build & flash STM32H7S78-DK…',
          action: () => {
            stop();
            setModal('board');
          },
        },
        {
          label: 'Target guidance…',
          action: () => {
            stop();
            setModal('target');
          },
        },
        { label: 'Import image…', action: () => assetInput.current?.click(), disabled: playing },
        {
          label: 'Import WAV audio…',
          action: () => audioInput.current?.click(),
          disabled: playing,
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Scene editor',
          shortcut: '⌘1',
          action: () => {
            stop();
            setTab('scene');
          },
        },
        {
          label: 'Script editor',
          shortcut: '⌘2',
          action: () => {
            stop();
            setTab('code');
          },
        },
        {
          label: 'Audio editor',
          shortcut: '⌘3',
          action: () => {
            stop();
            setTab('audio');
          },
        },
        {
          label: 'Focus viewport',
          checked: layout.focused,
          action: () => setLayout((old) => ({ ...old, focused: !old.focused })),
          separator: true,
        },
        {
          label: 'Project dock',
          checked: !layout.collapsed,
          action: () => setLayout((old) => ({ ...old, collapsed: !old.collapsed })),
        },
        { label: 'Reset editor layout', action: resetLayout },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Open STM32H7S78-DK Adventure',
          action: () =>
            void createProject({
              name: 'Willowlight - H7 Adventure',
              width: 800,
              height: 480,
              colorDepth: 16,
              template: 'h7-adventure',
            }),
        },
        {
          label: 'Open RPG Battle Lab',
          action: () =>
            void createProject({
              name: 'RPG Battle Lab',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'rpg',
            }),
        },
        {
          label: 'Open 2D Toolkit Lab',
          action: () =>
            void createProject({
              name: '2D Toolkit Lab',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'toolkit',
            }),
        },
        {
          label: 'Open 2D Gameplay Lab',
          action: () =>
            void createProject({
              name: '2D Gameplay Lab',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'gameplay',
            }),
        },
        {
          label: 'Open Side Scroller - Amber Trail',
          action: () =>
            void createProject({
              name: 'Amber Trail',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'side-scroller',
            }),
        },
        {
          label: 'Open Adventure - Willowlight',
          action: () =>
            void createProject({
              name: 'Willowlight',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'adventure',
            }),
        },
        {
          label: 'Open Tileset Workshop',
          action: () =>
            void createProject({
              name: 'Tileset Workshop',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'tileset',
            }),
        },
        {
          label: 'Open Physics Playground',
          action: () =>
            void createProject({
              name: 'Physics Playground',
              width: 320,
              height: 240,
              colorDepth: 16,
              template: 'physics',
            }),
        },
        { label: 'LVGL integration guide', action: () => setModal('help') },
        {
          label: 'Native LVGL playtest',
          shortcut: 'F6',
          action: () => {
            stop();
            setModal('playtest');
          },
        },
      ],
    },
  ];
  const maps = scene.nodes.filter((n) => n.tilemap);
  const mapRaw = maps.reduce((n, m) => n + m.tilemap!.cells.length, 0),
    mapPacked = maps.reduce((n, m) => n + packTilemap(m.tilemap!.cells).bytes, 0);
  return (
    <div
      className={`app studio ${compactPanel ? `compact-${compactPanel}` : ''} ${layout.focused ? 'viewport-focused' : ''} ${playing ? 'is-playing' : ''}`}
      style={
        {
          '--hierarchy-width': `${layout.hierarchy}px`,
          '--inspector-width': `${layout.inspector}px`,
          '--project-height': `${layout.collapsed ? 29 : layout.project}px`,
        } as CSSProperties
      }
      data-history={historyTick}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Gamepad2 size={21} />
          </div>
          <div>
            LVGL<span>Game Engine</span>
          </div>
          <span className="version">0.2</span>
          {experimentalPlatform && (
            <span
              className="experimental-platform-badge"
              data-testid="experimental-platform"
              title="Experimental platform build. Native LVGL C playtesting is unavailable; use Play preview or export."
            >
              {experimentalPlatform} · Experimental
            </span>
          )}
        </div>
        <EditorMenuBar menus={editorMenus} />
        <button
          className="project-title"
          onClick={() => {
            stop();
            setModal('settings');
          }}
        >
          <span>{project.name}</span>
          <ChevronDown size={13} />
          <span className="save-state">
            <i className={documentDirty ? 'unsaved' : ''} />
            {documentPath
              ? documentDirty
                ? 'Unsaved changes'
                : 'Saved'
              : documentDirty
                ? 'Unsaved project'
                : 'Example project'}
          </span>
        </button>
        <div className="header-actions">
          <button
            className="new-project-button"
            title="New project · ⌘N"
            aria-label="New project"
            onClick={() => setModal('new')}
          >
            <FilePlus2 size={16} />
            <span>New</span>
          </button>
          <button title="Open project" aria-label="Open project" onClick={() => void nativeOpen()}>
            <FolderOpen size={16} />
          </button>
          <button title="Save project file" aria-label="Save project" onClick={() => void save()}>
            <Save size={16} />
          </button>
          <span className="divider" />
          <button
            title="Project settings"
            aria-label="Project settings"
            onClick={() => {
              stop();
              setModal('settings');
            }}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="export-button"
            onClick={() => {
              setExportStats(null);
              setExportResult(null);
              setExportConflicts([]);
              setModal('export');
            }}
          >
            <Download size={14} /> Export to LVGL
          </button>
        </div>
      </header>
      <div className="toolbar">
        <div className="history-actions">
          <button
            className="compact-toggle"
            aria-label="Toggle scene tree"
            onClick={() => setCompactPanel((p) => (p === 'left' ? null : 'left'))}
          >
            <Layers size={15} />
          </button>
          <button
            className="compact-toggle"
            aria-label="Toggle inspector"
            onClick={() => setCompactPanel((p) => (p === 'right' ? null : 'right'))}
          >
            <SlidersHorizontal size={15} />
          </button>
          <button
            aria-label="Undo"
            title="Undo · ⌘Z"
            disabled={!past.current.length || playing}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo"
            title="Redo · ⇧⌘Z"
            disabled={!future.current.length || playing}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <span className="divider" />
          <div className="add-wrap">
            <button className="add-button" disabled={playing} onClick={() => setAddMenu(!addMenu)}>
              <Plus size={15} /> Add object <ChevronDown size={12} />
            </button>
            {addMenu && (
              <div className="popover add-menu">
                {(
                  ['group', 'sprite', 'tilemap', 'rect', 'area', 'label', 'button'] as NodeKind[]
                ).map((k) => (
                  <button key={k} onClick={() => addNode(k)}>
                    {iconFor(makeNode(k))}
                    <span>
                      {
                        {
                          group: 'Group',
                          instance: 'Scene instance',
                          area: 'Detection area',
                          sprite: 'Sprite',
                          tilemap: 'Tilemap',
                          rect: 'Rectangle',
                          label: 'Text label',
                          button: 'UI button',
                        }[k]
                      }
                    </span>
                    <small>{k === 'tilemap' ? 'RLE' : ''}</small>
                  </button>
                ))}
                <button
                  onClick={() => {
                    setInstancePicker(true);
                    setAddMenu(false);
                  }}
                >
                  <Link2 size={14} />
                  <span>Instance scene…</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="play-controls">
          <button
            className="native-launch"
            disabled={playing || starting}
            title="Run generated C with real LVGL · F6"
            onClick={() => {
              stop();
              setModal('playtest');
            }}
          >
            <MonitorPlay size={14} /> Native LVGL
          </button>
          {project.board && (
            <button
              disabled={playing || starting}
              onClick={() => {
                stop();
                setModal('board');
              }}
            >
              <Cpu size={14} /> Build & flash
            </button>
          )}
          {!playing ? (
            <>
              {project.flow?.entry.kind === 'sequence' && (
                <button
                  className="run"
                  aria-label="Play journey"
                  title="Play the authored game entry and its scene sequence"
                  disabled={starting}
                  onClick={() => void run(flowEntry(project))}
                >
                  <Play size={13} /> Play journey
                </button>
              )}
              <button className="run" disabled={starting} onClick={() => void run()}>
                <Play size={14} fill="currentColor" /> {starting ? 'Preparing…' : 'Play'}
              </button>
            </>
          ) : (
            <>
              <button aria-label={paused ? 'Resume' : 'Pause'} className="run" onClick={pause}>
                {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}
              </button>
              <button aria-label="Stop preview" onClick={stop}>
                <Square size={13} fill="currentColor" />
              </button>
            </>
          )}
          {!playing && (
            <>
              <button className="idle-play-control" aria-label="Pause game" disabled>
                <Pause size={13} />
              </button>
              <button className="idle-play-control" aria-label="Stop game preview" disabled>
                <Square size={12} />
              </button>
            </>
          )}
          {playing && sim?.gameplay && (
            <details className="session-monitor">
              <summary>Session state</summary>
              <div>
                <strong>State & active events</strong>
                {project.gameplay?.state.map((v) => (
                  <p key={v.id}>
                    {v.name}
                    <b data-testid={`state-${v.id}`}>{sim.gameplay!.values[v.id]}</b>
                  </p>
                ))}
                <small>
                  {sim.projectiles.slots.filter((b) => b && b.remaining > 0).length} /{' '}
                  {sim.projectiles.slots.length} projectiles · {sim.projectiles.dropped} dropped
                </small>
                <small>{sim.gameplay.runners.length} / 8 active scripts</small>
                {sim.gameplay.diagnostic && <p>{sim.gameplay.diagnostic}</p>}
                <button onClick={preview.saveCheckpoint}>Save checkpoint</button>
                <button onClick={preview.restoreCheckpoint}>Restore checkpoint</button>
                {sim.gameplay.rpg && (
                  <>
                    <strong>Party · {sim.gameplay.rpg.gold} gold</strong>
                    {sim.gameplay.rpg.party.map((m, i) => (
                      <p key={i}>
                        {project.gameplay!.rpg!.actors.find((a) => a.id === m.actor)!.name} · Lv{' '}
                        {m.level}
                        <b>
                          {m.hp} HP / {m.mp} MP
                        </b>
                      </p>
                    ))}
                  </>
                )}
                <small>State + party · checkpoint lasts until Stop. Save outside battles.</small>
              </div>
            </details>
          )}
          {playing && sim && (
            <PrefabPreview
              project={project}
              sim={sim}
              paused={paused}
              onSpawn={preview.testSpawnPrefab}
              onDespawn={preview.testDespawnPrefab}
            />
          )}
          <span className="preview-hint">
            {' '}
            {playing
              ? paused
                ? 'Preview paused'
                : 'Preview running'
              : 'Fast preview · WASD / arrows'}
          </span>
          {playing && flowCursor && (
            <div className="flow-preview-state">
              <ListOrdered size={13} />
              <span>
                {getFlow(project).sequences.find((s) => s.id === flowCursor.sequence)?.name}
              </span>
              <button disabled={paused} onClick={nextPreviewStep}>
                Next step <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
        <button
          className="display-pill"
          onClick={() => {
            stop();
            setModal('settings');
          }}
        >
          <Monitor size={14} />
          {project.width} × {project.height}
          <ChevronDown size={11} />
        </button>
      </div>
      <main
        className={`workspace workbench ${tab === 'flow' || tab === 'gameplay' ? 'flow-layout' : ''} ${layout.collapsed ? 'dock-collapsed' : ''}`}
      >
        <aside className="left-panel">
          <div className="panel-title">
            <span>
              <Layers size={13} /> Hierarchy
            </span>
            <button aria-label="Add scene" title="Add scene" disabled={playing} onClick={addScene}>
              <Plus size={15} />
            </button>
          </div>
          <div className="scene-picker">
            <select
              aria-label="Active scene"
              value={scene.id}
              onChange={(e) => {
                setSceneTrail([]);
                chooseScene(e.target.value);
              }}
            >
              {[{ id: '', name: 'Ungrouped' }, ...getFlow(project).folders].map((folder) => {
                const scenes = project.scenes.filter((s) => (s.folder ?? '') === folder.id);
                return scenes.length ? (
                  <optgroup key={folder.id} label={folder.name}>
                    {scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.prefab ? `◇ ${s.name} · Prefab` : s.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </div>
          {!!sceneTrail.length && (
            <button
              className="scene-source-back"
              onClick={() => {
                const previous = sceneTrail[sceneTrail.length - 1];
                setSceneTrail((trail) => trail.slice(0, -1));
                chooseScene(previous.scene);
                setSelected(previous.node);
              }}
            >
              ← Back to{' '}
              {project.scenes.find((s) => s.id === sceneTrail[sceneTrail.length - 1].scene)?.name ??
                'parent scene'}
            </button>
          )}
          {scene.prefab && (
            <p className="field-hint" style={{ padding: '0 12px' }}>
              Prefab source · edits update every linked copy. Use Back to return to your scene.
            </p>
          )}
          <button
            className="scene-flow-link"
            onClick={() => {
              stop();
              setTab('flow');
            }}
          >
            <ListOrdered size={13} /> Organize scenes & sequences
          </button>
          <label className="search">
            <Search size={13} />
            <input
              aria-label="Search objects"
              placeholder="Search objects…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span>⌕</span>
          </label>
          <div className="hierarchy">
            <button
              className="tree-group"
              onClick={() => {
                setSelected('');
                setPaint(false);
              }}
            >
              <ChevronDown size={12} />
              <Box size={14} />
              <span>{scene.name}</span>
              <small>{resolvedNodes.length} nodes</small>
            </button>
            <SceneTree
              key={scene.id}
              nodes={resolvedNodes}
              selected={selected}
              filter={filter}
              playing={playing}
              icon={iconFor}
              onSelect={(id) => {
                setSelected(id);
                setPaint(false);
                setCompactPanel(null);
              }}
              onVisible={(n) =>
                editGraph((p, s) => patchSceneNode(p, s, n.id, { visible: !n.visible }))
              }
              onOpenSource={openSceneSource}
              onMove={(id, target, placement) =>
                editGraph((p, s) => moveSceneNode(p, s, id, target, placement))
              }
            />
            {!scene.nodes.length && (
              <div className="empty-state">
                <Box size={24} />
                <p>A fresh scene</p>
                <small>Add a sprite, tilemap, label or button.</small>
                <button className="secondary" onClick={() => setAddMenu(true)}>
                  <Plus size={13} />
                  Add object
                </button>
              </div>
            )}
          </div>
          <div className="hierarchy-selection">
            <Box size={11} />
            <span>{node?.name ?? scene.name}</span>
            <small>{resolvedNodes.length} nodes</small>
          </div>
        </aside>
        <DockSeparator
          className="hierarchy-divider"
          name="Resize hierarchy"
          axis="vertical"
          value={layout.hierarchy}
          min={170}
          max={360}
          defaultValue={defaultLayout.hierarchy}
          onChange={(hierarchy) => setLayout((old) => ({ ...old, hierarchy }))}
        />
        <section className="center-panel">
          <div className="document-tabs">
            <div>
              {([...[], 'scene', 'flow', 'gameplay', 'code', 'audio'] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={tab === t && (t !== 'scene' || !playing) ? 'active' : ''}
                  aria-label={
                    t === 'scene'
                      ? 'Design'
                      : t === 'flow'
                        ? 'Game flow'
                        : t === 'gameplay'
                          ? 'Gameplay'
                          : t === 'code'
                            ? 'Code'
                            : 'Audio'
                  }
                  disabled={playing && t !== 'scene'}
                  onClick={() => {
                    if (t === 'scene' && playing) stop();
                    setTab(t);
                  }}
                >
                  {t === 'scene' ? (
                    <Box size={14} />
                  ) : t === 'flow' ? (
                    <ListOrdered size={14} />
                  ) : t === 'gameplay' ? (
                    <Braces size={14} />
                  ) : t === 'code' ? (
                    <Code2 size={14} />
                  ) : (
                    <Music2 size={14} />
                  )}{' '}
                  {t === 'scene'
                    ? 'Scene'
                    : t === 'flow'
                      ? 'Game flow'
                      : t === 'gameplay'
                        ? 'Gameplay'
                        : t === 'code'
                          ? 'Code'
                          : 'Audio'}
                </button>
              ))}
              <button
                className={playing ? 'active game-active' : ''}
                aria-label="Game view"
                disabled={starting}
                onClick={() => {
                  setTab('scene');
                  if (!playing) void run();
                }}
              >
                <Gamepad2 size={13} /> Game
              </button>
            </div>
            <span className="file-path">
              {tab === 'scene'
                ? `${scene.name}.${scene.prefab ? 'prefab' : 'scene'}`
                : tab === 'gameplay'
                  ? 'Gameplay resources'
                  : tab === 'flow'
                    ? 'Project organization'
                    : tab === 'code'
                      ? 'game_hooks.c'
                      : 'Audio routing'}
            </span>
          </div>
          {tab === 'gameplay' ? (
            <Suspense fallback={<p>Loading Gameplay tools…</p>}>
              <GameplayEditor project={project} onEdit={edit} sceneId={scene.id} />
            </Suspense>
          ) : tab === 'flow' ? (
            <FlowOrganizer
              project={project}
              onEdit={edit}
              onAddScene={addScene}
              onOpenScene={(id) => {
                chooseScene(id);
                setTab('scene');
              }}
              onPlaySequence={(id) => {
                const seq = getFlow(project).sequences.find((s) => s.id === id);
                const location = seq && sequenceStart(seq);
                if (location) void run(location);
              }}
              onPlayEntry={() => void run(flowEntry(project))}
            />
          ) : tab === 'scene' ? (
            <>
              {!playing && (
                <div className="scene-document-strip" role="tablist" aria-label="Scene documents">
                  {project.scenes.map((s) => (
                    <button
                      key={s.id}
                      role="tab"
                      aria-selected={scene.id === s.id}
                      onClick={() => chooseScene(s.id)}
                    >
                      <Box size={12} />
                      {s.name}
                    </button>
                  ))}
                  <button
                    className="scene-tab-add"
                    title="New scene"
                    aria-label="New scene tab"
                    onClick={addScene}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
              <div className="viewport-tools">
                <div>
                  <button
                    title="Select objects"
                    aria-label="Select tool"
                    className={!paint ? 'active' : ''}
                    onClick={() => setPaint(false)}
                  >
                    <MousePointer2 size={15} />
                  </button>
                  <button
                    title="Paint selected tilemap"
                    aria-label="Paint tiles"
                    className={paint ? 'active' : ''}
                    disabled={!node?.tilemap || !!inheritedNode || playing}
                    onClick={() => {
                      setPaint(!paint);
                      if (!paint) showTiles();
                    }}
                  >
                    <Paintbrush size={15} />
                  </button>
                  <span className="divider" />
                  <button
                    title="Toggle grid"
                    aria-label="Toggle grid"
                    className={grid ? 'active' : ''}
                    onClick={() => setGrid(!grid)}
                  >
                    <Grid2X2 size={15} />
                  </button>
                  <button
                    aria-label="Show collision shapes"
                    title="Show collision shapes"
                    aria-pressed={showColliders}
                    className={showColliders ? 'active' : ''}
                    onClick={() => setShowColliders(!showColliders)}
                  >
                    <SquareMousePointer size={15} />
                  </button>
                  <button
                    title={
                      snap
                        ? 'Position snap: 4 game pixels. Click for 1 pixel.'
                        : 'Position snap: 1 game pixel. Click for 4 pixels.'
                    }
                    className={`snap-button ${snap ? 'active' : ''}`}
                    onClick={() => setSnap(!snap)}
                  >
                    Snap <span>{snap ? '4px' : '1px'}</span>
                  </button>
                  {paint && node?.tilemap && (
                    <select
                      className="brush-select"
                      aria-label="Tile brush"
                      value={tileTool === 'erase' ? 0 : brush}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setBrush(value);
                        setTileStamp(null);
                        setTileTool(value ? 'brush' : 'erase');
                      }}
                    >
                      <option value={0}>Erase</option>
                      {node.tilemap.tiles.map((id, i) => (
                        <option key={id} value={i + 1}>
                          {imageById[id]?.name ?? id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <button
                    aria-label="Pixel perfect"
                    aria-pressed={pixelPerfect}
                    title="Pixel Perfect: whole display pixels, nearest sampling and aligned viewport"
                    className={`pixel-perfect-button ${pixelPerfect ? 'active' : ''}`}
                    disabled={playing}
                    onClick={() =>
                      edit((p) => {
                        p.pixelPerfect = !pixelPerfect;
                      })
                    }
                  >
                    <Grid2X2 size={13} /> Pixels {pixelPerfect ? 'on' : 'off'}
                  </button>
                  {!playing && (
                    <Camera2DControls
                      scene={scene}
                      display={project}
                      nodes={displaySceneNodes(project, scene)}
                      position={editorView}
                      onView={(position) => setEditorCamera({ scene: scene.id, ...position })}
                      onChange={(camera2d) =>
                        editScene((s) => {
                          s.camera2d = camera2d;
                        })
                      }
                    />
                  )}
                  <span className="viewport-context">
                    {playing ? 'Game preview' : '2D canvas'} · {project.width} × {project.height}
                  </span>
                  <button
                    aria-label={layout.focused ? 'Restore editor panels' : 'Maximize viewport'}
                    title="Toggle viewport focus"
                    onClick={() => setLayout((old) => ({ ...old, focused: !old.focused }))}
                  >
                    <Monitor size={13} />
                  </button>
                  {!playing && (
                    <>
                      <button
                        aria-label="Frame selected"
                        title="Frame selected · F"
                        disabled={!selected}
                        onClick={navigation.frameSelection}
                      >
                        <Focus size={14} />
                      </button>
                      <button
                        aria-label="Frame all"
                        title="Frame all scene objects · Home"
                        onClick={navigation.frameAll}
                      >
                        <Layers size={14} />
                      </button>
                    </>
                  )}
                  <button aria-label="Fit viewport" title="Fit game display" onClick={fit}>
                    <Maximize size={14} />
                  </button>
                  <select
                    aria-label="Zoom"
                    value={zoom}
                    onChange={(e) => navigation.zoomTo(Number(e.target.value))}
                  >
                    {!zoomOptions.includes(zoom) && (
                      <option value={zoom}>
                        {Number((zoom * 100).toFixed(zoom < 0.1 ? 1 : 0))}%
                      </option>
                    )}
                    {zoomOptions.map((z) => (
                      <option key={z} value={z}>
                        {Number((z * 100).toFixed(z < 0.1 ? 1 : 0))}%
                        {pixelPerfect
                          ? z * deviceRatio >= 1
                            ? ` · ${Math.round(z * deviceRatio)}× px`
                            : ' · overview'
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className={`viewport ${playing ? 'previewing' : 'scene-navigable'} ${navigation.panning ? 'view-panning' : navigation.spaceHeld ? 'view-pan-ready' : ''}`}
                ref={viewport}
                tabIndex={-1}
                data-testid="scene-viewport"
                data-view-pan-x={navigation.pan.x}
                data-view-pan-y={navigation.pan.y}
                onPointerEnter={navigation.onPointerEnter}
                onPointerLeave={navigation.onPointerLeave}
                onPointerDownCapture={navigation.onPointerDownCapture}
                onPointerMoveCapture={navigation.onPointerMoveCapture}
                onPointerUpCapture={navigation.onPointerUpCapture}
                onPointerCancel={navigation.onPointerCancel}
                onLostPointerCapture={navigation.onLostPointerCapture}
                onContextMenu={(e) => {
                  if (!playing) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (!playing && e.button === 1) e.preventDefault();
                }}
                onPointerDown={(e) => {
                  if (!playing && !paint && e.button === 0) setSelected('');
                }}
              >
                <div
                  className="stage-wrap"
                  ref={stageFrame}
                  style={{
                    ...pixelAlignment,
                    left: Number(pixelAlignment.left ?? 0) + navigation.pan.x,
                    top: Number(pixelAlignment.top ?? 0) + navigation.pan.y,
                    width: project.width * zoom,
                    height: project.height * zoom,
                  }}
                >
                  {!playing && (
                    <CanvasRulers width={project.width} height={project.height} zoom={zoom} />
                  )}
                  <span className="stage-label">
                    {playing ? (
                      <>
                        <i className="live-dot" /> {paused ? 'PAUSED' : 'GAME PREVIEW'}
                      </>
                    ) : (
                      <>
                        <Monitor size={11} /> {scene.name.toUpperCase()}
                      </>
                    )}
                    <span>
                      {project.width} × {project.height}
                    </span>
                  </span>
                  <div
                    ref={stage}
                    tabIndex={0}
                    role="application"
                    aria-label="Game viewport"
                    data-testid="stage"
                    data-pixel-perfect={pixelPerfect}
                    data-camera-x={viewPosition.x}
                    data-camera-y={viewPosition.y}
                    data-physical-scale={zoom * deviceRatio}
                    className={`game-stage ${!playing ? 'scene-stage' : ''} ${paint ? 'painting' : ''} ${pixelPerfect ? 'raster-stage' : ''}`}
                    style={{
                      width: project.width,
                      height: project.height,
                      zoom,
                      background: scene.background,
                    }}
                    onPointerDown={(e) => {
                      if (paint && node?.tilemap) pointerDown(e, node.id);
                      else e.stopPropagation();
                    }}
                    onPointerMove={(e) => {
                      if (playing) {
                        const bounds = e.currentTarget.getBoundingClientRect();
                        preview.movePointer(
                          e.pointerId,
                          controllerAt(
                            displayNodes,
                            ((e.clientX - bounds.left) * project.width) / bounds.width,
                            ((e.clientY - bounds.top) * project.height) / bounds.height,
                          ),
                        );
                      } else if (paint) tilePainter.pointerMove(e);
                      else pointerMove(e);
                    }}
                    onPointerLeave={tilePainter.pointerLeave}
                    onContextMenu={(e) => {
                      if (paint) e.preventDefault();
                    }}
                    onPointerUp={(e) => {
                      preview.endPointer(e.pointerId);
                      tilePainter.pointerUp();
                      drag.current = null;
                    }}
                    onPointerCancel={(e) => {
                      preview.endPointer(e.pointerId);
                      tilePainter.pointerCancel();
                      drag.current = null;
                    }}
                    onLostPointerCapture={(e) => preview.endPointer(e.pointerId)}
                  >
                    {undefined}
                    {pixelPerfect && (
                      <ScenePixels
                        animationTicks={Math.round((sim?.time ?? 0) * 60)}
                        nodes={displayNodes}
                        images={imageById}
                        width={project.width}
                        height={project.height}
                        background={scene.background}
                        transparentBackground={false}
                        text={displayText}
                        window={navigation.windowBounds}
                        sampleScale={!playing ? Math.min(1, zoom * deviceRatio) : 1}
                      />
                    )}
                    {displayNodes
                      .filter(
                        (n) =>
                          n.visible &&
                          n.kind !== 'area' &&
                          (!playing || !['group', 'instance'].includes(n.kind)),
                      )
                      .map((n) => (
                        <div
                          key={n.id}
                          data-testid={`viewport-${n.id}`}
                          data-input-action={n.inputAction}
                          className={`game-node ${n.kind} ${!playing && selected === n.id ? 'object-selected' : ''}`}
                          style={{
                            left: renderPixel(n.x),
                            top: renderPixel(n.y),
                            width: n.width,
                            height: n.height,
                            borderRadius: n.radius,
                            color:
                              n.kind === 'label'
                                ? n.color
                                : n.kind === 'button'
                                  ? buttonTextColor(n.color)
                                  : undefined,
                            background:
                              n.kind === 'rect' || n.kind === 'button' ? n.color : undefined,
                            pointerEvents: paint ? 'none' : undefined,
                          }}
                          onPointerDown={(e) => {
                            if (playing && n.inputAction) {
                              e.preventDefault();
                              stage.current?.focus();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              preview.startPointer(e.pointerId, n);
                            }
                            pointerDown(e, n.id);
                          }}
                          onClick={(e) => {
                            // Captured pointers may have slid off their original button.
                            if (playing && n.inputAction) {
                              const b = e.currentTarget.getBoundingClientRect();
                              if (
                                e.clientX < b.left ||
                                e.clientX >= b.right ||
                                e.clientY < b.top ||
                                e.clientY >= b.bottom
                              )
                                return;
                            }
                            preview.click(n);
                          }}
                        >
                          {!pixelPerfect && n.kind === 'sprite' && sprites[n.asset] && (
                            <img draggable={false} src={sprites[n.asset]} alt="" />
                          )}
                          {!pixelPerfect && n.kind === 'tilemap' && n.tilemap && (
                            <TilemapCanvas
                              animationTicks={Math.round((sim?.time ?? 0) * 60)}
                              map={n.tilemap}
                              sprites={sprites}
                              x={n.x}
                              y={n.y}
                              displayWidth={navigation.windowBounds?.width ?? project.width}
                              displayHeight={navigation.windowBounds?.height ?? project.height}
                              originX={navigation.windowBounds?.x ?? 0}
                              originY={navigation.windowBounds?.y ?? 0}
                              sampleScale={!playing ? Math.min(1, zoom * deviceRatio) : 1}
                            />
                          )}
                          {(n.kind === 'label' || n.kind === 'button') && displayText(n)}
                          {!playing && selected === n.id && !paint && (
                            <>
                              <span className="object-tag">{n.name}</span>
                              {!n.tilemap &&
                                !['group', 'instance'].includes(n.kind) &&
                                !resolvedNodes.find((r) => r.id === n.id)?.instanceRoot &&
                                ['tl', 'tr', 'bl', 'br'].map((p) => (
                                  <i
                                    key={p}
                                    className={`handle ${p}`}
                                    onPointerDown={(e) => beginResize(e, n, p)}
                                  />
                                ))}
                            </>
                          )}
                        </div>
                      ))}
                    {paint && node?.tilemap && !playing && (
                      <TilePaintOverlay
                        x={renderPixel((tileWorld?.worldX ?? 0) - editorView.x)}
                        y={renderPixel((tileWorld?.worldY ?? 0) - editorView.y)}
                        size={node.tilemap.tileSize}
                        hover={tilePainter.hover}
                        rectangle={tilePainter.rectangle}
                        stamp={stamp}
                        tool={tileTool}
                        sprites={sprites}
                      />
                    )}
                    <ColliderOverlay
                      nodes={displayNodes}
                      selected={selected}
                      editing={!playing && !inheritedNode && colliderEditing === selected}
                      show={showColliders}
                      zoom={zoom}
                      onChange={(id, physics, record) =>
                        editGraph((p, s) => patchSceneNode(p, s, id, { physics }), record)
                      }
                    />
                    {grid && !playing && (
                      <div
                        className="grid-overlay"
                        style={{
                          backgroundSize: `${paint ? (node?.tilemap?.tileSize ?? 32) : 16}px ${paint ? (node?.tilemap?.tileSize ?? 32) : 16}px`,
                          backgroundPosition:
                            paint && node
                              ? `${renderPixel((resolvedNodes.find((n) => n.id === node.id)?.worldX ?? 0) - editorView.x)}px ${renderPixel((resolvedNodes.find((n) => n.id === node.id)?.worldY ?? 0) - editorView.y)}px`
                              : undefined,
                        }}
                      />
                    )}
                    {paused && (
                      <div className="pause-overlay">
                        <Pause size={24} />
                        <span>Paused</span>
                        <button onClick={pause}>Resume</button>
                      </div>
                    )}
                  </div>
                  {playing && (
                    <div className="stage-bottom-label">
                      <>
                        <Gamepad2 size={12} />{' '}
                        {'WASD / arrows · E / Enter interact · P party · Space jump · Esc pause'}
                      </>
                      <span>
                        {pixelPerfect
                          ? `${Math.round(zoom * deviceRatio)}× display pixels · pixel perfect`
                          : '1 unit = 1 game pixel'}
                      </span>
                    </div>
                  )}
                </div>
                {!playing && (
                  <div className="viewport-navigation-help">
                    RMB / MMB drag: pan · Space + drag: pan · Wheel: zoom · F: selected · Home: all
                    {pixelPerfect && zoom * deviceRatio < 1 && (
                      <span> · Overview — zoom in for exact pixels</span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : tab === 'code' ? (
            <div className="coding-layout">
              <div className="code-workspace">
                <div className="code-file-tabs">
                  {(
                    [
                      ['user', 'game_hooks.c'],
                      ['api', 'ui.h'],
                      ['ids', 'ui_ids.h'],
                    ] as const
                  ).map(([id, name]) => (
                    <button
                      key={id}
                      className={codeFile === id ? 'active' : ''}
                      onClick={() => setCodeFile(id)}
                    >
                      <Code2 size={13} />
                      {name}
                      {id !== 'user' && <small>read only</small>}
                    </button>
                  ))}
                </div>
                <div className="code-notice">
                  <Braces size={16} />
                  <span>
                    {codeFile === 'user'
                      ? 'Your game logic'
                      : codeFile === 'api'
                        ? 'Public firmware API'
                        : 'Stable project IDs'}
                    <small>
                      {codeFile === 'user'
                        ? 'C syntax, bracket matching and ui_* autocomplete. Test with Native LVGL or your firmware.'
                        : 'Generated from this project. Changes to display names preserve stable IDs.'}
                    </small>
                  </span>
                  <span className="language-badge">C99</span>
                </div>
                <Suspense
                  fallback={
                    <div className="loading-editor" role="status">
                      Opening C editor…
                    </div>
                  }
                >
                  <CodeEditor
                    revealLine={codeFile === 'user' ? codeLine : undefined}
                    value={
                      codeFile === 'user'
                        ? project.code
                        : codeFile === 'api'
                          ? uiHeader
                          : uiIds(project) + '\n' + inputFiles(project)['ui/ui_inputs.h']
                    }
                    readOnly={codeFile !== 'user'}
                    label={
                      codeFile === 'user'
                        ? 'Native C code'
                        : codeFile === 'api'
                          ? 'Public API header'
                          : 'Project ID header'
                    }
                    ids={uiIds(project) + '\n' + inputFiles(project)['ui/ui_inputs.h']}
                    onChange={(value) =>
                      edit((p) => {
                        p.code = value;
                      })
                    }
                  />
                </Suspense>
                <div className="code-api">
                  <span>Hooks</span>
                  <code>game_on_event()</code>
                  <code>game_on_update()</code>
                  <button onClick={() => setModal('help')}>
                    Integration guide <ChevronRight size={12} />
                  </button>
                </div>
              </div>
              <ApiReference
                project={project}
                scene={scene}
                onShowHeader={() => setCodeFile('api')}
                onNotify={notify}
              />
            </div>
          ) : (
            <div className="audio-workspace">
              <div className="audio-heading">
                <div className="eyebrow">SOUND, WITHOUT THE HARDWARE COUPLING</div>
                <h1>Give your game a voice.</h1>
                <p>Bind cues in the inspector. Connect your audio driver once.</p>
              </div>
              <div className="audio-flow">
                <div>
                  <Gamepad2 size={22} />
                  <strong>Game event</strong>
                  <span>Collect · click · C API</span>
                </div>
                <ChevronRight />
                <div>
                  <Volume2 size={22} />
                  <strong>Audio cue</strong>
                  <span>Gain · bus · priority</span>
                </div>
                <ChevronRight />
                <div>
                  <Cpu size={22} />
                  <strong>Your backend</strong>
                  <span>I²S · DAC · PWM</span>
                </div>
              </div>
              <div className="mixer">
                {(['sfx', 'music', 'ui'] as Bus[]).map((bus) => (
                  <div key={bus}>
                    <div>
                      <Music2 size={15} />
                      <strong>{bus.toUpperCase()}</strong>
                      <span>{Math.round(gains[bus] * 100)}%</span>
                    </div>
                    <input
                      aria-label={`${bus} preview gain`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={gains[bus]}
                      onChange={(e) => {
                        const next = { ...gains, [bus]: Number(e.target.value) };
                        setGains(next);
                        preview.setAudioGains(next);
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="preview-note">
                Mixer controls audition volume. Exported cue gains are set below; firmware can
                adjust buses with <code>lge_audio_set_bus</code>.
              </p>
              <div className="cue-list">
                {project.audio.map((cue, i) => (
                  <div className="cue-editor" key={cue.id}>
                    <button
                      aria-label={`Play ${cue.name}`}
                      className="cue-play"
                      onClick={() => audition(cue)}
                    >
                      <Play size={15} />
                    </button>
                    <div>
                      <input
                        aria-label="Cue name"
                        value={cue.name}
                        onChange={(e) =>
                          edit((p) => {
                            p.audio[i].name = e.target.value;
                          })
                        }
                      />
                      <small>
                        {cue.sampleRate / 1000} kHz · PCM16 ·{' '}
                        {cue.channels === 1 ? 'mono' : 'stereo'} · {cue.duration.toFixed(2)}s
                      </small>
                    </div>
                    <select
                      aria-label="Cue bus"
                      value={cue.bus}
                      onChange={(e) =>
                        edit((p) => {
                          p.audio[i].bus = e.target.value as Bus;
                        })
                      }
                    >
                      {['sfx', 'music', 'ui'].map((b) => (
                        <option key={b} value={b}>
                          {b.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <label>
                      Gain
                      <input
                        aria-label="Cue gain"
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={cue.gain}
                        onChange={(e) => {
                          if (Number.isFinite(e.target.valueAsNumber))
                            edit((p) => {
                              p.audio[i].gain = Math.min(1, Math.max(0, e.target.valueAsNumber));
                            });
                        }}
                      />
                    </label>
                    <label>
                      Priority
                      <input
                        aria-label="Cue priority"
                        type="number"
                        min={0}
                        max={255}
                        value={cue.priority}
                        onChange={(e) => {
                          if (Number.isFinite(e.target.valueAsNumber))
                            edit((p) => {
                              p.audio[i].priority = Math.round(
                                Math.min(255, Math.max(0, e.target.valueAsNumber)),
                              );
                            });
                        }}
                      />
                    </label>
                    <label className="loop-check">
                      <input
                        type="checkbox"
                        checked={cue.loop}
                        onChange={(e) =>
                          edit((p) => {
                            p.audio[i].loop = e.target.checked;
                          })
                        }
                      />
                      Loop
                    </label>
                    <button
                      title="Delete cue and clear bindings"
                      aria-label={`Delete ${cue.name}`}
                      onClick={() =>
                        edit((p) => {
                          p.audio = p.audio.filter((a) => a.id !== cue.id);
                          for (const s of p.scenes) {
                            if (s.music === cue.id) s.music = '';
                            for (const n of s.nodes) if (n.cue === cue.id) n.cue = '';
                          }
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="secondary" onClick={() => audioInput.current?.click()}>
                <Plus size={14} /> Import PCM WAV
              </button>
              <p className="audio-contract">
                8 voices · priority stealing · pause/resume · stable completion tokens
                <br />
                No audio hardware required to edit or export.
              </p>
            </div>
          )}
        </section>
        <DockSeparator
          className="inspector-divider"
          name="Resize inspector"
          axis="vertical"
          reverse
          value={layout.inspector}
          min={240}
          max={420}
          defaultValue={defaultLayout.inspector}
          onChange={(inspector) => setLayout((old) => ({ ...old, inspector }))}
        />
        <aside className="right-panel">
          <div className="panel-title">
            <span>
              <SlidersHorizontal size={13} /> Inspector
            </span>
            <span className="tiny-label">{node ? 'OBJECT' : 'SCENE'}</span>
          </div>
          <div className="inspector-scroll">
            <fieldset disabled={playing}>
              {inheritedNode ? (
                <InheritedNodeInspector
                  project={project}
                  node={inheritedNode}
                  overrides={
                    scene.nodes.find((n) => n.id === inheritedNode.instanceRoot)?.overrides?.[
                      inheritedNode.id.slice(inheritedNode.instanceRoot!.length + 1)
                    ]
                  }
                  onPatch={editNode}
                  onRevert={() =>
                    editGraph((_p, s) => {
                      const owner = s.nodes.find((n) => n.id === inheritedNode.instanceRoot)!;
                      delete owner.overrides?.[inheritedNode.id.slice(owner.id.length + 1)];
                    })
                  }
                  onOpenSource={() => openSceneSource(inheritedNode.sourceScene)}
                />
              ) : node ? (
                <>
                  <div className="inspector-object">
                    <span className="object-icon">{iconFor(node, 20)}</span>
                    <div>
                      <input
                        aria-label="Object name"
                        value={node.name}
                        maxLength={128}
                        onChange={(e) => editNode({ name: e.target.value })}
                      />
                      <small>
                        {node.kind === 'tilemap'
                          ? 'Tilemap · packed'
                          : node.player
                            ? 'Sprite · Player controller'
                            : node.kind[0].toUpperCase() + node.kind.slice(1)}
                      </small>
                    </div>
                    <button
                      title="Duplicate object"
                      aria-label="Duplicate object"
                      onClick={duplicate}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <Section title="Scene tree">
                    <label className="block-label">
                      Parent
                      <select
                        aria-label="Node parent"
                        value={node.parent ?? ''}
                        onChange={(e) =>
                          editGraph((p, s) =>
                            reparentNode(p, s, node.id, e.target.value || undefined),
                          )
                        }
                      >
                        <option value="">Scene root</option>
                        {scene.nodes
                          .filter((n) => !branchIds(scene, node.id).has(n.id))
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="field-hint">
                      Positions are local to the parent. Reparenting keeps the world position.
                      Children inherit visibility.
                    </p>
                    <button
                      className="source-open"
                      disabled={!!node.spawnable}
                      onClick={() => {
                        if (
                          editGraph((p, s) => {
                            createPrefab(p, s, node.id);
                          })
                        )
                          notify(
                            'Prefab created. Find it in Project → Prefabs; source edits update all linked copies.',
                          );
                      }}
                    >
                      Create prefab from branch
                    </button>
                    <button
                      className="source-open"
                      onClick={() => {
                        if (
                          editGraph((p, s) => {
                            extractScene(p, s, node.id);
                          })
                        )
                          notify(
                            'Branch saved as a linked scene. Open its source to edit the shared structure.',
                          );
                      }}
                    >
                      Save branch as scene
                    </button>
                  </Section>
                  {node.kind === 'instance' && (
                    <Section
                      title={nodeSource?.prefab ? 'Prefab instance' : 'Linked scene'}
                      extra={<Link2 size={12} />}
                    >
                      <label className="block-label">
                        {nodeSource?.prefab ? 'Prefab source' : 'Source scene'}
                        <select
                          aria-label="Instance source"
                          value={node.scene}
                          onChange={(e) => editNode({ scene: e.target.value, overrides: {} })}
                        >
                          {instanceSources(project, scene)
                            .filter((s) => !node.spawnable || s.prefab)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="instance-note">
                        Source edits update every instance. Select a child in the tree to override a
                        value for this copy.
                      </p>
                      {nodeSource?.prefab && (
                        <div className="prefab-help">
                          <Toggle
                            label="Reserve for runtime spawning"
                            value={!!node.spawnable}
                            onChange={(spawnable) => editNode({ spawnable })}
                          />
                          <p className="field-hint">
                            {node.spawnable
                              ? 'Starts inactive in Play. Spawn acquires a reserved copy; despawn resets it for reuse. Each copy counts toward the 128-node scene budget.'
                              : 'Placed copy: appears when the scene starts. Source edits are shared; overrides affect this copy.'}
                          </p>
                          {node.spawnable && <code>ui_prefab_spawn("{node.scene}", x, y)</code>}
                        </div>
                      )}
                      <button className="source-open" onClick={() => openSceneSource(node.scene!)}>
                        {nodeSource?.prefab ? 'Edit prefab source' : 'Open source scene'}{' '}
                        <Link2 size={13} />
                      </button>
                      <button
                        className="source-open"
                        disabled={!Object.keys(node.overrides ?? {}).length}
                        onClick={() => editNode({ overrides: {} })}
                      >
                        Revert all overrides
                      </button>
                      <button
                        className="source-open"
                        disabled={!!node.spawnable}
                        onClick={() => editGraph((p, s) => unpackInstance(p, s, node.id))}
                      >
                        Unpack to editable nodes
                      </button>
                    </Section>
                  )}
                  <Section title="Transform">
                    <div className="field-pair">
                      <NumberField label="X" value={node.x} onChange={(x) => editNode({ x })} />
                      <NumberField label="Y" value={node.y} onChange={(y) => editNode({ y })} />
                    </div>
                    <div className="field-pair">
                      <NumberField
                        label="Width"
                        value={node.width}
                        disabled={!!node.tilemap}
                        min={1}
                        max={2048}
                        onChange={(width) =>
                          !node.tilemap && editNode({ width: Math.round(width) })
                        }
                      />
                      <NumberField
                        label="Height"
                        value={node.height}
                        disabled={!!node.tilemap}
                        min={1}
                        max={2048}
                        onChange={(height) =>
                          !node.tilemap && editNode({ height: Math.round(height) })
                        }
                      />
                    </div>
                    <label className="form-row">
                      Layer
                      <select
                        aria-label="Object layer"
                        value={node.layer}
                        onChange={(e) => editNode({ layer: e.target.value as 'world' | 'ui' })}
                      >
                        <option value="world">World</option>
                        <option value="ui">User interface</option>
                      </select>
                    </label>
                    <NumberField
                      label="Z index"
                      value={node.zIndex ?? 0}
                      min={-128}
                      max={127}
                      onChange={(zIndex) => editNode({ zIndex: Math.round(zIndex) })}
                    />
                    <label className="form-row">
                      Sort by feet Y
                      <input
                        type="checkbox"
                        aria-label="Sort by feet Y"
                        checked={!!node.sortY}
                        onChange={(e) => editNode({ sortY: e.target.checked })}
                      />
                    </label>
                    <p className="field-hint">
                      Lower Z draws first. Put ground at -10, actors at 0 with feet sorting, and
                      canopies at 10. UI always draws above the world.
                    </p>
                    <div className="order-controls">
                      <span>Draw order</span>
                      <button
                        title="Move backward"
                        aria-label="Move backward"
                        onClick={() => reorder(-1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        title="Move forward"
                        aria-label="Move forward"
                        onClick={() => reorder(1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                    </div>
                  </Section>
                  <NodeEmitter
                    node={node}
                    project={project}
                    onChange={editNode}
                    onOpen={() => setTab('gameplay')}
                  />
                  <NodeGameplay
                    node={node}
                    project={project}
                    onChange={editNode}
                    onOpen={() => setTab('gameplay')}
                  />
                  {!['group', 'instance'].includes(node.kind) && (
                    <PhysicsInspector
                      node={node}
                      onChange={editNode}
                      editing={colliderEditing === selected}
                      onEdit={() => {
                        setColliderEditing(colliderEditing === selected ? '' : selected);
                        setShowColliders(true);
                        setPaint(false);
                      }}
                      onAddArea={(preset) => {
                        const physics = {
                          ...makePhysics('area'),
                          layer: preset === 'Hitbox' ? 8 : preset === 'Hurtbox' ? 16 : 64,
                          mask: preset === 'Hitbox' ? 16 : preset === 'Hurtbox' ? 0 : 2,
                        };
                        const area = makeNode('area', {
                          name: preset,
                          parent: node.id,
                          x: 0,
                          y: 0,
                          width: node.width,
                          height: node.height,
                          physics,
                        });
                        if (editGraph((_p, s) => s.nodes.push(area))) {
                          setSelected(area.id);
                          setShowColliders(true);
                          setColliderEditing(area.id);
                        }
                      }}
                    />
                  )}
                  {node.kind === 'area' && (
                    <Section title="Area event" extra={<Volume2 size={12} />}>
                      <label className="block-label">
                        On area entered
                        <select
                          aria-label="Audio cue"
                          value={node.cue}
                          onChange={(e) => editNode({ cue: e.target.value })}
                        >
                          <option value="">None</option>
                          {project.audio.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="field-hint">
                        Play once for each entering object. C hooks receive AREA_ENTER / AREA_EXIT
                        and ui_event_other().
                      </p>
                    </Section>
                  )}
                  {['group', 'instance', 'area'].includes(node.kind) ? (
                    <Section title="Visibility">
                      <Toggle
                        label="Visible"
                        value={node.visible}
                        onChange={(visible) => editNode({ visible })}
                      />
                      <p className="field-hint">
                        This is a logical transform node. It does not allocate an LVGL object.
                      </p>
                    </Section>
                  ) : (
                    <>
                      <Section
                        title={
                          node.kind === 'sprite'
                            ? 'Sprite'
                            : node.kind === 'tilemap'
                              ? 'Tile palette'
                              : 'Appearance'
                        }
                      >
                        {node.kind === 'sprite' ? (
                          <>
                            <div className="sprite-assignment">
                              <div>
                                {sprites[node.asset] && (
                                  <img src={sprites[node.asset]} alt="Selected sprite" />
                                )}
                              </div>
                              <select
                                aria-label="Sprite asset"
                                value={node.asset}
                                onChange={(e) => editNode({ asset: e.target.value })}
                              >
                                {!project.sprites.some((a) => a.id === node.asset) &&
                                  imageById[node.asset] && (
                                    <option value={node.asset}>Layered animation frame</option>
                                  )}
                                {project.sprites.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <SpritePixelScale
                              node={node}
                              asset={imageById[node.asset]}
                              pixelPerfect={pixelPerfect}
                              onChange={editNode}
                            />
                          </>
                        ) : node.tilemap ? (
                          <>
                            {node.tilemap.tileset ? (
                              <button
                                className="source-open"
                                onClick={() => {
                                  setActiveTileset(node.tilemap!.tileset!);
                                  showTiles();
                                }}
                              >
                                Open tileset palette · {node.tilemap.tiles.length} tiles
                              </button>
                            ) : (
                              <div className="tile-palette">
                                <button
                                  title="Eraser"
                                  className={brush === 0 ? 'chosen' : ''}
                                  onClick={() => {
                                    setBrush(0);
                                    setTileStamp(null);
                                    setTileTool('erase');
                                    setPaint(true);
                                  }}
                                >
                                  <X size={20} />
                                </button>
                                {node.tilemap.tiles.map((id, i) => (
                                  <button
                                    key={id}
                                    title={imageById[id]?.name}
                                    className={brush === i + 1 ? 'chosen' : ''}
                                    onClick={() => {
                                      setBrush(i + 1);
                                      setTileStamp(null);
                                      setTileTool('brush');
                                      setPaint(true);
                                      setGrid(true);
                                    }}
                                  >
                                    <img src={sprites[id]} alt={id} />
                                    <span>{i + 1}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              className={`paint-toggle ${paint ? 'active' : ''}`}
                              onClick={() => {
                                setPaint(!paint);
                                if (!paint) showTiles();
                                setGrid(true);
                              }}
                            >
                              <Paintbrush size={13} />
                              {paint ? 'Painting tiles' : 'Paint this tilemap'}
                            </button>
                            <label className="form-row">
                              Add tile
                              <select
                                aria-label="Add tile asset"
                                value=""
                                onChange={(e) => {
                                  if (
                                    e.target.value &&
                                    node.tilemap!.tiles.length < 255 &&
                                    !node.tilemap!.tiles.includes(e.target.value)
                                  )
                                    editNode({
                                      tilemap: {
                                        ...node.tilemap!,
                                        tiles: [...node.tilemap!.tiles, e.target.value],
                                      },
                                    });
                                }}
                              >
                                <option value="">Select an asset…</option>
                                {project.sprites
                                  .filter((a) => !node.tilemap!.tiles.includes(a.id))
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <p className="field-hint">
                              {node.tilemap.columns} × {node.tilemap.rows} cells ·{' '}
                              {node.tilemap.tileSize}px tiles
                              <br />
                              Export: {packTilemap(node.tilemap.cells).bytes} B ·{' '}
                              {packTilemap(node.tilemap.cells).codec.toUpperCase()} /{' '}
                              {node.tilemap.cells.length} B raw
                            </p>
                          </>
                        ) : (
                          <>
                            <label className="form-row">
                              Color
                              <span className="color-field">
                                <input
                                  aria-label="Object color"
                                  type="color"
                                  value={node.color}
                                  onChange={(e) => editNode({ color: e.target.value })}
                                />
                                <span>{node.color.toUpperCase()}</span>
                              </span>
                            </label>
                            {node.kind !== 'label' && (
                              <NumberField
                                label="Radius"
                                min={0}
                                max={128}
                                value={node.radius}
                                onChange={(radius) => editNode({ radius: Math.round(radius) })}
                              />
                            )}
                          </>
                        )}
                        {(node.kind === 'label' || node.kind === 'button') && (
                          <>
                            <label className="block-label">
                              Text
                              <input
                                aria-label="Object text"
                                value={node.text}
                                onChange={(e) => editNode({ text: e.target.value })}
                              />
                            </label>
                            <label className="form-row">
                              Binding
                              <select
                                aria-label="Text binding"
                                value={node.binding}
                                onChange={(e) =>
                                  editNode({ binding: e.target.value as GameNode['binding'] })
                                }
                              >
                                <option value="none">Static text</option>
                                <option value="score">Collection counter</option>
                                <option value="status">Scene objective</option>
                              </select>
                            </label>
                          </>
                        )}
                        <Toggle
                          label="Visible"
                          value={node.visible}
                          onChange={(visible) => editNode({ visible })}
                        />
                      </Section>
                      {node.tilemap ? (
                        <Section title="Tile collision">
                          <div className="field-pair">
                            <NumberField
                              label="Columns"
                              value={node.tilemap.columns}
                              min={1}
                              max={Math.min(128, Math.floor(2048 / node.tilemap.tileSize))}
                              onChange={(v) =>
                                resizeMap(Math.round(v), node.tilemap!.rows, node.tilemap!.tileSize)
                              }
                            />
                            <NumberField
                              label="Rows"
                              value={node.tilemap.rows}
                              min={1}
                              max={Math.min(128, Math.floor(2048 / node.tilemap.tileSize))}
                              onChange={(v) =>
                                resizeMap(
                                  node.tilemap!.columns,
                                  Math.round(v),
                                  node.tilemap!.tileSize,
                                )
                              }
                            />
                          </div>
                          <p className="field-hint">
                            Choose solid tile types. The same map drives collision and rendering.
                          </p>
                          {node.tilemap.tileset && (
                            <button className="source-open" onClick={showTiles}>
                              Select tiles in the Tilemap dock to edit shared collision
                            </button>
                          )}
                          {node.tilemap.tiles.map((id, i) =>
                            importedTileIds.has(id) ? null : (
                              <Toggle
                                key={id}
                                label={imageById[id]?.name ?? id}
                                value={node.tilemap!.solidTiles.includes(i + 1)}
                                onChange={(checked) =>
                                  editNode({
                                    tilemap: {
                                      ...node.tilemap!,
                                      solidTiles: checked
                                        ? [...node.tilemap!.solidTiles, i + 1]
                                        : node.tilemap!.solidTiles.filter((v) => v !== i + 1),
                                    },
                                  })
                                }
                              />
                            ),
                          )}
                        </Section>
                      ) : (
                        <Section title="Behaviors">
                          <Toggle
                            label="Collectible"
                            description="Hide on touch, increment score"
                            value={node.collectible}
                            onChange={(collectible) =>
                              editNode({
                                collectible,
                                ...(collectible
                                  ? {
                                      player: false,
                                      solid: false,
                                      physics: {
                                        ...physicsFor(node),
                                        body: 'area',
                                        layer: 32,
                                        mask: 2,
                                      },
                                    }
                                  : {}),
                              })
                            }
                          />
                        </Section>
                      )}
                      <Section title="Audio event" extra={<Volume2 size={12} />}>
                        <label className="block-label">
                          {node.collectible
                            ? 'On collected'
                            : physicsFor(node).body === 'area'
                              ? 'On area entered'
                              : node.kind === 'button'
                                ? 'On clicked'
                                : 'Cue reference · for C hooks'}
                          <select
                            aria-label="Audio cue"
                            value={node.cue}
                            onChange={(e) => editNode({ cue: e.target.value })}
                          >
                            <option value="">None</option>
                            {project.audio.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="field-hint">
                          {node.collectible ||
                          node.kind === 'button' ||
                          physicsFor(node).body === 'area'
                            ? 'Played automatically when the event is accepted.'
                            : 'Automatic playback is available on collectibles and buttons. Use lge_audio_play in C for other events.'}
                        </p>
                        {node.cue && (
                          <button
                            className="audition-button"
                            onClick={() => audition(project.audio.find((a) => a.id === node.cue)!)}
                          >
                            <Play size={12} /> Audition cue
                          </button>
                        )}
                      </Section>
                    </>
                  )}
                  <Section title="Identity">
                    <code className="stable-id">{node.id}</code>
                    <p className="field-hint">
                      Stable ID for <code>lge_find()</code> in your C hooks.
                    </p>
                  </Section>
                  <button className="delete-object" onClick={deleteNode}>
                    <Trash2 size={13} /> Delete object
                  </button>
                </>
              ) : (
                <>
                  <div className="scene-inspector-intro">
                    <Monitor size={27} />
                    <h2>{scene.name}</h2>
                    <p>
                      {scene.nodes.length} objects · {project.width} × {project.height}
                    </p>
                  </div>
                  <Section title="Scene settings">
                    <Toggle
                      label="Touchscreen controls"
                      value={touchEnabled}
                      onChange={(enabled) => editGraph((p, s) => setTouchControls(p, s, enabled))}
                      description="Hold or slide between arrows to move. Adds editable UI buttons; Action jumps or attacks, Talk interacts. Keyboard input stays available."
                    />
                    <label className="block-label">
                      Name
                      <input
                        aria-label="Scene name"
                        value={scene.name}
                        onChange={(e) =>
                          editScene((s) => {
                            s.name = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="form-row">
                      Background
                      <input
                        aria-label="Scene background"
                        type="color"
                        value={scene.background}
                        onChange={(e) =>
                          editScene((s) => {
                            s.background = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="block-label">
                      Objective
                      <input
                        aria-label="Scene objective"
                        value={scene.objective}
                        onChange={(e) =>
                          editScene((s) => {
                            s.objective = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="block-label">
                      Completion text
                      <input
                        aria-label="Completion text"
                        value={scene.completion}
                        onChange={(e) =>
                          editScene((s) => {
                            s.completion = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="block-label">
                      Scene audio
                      <select
                        aria-label="Scene audio"
                        value={scene.music}
                        onChange={(e) =>
                          editScene((s) => {
                            s.music = e.target.value;
                          })
                        }
                      >
                        <option value="">None</option>
                        {project.audio.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.loop ? ' · loop' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </Section>
                  <button
                    className="settings-link"
                    onClick={() => {
                      stop();
                      setModal('settings');
                    }}
                  >
                    <Settings2 size={14} /> Display & project settings
                  </button>
                </>
              )}
            </fieldset>
          </div>
        </aside>
        <DockSeparator
          className="project-divider"
          name="Resize project dock"
          axis="horizontal"
          reverse
          value={layout.project}
          min={120}
          max={400}
          defaultValue={defaultLayout.project}
          onChange={(project) => setLayout((old) => ({ ...old, project }))}
        />
        <ProjectDock
          project={project}
          tilesRequest={tilesRequest}
          tilesPanel={
            <Suspense fallback={<p>Loading tile tools…</p>}>
              <TilemapPanel
                project={project}
                sprites={sprites}
                maps={scene.nodes.filter((n) => !!n.tilemap)}
                node={!inheritedNode && node?.tilemap ? node : undefined}
                tilesetId={activeTileset}
                tool={tileTool}
                stamp={stamp}
                playing={playing}
                onTileset={setActiveTileset}
                onMap={(id) => {
                  setSelected(id);
                  setPaint(true);
                  setTab('scene');
                }}
                onTool={chooseTileTool}
                onStamp={chooseStamp}
                onCreate={createTileLayer}
                onUse={useTileset}
                onImport={() => setModal('tileset')}
                onAnimation={(id, animation) => edit((p) => setTileAnimation(p, id, animation))}
                onSlope={(ids, shape) =>
                  edit((p) => {
                    for (const id of ids) setTileSlope(p, id, shape);
                  })
                }
                onSolids={editTileSolids}
              />
            </Suspense>
          }
          onOpenTileset={(id) => {
            setActiveTileset(id);
            showTiles();
          }}
          sprites={sprites}
          playing={playing}
          collapsed={layout.collapsed}
          onCollapse={() => setLayout((old) => ({ ...old, collapsed: !old.collapsed }))}
          onOpenScene={(id) => {
            if (project.scenes.find((s) => s.id === id)?.prefab) openSceneSource(id);
            else chooseScene(id);
            setTab('scene');
          }}
          onNewScene={addScene}
          onInstanceScene={(id) => {
            const source = project.scenes.find((s) => s.id === id);
            if (source) {
              placeInstance(source);
              setTab('scene');
            }
          }}
          onCreatePool={(id, capacity) => {
            let group = '';
            if (
              editGraph((p, s) => {
                group = createPrefabPool(p, s, id, capacity);
              })
            ) {
              setSelected(group);
              setTab('scene');
              notify(
                `Reserved ${capacity} copies. Spawn from C with ui_prefab_spawn; test code in Native LVGL Play.`,
              );
            }
          }}
          onAddSprite={(asset) => addNode('sprite', asset)}
          onAudition={audition}
          onOpenCode={(file) => {
            stop();
            setCodeFile(file);
            setTab('code');
          }}
          onImport={(kind) =>
            kind === 'tilesets'
              ? setModal('tileset')
              : (kind === 'sprites' ? assetInput : audioInput).current?.click()
          }
          logs={logs}
          issues={issues}
          onClearLogs={() => setLogs([])}
        />
      </main>
      <footer className="statusbar">
        <div>
          <span className="status-ready">
            <Circle size={7} fill="currentColor" /> {errors.length ? 'Needs attention' : 'Ready'}
          </span>
          <span>{resolvedNodes.length} / 128 nodes</span>
          <button
            className={`target-status ${targetReport.alerts.some((a) => a.level !== 'info') ? 'has-advice' : ''}`}
            aria-label="Target guidance"
            title="Open target resource and capability guidance"
            onClick={() => {
              stop();
              setModal('target');
            }}
          >
            <Cpu size={12} />{' '}
            {targetReport.configured ? targetReport.family.family : 'Choose target'}
            {targetPending
              ? ' · …'
              : targetReport.alerts.filter((a) => a.level !== 'info').length
                ? ` · ${targetReport.alerts.filter((a) => a.level !== 'info').length}`
                : ''}
          </button>
          <span>
            Tilemaps {mapPacked} B packed <small>/ {mapRaw} B</small>
          </span>
        </div>
        <div>
          <button
            aria-label={muted ? 'Unmute preview' : 'Mute preview'}
            onClick={() => {
              preview.mute(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <span>{desktop ? 'Desktop · ' : ''}LVGL 9 · C99</span>
          <span className="recovery-status">{saved ? 'Recovery saved' : 'Saving recovery…'}</span>
          <button title="Help" aria-label="Help" onClick={() => setModal('help')}>
            <CircleHelp size={13} />
          </button>
        </div>
      </footer>
      {instancePicker && (
        <SceneInstancePicker
          project={project}
          scene={scene}
          onChoose={placeInstance}
          onClose={() => setInstancePicker(false)}
        />
      )}
      <input
        ref={openInput}
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={assetInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void importSprite(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={audioInput}
        hidden
        type="file"
        accept=".wav,audio/wav"
        onChange={(e) => {
          void importAudio(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={13} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!exporting) setModal(null);
          }}
        >
          <div
            className={`modal modal-${modal}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'inputs'
                ? 'Inputs & controllers'
                : modal === 'board'
                  ? 'Build and flash board'
                  : modal === 'tileset'
                    ? 'Import tileset'
                    : modal === 'target'
                      ? 'Target guidance'
                      : modal === 'playtest'
                        ? 'Native LVGL playtest'
                        : modal === 'settings'
                          ? 'Project settings'
                          : modal === 'export'
                            ? 'Export to LVGL'
                            : 'Quick start'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              disabled={exporting}
              onClick={() => setModal(null)}
            >
              <X size={17} />
            </button>
            {modal === 'inputs' ? (
              <InputSettings
                project={project}
                onOpenBoard={() => setModal('board')}
                onChange={(inputs) =>
                  edit((p) => {
                    p.inputs = inputs;
                  })
                }
                onDone={() => setModal(null)}
                onEditCode={(line) => {
                  setCodeLine(line);
                  setCodeFile('user');
                  setTab('code');
                  setModal(null);
                }}
              />
            ) : modal === 'board' ? (
              <BoardPanel project={project} onConfigure={() => edit((p) => useH7Board(p))} />
            ) : modal === 'target' ? (
              <Suspense fallback={<p>Loading target guidance…</p>}>
                <TargetGuidance
                  onBoard={() => edit((p) => useH7Board(p))}
                  onClearBoard={
                    project.board
                      ? () =>
                          edit((p) => {
                            delete p.board;
                          })
                      : undefined
                  }
                  report={targetReport}
                  pending={targetPending}
                  onChange={(target) =>
                    edit((p) => {
                      if (target) p.target = target;
                      else delete p.target;
                    })
                  }
                />
              </Suspense>
            ) : modal === 'tileset' ? (
              <Suspense fallback={<p>Loading tileset importer…</p>}>
                <TilesetImporter
                  selectedSize={!inheritedNode ? node?.tilemap?.tileSize : undefined}
                  onImport={(set, action) => importTilesets([set], action)}
                  onImportBatch={importTilesets}
                />
              </Suspense>
            ) : modal === 'playtest' ? (
              <NativePlaytestPanel
                project={project}
                sceneId={scene.id}
                onEditCode={(line) => {
                  setCodeLine(line);
                  setCodeFile('user');
                  setTab('code');
                  setModal(null);
                }}
              />
            ) : modal === 'welcome' ? (
              <Welcome
                recent={recent}
                onNew={() => setModal('new')}
                onOpen={() => void nativeOpen()}
                onRecent={(index) => void nativeOpen(index)}
                onSideScroller={() =>
                  void createProject({
                    name: 'Amber Trail',
                    width: 320,
                    height: 240,
                    colorDepth: 16,
                    template: 'side-scroller',
                  })
                }
                onAdventure={() =>
                  void createProject({
                    name: 'Willowlight',
                    width: 320,
                    height: 240,
                    colorDepth: 16,
                    template: 'adventure',
                  })
                }
                onPhysics={() =>
                  void createProject({
                    name: 'Physics Playground',
                    width: 320,
                    height: 240,
                    colorDepth: 16,
                    template: 'physics',
                  })
                }
                onStarter={() =>
                  void createProject({
                    name: 'The Little Grove',
                    width: 320,
                    height: 240,
                    colorDepth: 16,
                    template: 'starter',
                  })
                }
              />
            ) : modal === 'new' ? (
              <NewProject
                onCancel={() => setModal(null)}
                onCreate={(options) => void createProject(options)}
              />
            ) : modal === 'settings' ? (
              <>
                <div className="modal-icon">
                  <Monitor size={22} />
                </div>
                <div className="eyebrow">YOUR GAME, YOUR DISPLAY</div>
                <h1>Project settings</h1>
                <button className="secondary" onClick={() => setModal('inputs')}>
                  Inputs & controllers…
                </button>
                <p>Choose a screen size. Bring your own LVGL board port.</p>
                <TargetSummary
                  report={targetReport}
                  pending={targetPending}
                  onOpen={() => setModal('target')}
                />
                <label className="block-label">
                  Project name
                  <input
                    aria-label="Project name"
                    value={project.name}
                    maxLength={128}
                    onChange={(e) =>
                      edit((p) => {
                        p.name = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="block-label">
                  Display preset
                  <select
                    aria-label="Display preset"
                    value={`${project.width}x${project.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      if (w && h)
                        edit((p) => {
                          p.width = w;
                          p.height = h;
                        });
                    }}
                  >
                    {![
                      '128x128',
                      '240x240',
                      '320x240',
                      '240x320',
                      '480x272',
                      '480x320',
                      '800x480',
                    ].includes(`${project.width}x${project.height}`) && (
                      <option value={`${project.width}x${project.height}`}>
                        Custom · {project.width} × {project.height}
                      </option>
                    )}
                    {[
                      [128, 128],
                      [240, 240],
                      [320, 240],
                      [240, 320],
                      [480, 272],
                      [480, 320],
                      [800, 480],
                    ].map(([w, h]) => (
                      <option key={`${w}x${h}`} value={`${w}x${h}`}>
                        {w} × {h}
                        {w === 320 && h === 240 ? ' · QVGA' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-pair">
                  <NumberField
                    label="Display width"
                    value={project.width}
                    min={16}
                    max={2048}
                    onChange={(width) =>
                      edit((p) => {
                        p.width = Math.round(width);
                      })
                    }
                  />
                  <NumberField
                    label="Display height"
                    value={project.height}
                    min={16}
                    max={2048}
                    onChange={(height) =>
                      edit((p) => {
                        p.height = Math.round(height);
                      })
                    }
                  />
                </div>
                <label className="block-label">
                  Output color
                  <select
                    aria-label="Output color depth"
                    value={project.colorDepth}
                    onChange={(e) =>
                      edit((p) => {
                        p.colorDepth = Number(e.target.value) as 16 | 32;
                      })
                    }
                  >
                    <option value={16}>RGB565 · 16 bit</option>
                    <option value={32}>ARGB8888 · 32 bit</option>
                  </select>
                </label>
                <Toggle
                  label="Pixel perfect rendering"
                  value={pixelPerfect}
                  onChange={(enabled) =>
                    edit((p) => {
                      p.pixelPerfect = enabled;
                    })
                  }
                  description="Whole display pixels in Scene, Game and Native LVGL. Sprite art uses nearest sampling; physics keeps subpixel precision."
                />
                <Toggle
                  label="Touchscreen controls"
                  value={touchEnabled}
                  onChange={(enabled) => editGraph((p, s) => setTouchControls(p, s, enabled))}
                  description={`For ${scene.name}. Hold or slide between arrows to move; Action jumps or attacks, Talk interacts. Buttons are editable in Hierarchy. Export uses your LVGL touch driver.`}
                />
                <div className="memory-card">
                  <Cpu size={18} />
                  <div>
                    <strong>{kb((project.width * project.height * project.colorDepth) / 8)}</strong>
                    <span>one full framebuffer · partial buffering supported by LVGL</span>
                  </div>
                </div>
                <p className="field-hint">
                  Changing display size preserves authored object positions. Tilemap grid size
                  remains explicit. Objects outside the display are reported at export.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      void createProject({
                        name: 'The Little Grove',
                        width: 320,
                        height: 240,
                        colorDepth: 16,
                        template: 'starter',
                      });
                    }}
                  >
                    Load starter <FilePlus2 size={13} />
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setModal(null);
                      setTimeout(fit, 0);
                    }}
                  >
                    Done <Check size={14} />
                  </button>
                </div>
              </>
            ) : modal === 'export' ? (
              <ExportPanel
                project={project}
                issues={issues}
                destination={exportDestination}
                native={!!desktop}
                busy={exporting}
                stats={exportStats}
                result={exportResult}
                conflicts={exportConflicts}
                onChoose={() => void chooseExport()}
                onExport={(kind, replace) => void exportGame(kind, replace)}
                onReveal={() => void desktop?.revealExport()}
                target={targetReport}
                targetPending={targetPending}
                onTarget={() => setModal('target')}
              />
            ) : (
              <>
                <div className="modal-icon">
                  <Gamepad2 size={23} />
                </div>
                <div className="eyebrow">A SMALL ENGINE FOR SMALL MACHINES</div>
                <h1>Make a little world.</h1>
                <p>Visual scenes. Real C. An LVGL runtime you can own.</p>
                <ol className="quick-start">
                  <li>
                    <strong>Set your screen size</strong>
                    <span>
                      Use the display selector or Project settings. Choose a preset or enter a
                      custom resolution.
                    </span>
                  </li>
                  <li>
                    <strong>Build a scene</strong>
                    <span>
                      Add sprites, labels, rectangles and buttons. Drag objects, edit properties,
                      assign behaviors.
                    </span>
                  </li>
                  <li>
                    <strong>Paint a tilemap</strong>
                    <span>
                      Select Terrain, choose a tile in the inspector, and paint. Toggle collision
                      for each tile type.
                    </span>
                  </li>
                  <li>
                    <strong>Play and extend</strong>
                    <span>
                      Use WASD / arrows. Connect audio cues visually. Write native logic in the Code
                      tab.
                    </span>
                  </li>
                  <li>
                    <strong>Export to LVGL</strong>
                    <span>
                      Export the ui folder and include ui/ui.h. Your firmware owns display, input,
                      storage and audio hardware.
                    </span>
                  </li>
                </ol>
                <div className="help-links">
                  <button onClick={() => void save()}>
                    <Save size={14} /> Save project file
                  </button>
                  <button
                    onClick={() => {
                      setModal(null);
                      setTab('code');
                    }}
                  >
                    <Code2 size={14} /> Open C hooks
                  </button>
                </div>
                <p className="field-hint">
                  Version 0.2 · Standalone desktop editor. Native LVGL runs your C locally; Play
                  runs the fast built-in preview. Export integrates through ui/ui.h.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
