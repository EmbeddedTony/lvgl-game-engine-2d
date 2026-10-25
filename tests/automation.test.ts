import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeNode, type Project } from '../src/model';
import { applyCommands, queryProject, readPointer } from '../src/automation/project-commands';
import { parseArguments } from '../src/cli/arguments';
import type { ProjectCommand } from '../src/automation/protocol';
const project = (): Project => ({
  version: 1,
  name: 'Automation fixture',
  width: 320,
  height: 240,
  colorDepth: 16,
  sprites: [],
  audio: [],
  code: '',
  scenes: [
    {
      id: 'main',
      name: 'Main',
      background: '#18212b',
      objective: '',
      completion: '',
      music: '',
      nodes: [],
    },
  ],
});
const op = (command: string, params: Record<string, unknown>): ProjectCommand => ({
  command,
  params,
});
test('transactions are atomic and validate references after all operations', () => {
  const p = project();
  const result = applyCommands(p, [
    op('node.create', { scene: 'main', id: 'copy', kind: 'instance', data: { scene: 'actor' } }),
    op('scene.create', { id: 'actor', name: 'Actor' }),
  ]);
  assert.equal(p.scenes.length, 1);
  assert.equal(p.scenes[0].nodes.length, 0);
  assert.equal(result.project.scenes[0].nodes[0].scene, 'actor');
  assert.throws(
    () =>
      applyCommands(p, [
        op('node.create', { scene: 'main', id: 'valid', kind: 'rect' }),
        op('node.create', { scene: 'main', id: 'bad', kind: 'sprite', data: { asset: 'missing' } }),
      ]),
    /invalid|Invalid/,
  );
  assert.equal(p.scenes[0].nodes.length, 0);
});
test('inherited edits create instance overrides and preserve reusable sources', () => {
  const p = project();
  p.scenes.push({
    ...p.scenes[0],
    id: 'actor',
    name: 'Actor',
    nodes: [makeNode('rect', { id: 'body', x: 4 })],
  });
  p.scenes[0].nodes.push(makeNode('instance', { id: 'linked', scene: 'actor' }));
  const changed = applyCommands(p, [
    op('node.update', { scene: 'main', id: 'linked/body', patch: { x: 12, color: '#ff0000' } }),
  ]).project;
  assert.equal(changed.scenes[1].nodes[0].x, 4);
  assert.equal(changed.scenes[0].nodes[0].overrides?.body.x, 12);
  assert.throws(
    () =>
      applyCommands(p, [
        op('node.update', { scene: 'main', id: 'linked/body', patch: { width: 90 } }),
      ]),
    /source scene/,
  );
});
test('reparent preserves world coordinates and rejects hierarchy cycles', () => {
  const p = project();
  p.scenes[0].nodes.push(
    makeNode('group', { id: 'parent', x: 100, y: 20 }),
    makeNode('rect', { id: 'child', x: 12, y: 30 }),
  );
  const next = applyCommands(p, [
    op('node.reparent', { scene: 'main', id: 'child', parent: 'parent' }),
  ]).project;
  assert.equal(next.scenes[0].nodes[1].x, -88);
  assert.equal(next.scenes[0].nodes[1].parent, 'parent');
  assert.equal(
    (queryProject(next, 'node.list', { scene: 'main', resolved: true }) as any[]).find(
      (n) => n.id === 'child',
    ).worldX,
    12,
  );
  assert.throws(
    () =>
      applyCommands(next, [op('node.reparent', { scene: 'main', id: 'parent', parent: 'child' })]),
    /cycle|descendant|itself/i,
  );
});
test('patch pointers support ordered array edits and tests, rejecting prototype traversal', () => {
  const p = project();
  const next = applyCommands(p, [
    op('project.patch', {
      operations: [
        { op: 'test', path: '/name', value: p.name },
        { op: 'replace', path: '/name', value: 'New name' },
        { op: 'add', path: '/scenes/0/touchControls', value: true },
      ],
    }),
  ]).project;
  assert.equal(readPointer(next, '/name'), 'New name');
  assert.equal(next.scenes[0].touchControls, true);
  assert.throws(
    () =>
      applyCommands(p, [
        op('project.patch', { operations: [{ op: 'test', path: '/name', value: 'wrong' }] }),
      ]),
    /test failed/,
  );
  assert.throws(() => readPointer(p, '/__proto__/polluted'), /Reserved/);
  assert.throws(
    () =>
      applyCommands(
        p,
        JSON.parse(
          '[{"command":"node.create","params":{"scene":"main","kind":"rect","data":{"__proto__":{"polluted":true}}}}]',
        ),
      ),
    /Reserved/,
  );
  assert.equal(({} as any).polluted, undefined);
});
test('tile painting rejects out of bounds cells and invalid tile bank entries without partial edits', () => {
  const p = project();
  p.sprites = [{ id: 'tile', name: 'Tile', width: 8, height: 8, pixels: Array(256).fill(255) }];
  p.scenes[0].nodes = [
    makeNode('tilemap', {
      id: 'map',
      width: 16,
      height: 8,
      tilemap: { tileSize: 8, columns: 2, rows: 1, cells: [0, 0], tiles: ['tile'], solidTiles: [] },
    }),
  ];
  assert.throws(
    () =>
      applyCommands(p, [
        op('tilemap.paint', {
          scene: 'main',
          id: 'map',
          cells: [
            { x: 0, y: 0, tile: 1 },
            { x: 2, y: 0, tile: 1 },
          ],
        }),
      ]),
    /out of range/,
  );
  assert.deepEqual(p.scenes[0].nodes[0].tilemap!.cells, [0, 0]);
  const next = applyCommands(p, [
    op('tilemap.paint', { scene: 'main', id: 'map', cells: [{ x: 1, y: 0, tile: 1 }] }),
  ]).project;
  assert.deepEqual(next.scenes[0].nodes[0].tilemap!.cells, [0, 1]);
});
test('argument parsing supports Unity-style paths, discovery and typed parameters without shell evaluation', () => {
  assert.equal(
    parseArguments([
      'build',
      '--project',
      'demo.lge.json',
      '--output',
      'out',
      '--terrain-cache-kib',
      '2048',
    ]).params.terrainCacheKib,
    2048,
  );
  const parsed = parseArguments([
    '-batchmode',
    '-projectPath',
    '/a path/Game.lge.json',
    'command',
    'node.update',
    '--params',
    '{"scene":"main","id":"player","patch":{"x":4}}',
    '--expected-revision',
    'hash',
    '-quit',
  ]);
  assert.equal(parsed.command, 'node.update');
  assert.equal(parsed.options.projectPath, '/a path/Game.lge.json');
  assert.deepEqual(parsed.params.patch, { x: 4 });
  assert.equal(parseArguments(['run', '--command', 'validate', '--json']).command, 'validate');
  assert.equal(parseArguments(['node', 'create', '--help']).params.command, 'node.create');
  assert.throws(() => parseArguments(['node', 'create', '--typo', 'true']), /Unknown option/);
  assert.throws(() => parseArguments(['project', 'create', '--width', 'NaN']), /finite number/);
  assert.throws(
    () => parseArguments(['node.create', '--params', '{"__proto__":{"scene":"main"}}']),
    /JSON object/,
  );
  assert.throws(() => parseArguments(['status', '--toString=oops']), /Unknown option/);
});
test('JSON Patch tests ignore object member order and reject missing expected values', () => {
  const p = project(),
    scene = Object.fromEntries(Object.entries(p.scenes[0]).reverse());
  assert.equal(
    applyCommands(p, [
      op('project.patch', { operations: [{ op: 'test', path: '/scenes/0', value: scene }] }),
    ]).project.name,
    p.name,
  );
  assert.throws(
    () => applyCommands(p, [op('project.patch', { operations: [{ op: 'test', path: '/name' }] })]),
    /requires value/,
  );
});
