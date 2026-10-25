export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export interface Param {
  type: ParamType;
  description: string;
  required?: boolean;
  default?: unknown;
}
export interface CommandSpec {
  name: string;
  description: string;
  mutates: boolean;
  params: Record<string, Param>;
}
const s = (description: string, required = false): Param => ({
  type: 'string',
  description,
  required,
});
const n = (description: string): Param => ({ type: 'number', description });
const b = (description: string): Param => ({ type: 'boolean', description });
const o = (description: string, required = true): Param => ({
  type: 'object',
  description,
  required,
});
const a = (description: string): Param => ({ type: 'array', description, required: true });
const scene = s('Authored scene ID.', true),
  id = s('Stable resource or node ID.', true);
const resource = s(
  'sprites, tilesets, audio, animations, scripts, state, patterns, items, skills, actors, encounters, folders or sequences.',
  true,
);
const spec = (
  name: string,
  description: string,
  mutates = false,
  params: CommandSpec['params'] = {},
): CommandSpec => ({ name, description, mutates, params });
const device = {
  buildReport: s('build-report.json for the exact running --debug-swd firmware.', true),
  serial: s('ST-LINK serial number.', true),
  programmer: s('Optional absolute CubeProgrammer CLI path.'),
  durationMs: n(
    'Input/pause ownership lease 100–120000 ms; default 5000. Automatically releases after expiry.',
  ),
};
export const commands: CommandSpec[] = [
  spec('version', 'Report engine and automation protocol versions.'),
  spec('commands', 'Discover the versioned command and parameter manifest.', false, {
    query: s('Filter by name or description.'),
  }),
  spec('help', 'Show usage or the contract for one command.', false, {
    command: s('Command name, e.g. node.create.'),
  }),
  spec('status', 'Show the selected project, revision, dirty state and live editor connection.'),
  spec('editor.sessions', 'List running local desktop editor sessions.'),
  spec('doctor', 'Check the native LVGL SDK, compiler and STM32 build tools.'),
  spec(
    'schema',
    'Discover JSON Schemas generated from the editor authoring types. Runtime validation also checks limits and references.',
    false,
    {
      type: s(
        'Project, GameNode, Scene, Physics, AnimationClip, Gameplay, RpgDatabase, etc. Omit to list types.',
      ),
    },
  ),
  spec('api.get', 'Read generated C API headers for scripting against the real runtime.', false, {
    file: s('ui.h (default), game.h, ui_ids.h or engine/lge*.h.'),
  }),
  spec(
    'project.create',
    'Create a new project file; refuses to overwrite an existing file.',
    true,
    {
      name: s('Project name.', true),
      width: n('Display width; default 320.'),
      height: n('Display height; default 240.'),
      family: s('Target family ID from targets; default host-pc.'),
      board: s('Optional stm32h7s78-dk board configuration.'),
    },
  ),
  spec('project.inspect', 'Summarize a project without dumping embedded pixels.'),
  spec(
    'project.get',
    'Read project data by JSON Pointer; root includes all embedded assets.',
    false,
    { path: s('RFC 6901 pointer; default empty/root.') },
  ),
  spec(
    'project.apply',
    'Apply up to 256 project commands as one validated transaction and one Undo step.',
    true,
    { commands: a('Array of {command, params}; use command names marked mutates.') },
  ),
  spec(
    'project.patch',
    'Patch any project feature using add/replace/remove/test JSON Pointer operations. Validates the complete result.',
    true,
    { operations: a('RFC 6902 subset: [{op,path,value?}]. No move/copy.') },
  ),
  spec(
    'project.save',
    'Save the selected live editor document. Offline mutations already save atomically.',
  ),
  spec('input.list', 'List typed physical input channels and controller sources.'),
  spec('input.preset', 'Add an ADC, serial or BLE joystick/button preset with stable IDs.', true, {
    kind: s('adc, serial or ble.', true),
  }),
  spec(
    'input.configure',
    'Replace physical input sources/channels with a validated InputConfig.',
    true,
    { config: o('InputConfig; see schema InputConfig.') },
  ),
  spec('scene.list', 'List authored scenes and their hierarchy counts.'),
  spec('prefab.list', 'List reusable prefab sources and their expanded node costs.'),
  spec('scene.get', 'Read one authored scene.', false, { scene }),
  spec('scene.create', 'Create a reusable scene with an optional stable ID.', true, {
    name: s('Scene name.', true),
    id: s('Stable ID; generated if omitted.'),
    data: o('Optional scene properties.', false),
  }),
  spec('scene.update', 'Update scene properties, camera or touch controls.', true, {
    scene,
    patch: o('Scene fields; ID and nodes cannot be replaced here.'),
  }),
  spec(
    'scene.delete',
    'Delete a scene. Remaining references must be repaired in the same transaction.',
    true,
    { scene },
  ),
  spec('node.list', 'List nodes without pixel or tile payloads.', false, {
    scene,
    resolved: b('Expand linked scenes and include world coordinates.'),
  }),
  spec('node.get', 'Read an authored or inherited node.', false, {
    scene,
    id,
    resolved: b('Expand linked scene nodes.'),
  }),
  spec('node.create', 'Create a node with editor defaults and a stable optional ID.', true, {
    scene,
    kind: s('rect, sprite, label, button, tilemap, group, instance or area.', true),
    id: s('Stable ID; generated if omitted.'),
    data: o('Node properties, components, events and bindings.', false),
  }),
  spec('node.update', 'Update a node; inherited nodes write supported instance overrides.', true, {
    scene,
    id,
    patch: o('Node fields; identity and parent use dedicated commands.'),
  }),
  spec('node.delete', 'Delete an authored node and its descendants.', true, { scene, id }),
  spec(
    'node.reparent',
    'Move an authored node under a parent while preserving world position.',
    true,
    { scene, id, parent: s('New authored parent ID; empty string detaches.') },
  ),
  spec('node.duplicate', 'Duplicate an authored subtree with fresh IDs.', true, { scene, id }),
  spec('node.move', 'Reparent or reorder an authored branch; preserves world position.', true, {
    scene,
    id,
    target: s('Authored target ID, omitted for root.'),
    placement: s('inside, before, after or root.', true),
  }),
  spec('prefab.create', 'Save an authored branch as a linked prefab, migrating references.', true, {
    scene,
    id,
  }),
  spec(
    'prefab.pool',
    'Reserve 1–16 inactive prefab copies in an organized group; default 4. Counts toward the 128-node expanded scene limit.',
    true,
    {
      scene,
      prefab: s('Prefab source ID.', true),
      capacity: n('Maximum simultaneous live copies.'),
    },
  ),
  spec(
    'node.extract',
    'Extract a subtree to a reusable linked scene, migrating references.',
    true,
    { scene, id },
  ),
  spec('node.unpack', 'Bake a scene instance into local nodes, migrating references.', true, {
    scene,
    id,
  }),
  spec('resource.list', 'List resources without embedded pixel arrays.', false, { resource }),
  spec('resource.get', 'Read a resource, including its complete data.', false, { resource, id }),
  spec(
    'resource.upsert',
    'Create or replace a resource. Use project.apply for dependent changes.',
    true,
    { resource, data: o('Complete resource object with a stable ID.') },
  ),
  spec('resource.delete', 'Delete a resource; dangling references fail validation.', true, {
    resource,
    id,
  }),
  spec('code.get', 'Read the project C hooks.'),
  spec('code.set', 'Replace the project C hooks from text or a UTF-8 file.', true, {
    text: s('C source; mutually exclusive with file.'),
    file: s('C source file, or - for stdin.'),
  }),
  spec('tilemap.paint', 'Paint bounded map cells using numeric tile-bank indices.', true, {
    scene,
    id,
    cells: a('Array of {x,y,tile}; 0 clears a cell.'),
  }),
  spec(
    'asset.import-sprite',
    'Import a PNG at native resolution without resampling (maximum 512x512).',
    true,
    { file: s('PNG path.', true), id, name: s('Asset name; defaults to ID.') },
  ),
  spec(
    'asset.import-tileset',
    'Slice a PNG with native pixels, transparency handling and duplicate-tile merging.',
    true,
    {
      file: s('PNG path, maximum 2048x2048.', true),
      id,
      name: s('Tileset name; defaults to ID.'),
      tileSize: n('Square tile size, 8–64; default 32.'),
      marginX: n('Horizontal margin.'),
      marginY: n('Vertical margin.'),
      spacingX: n('Horizontal spacing.'),
      spacingY: n('Vertical spacing.'),
      selected: { type: 'array', description: 'Optional zero-based atlas cell indices.' },
      merge: b('Merge identical tiles; default true.'),
    },
  ),
  spec('tilemap.create', 'Create a tilemap from an imported tileset.', true, {
    scene,
    tileset: s('Tileset resource ID.', true),
    id: s('Stable node ID.'),
    name: s('Node name.'),
    columns: n('Map columns; defaults to display coverage.'),
    rows: n('Map rows; defaults to display coverage.'),
  }),
  spec(
    'validate',
    'Run the same structural and semantic validation used by the editor; errors exit 3.',
  ),
  spec('guidance', 'Measure MCU memory/rendering workload and target capability guidance.'),
  spec('targets', 'List the researched MCU/Linux/host capability profiles.', false, {
    query: s('Filter family, vendor or core.'),
  }),
  spec(
    'export',
    'Generate a clean LVGL ui/ folder, preserving unrelated and externally edited files.',
    false,
    {
      output: s('Parent folder in which ui/ is created.', true),
      replaceModified: b('Explicitly replace files changed both locally and by the generator.'),
    },
  ),
  spec(
    'playtest',
    'Compile and run the real exported C against native LVGL, with optional scripted input and PNG capture.',
    false,
    {
      seconds: n('Run duration after startup, 0.1–120; default 2.'),
      scene: s('Start at this scene instead of the project entry.'),
      sequence: s('Start at this sequence.'),
      input: {
        type: 'array',
        description: 'Timed actions: [{atMs,input?:0..127,pointer?:{x,y,down},pause?:boolean}].',
      },
      inputFile: s('JSON file containing timed actions.'),
      screenshot: s('Save the final RGBA frame as PNG.'),
      timeoutMs: n('Overall build/run timeout, 1000–300000; default 60000.'),
    },
  ),
  spec(
    'build',
    'Build STM32H7S78-DK application artifacts with the existing board port. Does not program a device.',
    false,
    {
      output: s('New build output directory.', true),
      renderer: s('neochrom or software; default neochrom.'),
      debugSwd: b('Include optional SWD game-control mailbox; disabled for release builds.'),
      inputMonitor: b(
        'Stream read-only typed inputs over DK ST-LINK VCP at 115200 baud; disabled by default.',
      ),
      fps: n(
        '30 or 60 refresh requests; default 60 for 2D. Actual rendered FPS depends on the scene.',
      ),
      terrainCacheKib: n(
        'Optional PSRAM terrain-cache budget: 0 (default/off), 32, 128, 512 or 2048 KiB. Benchmark before enabling.',
      ),
      toolchainBin: s('Optional ARM toolchain bin directory.'),
      cache: s('Optional vendor SDK cache directory.'),
      timeoutMs: n(
        'Builder timeout, 1000–1800000; default 600000. Interrupts stop the builder process group.',
      ),
    },
  ),
  spec('board.status', 'Read running game state, display timings without halting.', false, device),
  spec('board.input', 'Hold game actions under an expiring exclusive input lease.', true, {
    ...device,
    actions: s('Comma-separated up/down/left/right/jump/sword/talk/lock/none.', true),
  }),
  spec('board.pause', 'Pause for frame inspection under an expiring lease.', true, device),
  spec('board.resume', 'Resume simulation under the current automation lease.', true, device),
  spec(
    'board.release',
    'Release automation and restore prior pause state/touch controls.',
    true,
    device,
  ),
  spec(
    'board.reload',
    'Reload current scene for a repeatable test; does not reset the MCU.',
    true,
    device,
  ),
  spec('board.warp', 'Position the player for testing; 2D coordinates.', true, {
    ...device,
    x: n('Player X, -1000..1000.'),
    y: n('Player Y, -1000..1000.'),
  }),
  spec(
    'board.capture',
    'Freeze, save an RGB565 world/display PNG, then release automation.',
    true,
    { ...device, output: s('New PNG file path.', true), surface: s('display (default).') },
  ),
  spec(
    'board.benchmark',
    'Hold repeatable input, sample FPS/state/timings, then release; no visual settings change.',
    true,
    {
      ...device,
      actions: s('Held actions; default up.'),
      seconds: n('Test duration, 3..60; default 10.'),
      output: s('Optional new JSON evidence file.'),
    },
  ),
  spec('board.probes', 'Enumerate attached ST-LINK probes without programming or resetting.'),
];
export const byName = new Map(commands.map((c) => [c.name, c]));
export const globals: Record<string, Param> = {
  projectPath: s('Project file or directory containing exactly one *.lge.json.'),
  session: s('Editor session ID from editor.sessions; supports unsaved projects.'),
  offline: b('Read the saved file instead of the editor. Writes to an open project are refused.'),
  expectedRevision: s('Require this revision from status/inspect before mutation.'),
  dryRun: b('Validate and report a transaction without committing it.'),
  save: b('Also save a successful live edit to its existing project file.'),
  format: s('json (default) or text.'),
  logFile: s('Write structured diagnostics to this file; stdout remains the result.'),
};
