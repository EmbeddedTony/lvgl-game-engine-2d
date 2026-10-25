import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produce } from 'immer';
import { createStarter } from '../src/assets';
import { makeNode, parseProject, validate, type Project, type Scene } from '../src/model';
import {
  branchIds,
  displaySceneNodes,
  instanceSources,
  reparentNode,
  resolveScene,
  sceneGraphIssues,
} from '../src/scenes';
import {
  duplicateBranch,
  extractScene,
  patchSceneNode,
  unpackInstance,
} from '../src/editor/scene-commands';
import { generate } from '../src/exporter';
import { sceneReferences, validFlow } from '../src/flow';
import { begin, advance } from '../src/simulation';
import { createSceneDemo } from '../src/scene-demo';

const scene = (id: string, nodes: Scene['nodes']): Scene => ({
  id,
  name: id,
  background: '#102030',
  objective: '',
  completion: '',
  music: '',
  nodes,
});
function fixture(): Project {
  return {
    ...createStarter(),
    scenes: [
      scene('level', [
        makeNode('group', { id: 'world', x: 10, y: 20 }),
        makeNode('instance', {
          id: 'left',
          name: 'Left HUD',
          parent: 'world',
          scene: 'hud',
          x: 4,
          y: 5,
        }),
        makeNode('instance', {
          id: 'right',
          name: 'Right HUD',
          scene: 'hud',
          x: 120,
          y: 30,
          overrides: { label: { text: 'Right copy' } },
        }),
      ]),
      scene('hud', [
        makeNode('group', { id: 'hud_root', x: 2, y: 3 }),
        makeNode('label', {
          id: 'label',
          parent: 'hud_root',
          x: 7,
          y: 8,
          width: 80,
          text: 'Shared',
        }),
        makeNode('button', { id: 'next', parent: 'hud_root', x: 0, y: 30, width: 70 }),
      ]),
    ],
  };
}
test('scene instances preserve local ownership, stable scoped IDs and independent override values', () => {
  const p = fixture(),
    json = JSON.stringify(p),
    nodes = resolveScene(p, p.scenes[0]);
  assert.deepEqual(parseProject(json), p);
  const left = nodes.find((n) => n.id === 'left/label')!;
  assert.equal(left.parent, 'left/hud_root');
  assert.equal(left.x, 7);
  assert.equal(left.worldX, 23);
  assert.equal(left.worldY, 36);
  assert.equal(left.sourceScene, 'hud');
  assert.equal(left.instanceRoot, 'left');
  assert.equal(nodes.find((n) => n.id === 'right/label')!.text, 'Right copy');
  assert.equal(JSON.stringify(p), json);
  p.scenes[1].nodes[1].text = 'Changed source';
  assert.equal(
    resolveScene(p, p.scenes[0]).find((n) => n.id === 'left/label')!.text,
    'Changed source',
  );
  assert.equal(
    resolveScene(p, p.scenes[0]).find((n) => n.id === 'right/label')!.text,
    'Right copy',
  );
  p.scenes[0].nodes[0].visible = false;
  assert.equal(displaySceneNodes(p, p.scenes[0]).find((n) => n.id === 'left/next')!.visible, false);
  assert.equal(displaySceneNodes(p, p.scenes[0]).find((n) => n.id === 'right/next')!.visible, true);
});
test('nested overrides compose from inner to outer and references include instance dependencies', () => {
  const p = fixture();
  p.scenes.push(
    scene('panel', [
      makeNode('instance', {
        id: 'nested',
        scene: 'hud',
        x: 1,
        y: 2,
        overrides: { label: { text: 'Inner', x: 11 } },
      }),
    ]),
  );
  p.scenes[0].nodes[1].scene = 'panel';
  p.scenes[0].nodes[1].overrides = { 'nested/label': { text: 'Outer' } };
  const label = resolveScene(p, p.scenes[0]).find((n) => n.id === 'left/nested/label')!;
  assert.equal(label.text, 'Outer');
  assert.equal(label.x, 11);
  assert.equal(label.worldX, 28);
  assert.equal(label.instanceRoot, 'left');
  assert.ok(sceneReferences(p, 'hud').some((r) => r.includes('panel')));
  assert.equal(
    instanceSources(p, p.scenes[1]).length,
    0,
    'No scene depending on hud can be instanced into hud',
  );
});
test('import rejects parent/scene cycles, dangling overrides, malformed patches, depth and expanded budget overflow', () => {
  const mutations: ((p: Project) => void)[] = [
    (p) => {
      p.scenes[0].nodes[0].parent = 'left';
    },
    (p) => {
      p.scenes[0].nodes[0].parent = 'missing';
    },
    (p) => {
      p.scenes[1].nodes.push(makeNode('instance', { scene: 'level' }));
    },
    (p) => {
      p.scenes[0].nodes[1].scene = 'missing';
    },
    (p) => {
      p.scenes[0].nodes[1].overrides = { missing: { text: 'No' } };
    },
    (p) => {
      p.scenes[0].nodes[1].overrides = { label: { parent: 'world' } as never };
    },
    (p) => {
      p.scenes[0].nodes[1].overrides = { label: { x: Infinity } };
    },
    (p) => {
      p.scenes[1].nodes = Array.from({ length: 64 }, (_, i) => makeNode('rect', { id: `n${i}` }));
      p.scenes[0].nodes[2].overrides = {};
    },
    (p) => {
      p.scenes[1].nodes = Array.from({ length: 17 }, (_, i) =>
        makeNode('group', { id: `n${i}`, parent: i ? `n${i - 1}` : undefined }),
      );
      p.scenes[0].nodes[2].overrides = {};
    },
  ];
  for (const mutate of mutations) {
    const p = fixture();
    mutate(p);
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
});
test('parent changes preserve world transforms and duplicate/delete operate on whole branches', () => {
  const p = fixture(),
    s = p.scenes[0];
  reparentNode(p, s, 'right', 'world');
  assert.equal(s.nodes[2].x, 110);
  assert.equal(s.nodes[2].y, 10);
  assert.equal(resolveScene(p, s).find((n) => n.id === 'right/label')!.worldX, 129);
  assert.throws(() => reparentNode(p, s, 'world', 'left'));
  assert.deepEqual([...branchIds(s, 'world')], ['world', 'left', 'right']);
  const copy = duplicateBranch(s, 'world');
  assert.equal(branchIds(s, copy).size, 3);
  assert.equal(sceneGraphIssues(p).length, 0);
});
test('editing inherited nodes writes outer overrides and revert restores live source values', () => {
  const p = fixture();
  const changed = produce(p, (draft) =>
    patchSceneNode(draft, draft.scenes[0], 'left/label', { text: 'Override', x: 19 }),
  );
  assert.equal(changed.scenes[1].nodes[1].text, 'Shared');
  assert.equal(
    resolveScene(changed, changed.scenes[0]).find((n) => n.id === 'left/label')!.text,
    'Override',
  );
  assert.throws(() => patchSceneNode(p, p.scenes[0], 'left/label', { parent: 'right' }));
  const reverted = produce(changed, (draft) => {
    delete draft.scenes[0].nodes[1].overrides;
  });
  assert.equal(
    resolveScene(reverted, reverted.scenes[0]).find((n) => n.id === 'left/label')!.text,
    'Shared',
  );
});
test('extract and unpack work transactionally on Immer drafts without retaining source-owned containers', () => {
  let p = fixture();
  p = produce(p, (draft) => {
    duplicateBranch(draft.scenes[0], 'world');
  });
  p = produce(p, (draft) => {
    extractScene(draft, draft.scenes[1], 'hud_root');
  });
  assert.equal(sceneGraphIssues(p).length, 0);
  const before = displaySceneNodes(p, p.scenes[0])
    .filter((n) => n.kind === 'label')
    .map((n) => [n.x, n.y, n.text]);
  p = produce(p, (draft) => {
    unpackInstance(draft, draft.scenes[0], 'left');
  });
  assert.equal(p.scenes[0].nodes[1].kind, 'group');
  assert.equal(sceneGraphIssues(p).length, 0);
  assert.deepEqual(
    displaySceneNodes(p, p.scenes[0])
      .filter((n) => n.kind === 'label')
      .map((n) => [n.x, n.y, n.text]),
    before,
  );
});
test('resolved button paths work in flow, export parent indices and generate safe stable C constants', () => {
  const p = fixture();
  p.flow = {
    folders: [],
    entry: { kind: 'sequence', id: 'journey' },
    sequences: [
      {
        id: 'journey',
        name: 'Journey',
        steps: [{ id: 'first', scene: 'level', advance: 'click', button: 'left/next' }],
        end: 'hold',
      },
    ],
  };
  assert.equal(validFlow(p), true);
  assert.deepEqual(parseProject(JSON.stringify(p)), JSON.parse(JSON.stringify(p)));
  const files = generate(p, {}).files;
  assert.match(files['ui/ui_ids.h'] as string, /UI_NODE_LEFT_NEXT "left\/next"/);
  assert.match(files['ui/generated/game_data.c'] as string, /\.id="left\/label"[^\n]*\.parent=3/);
  assert.match(files['ui/generated/game_data.c'] as string, /\.count=9/);
  assert.equal(
    validate(p).some((i) => i.severity === 'error'),
    false,
  );
});
test('fast preview moves descendants with a parent controller and restores authored coordinates', () => {
  const p = fixture();
  p.scenes[0].nodes[0].kind = 'rect';
  p.scenes[0].nodes[0].player = true;
  const simulation = begin(p.scenes[0], p),
    child = simulation.nodes.find((n) => n.id === 'left/label')!,
    x = child.x;
  advance(
    simulation,
    p,
    new Set(['d']),
    100,
    () => {},
    () => {},
  );
  assert.ok(Math.abs(child.x - x - 7.2) < 0.001);
  assert.equal(resolveScene(p, p.scenes[0]).find((n) => n.id === 'left/label')!.worldX, x);
});
test('extract/unpack migrate nested override and sequence paths across containing scenes', () => {
  const p = fixture();
  p.flow = {
    folders: [],
    entry: { kind: 'scene', id: 'level' },
    sequences: [
      {
        id: 'journey',
        name: 'Journey',
        steps: [{ id: 'first', scene: 'level', advance: 'click', button: 'left/next' }],
        end: 'hold',
      },
    ],
  };
  extractScene(p, p.scenes[1], 'hud_root');
  assert.equal(p.flow.sequences[0].steps[0].button, 'left/hud_root/next');
  assert.equal(p.scenes[0].nodes[2].overrides?.['hud_root/label']?.text, 'Right copy');
  assert.deepEqual(parseProject(JSON.stringify(p)), JSON.parse(JSON.stringify(p)));
  unpackInstance(p, p.scenes[1], 'hud_root');
  assert.notEqual(p.flow.sequences[0].steps[0].button, 'left/hud_root/next');
  assert.ok(validFlow(p));
  assert.equal(sceneGraphIssues(p).length, 0);
  assert.equal(
    resolveScene(p, p.scenes[0]).find((n) => n.text === 'Right copy')?.instanceRoot,
    'right',
  );
});
test('identical instanced tilemaps share compressed flash payloads and source containers stay isolated when unpacked', () => {
  const p = createSceneDemo(),
    map = structuredClone(p.scenes[0].nodes.find((n) => n.tilemap)!);
  p.scenes.push(scene('tiles', [map]));
  p.scenes[0].nodes.push(makeNode('instance', { id: 'tile_copy', scene: 'tiles', x: 0, y: 0 }));
  const files = generate(p, {}).files,
    data = files['ui/generated/game_data.c'] as string;
  assert.equal((data.match(/static const lge_tilemap_t /g) ?? []).length, 1);
  unpackInstance(p, p.scenes[0], 'tile_copy');
  const unpacked = p.scenes[0].nodes.find((n) => n.tilemap && n.id !== map.id)!;
  unpacked.tilemap!.cells[0] = 0;
  assert.notEqual(p.scenes[p.scenes.length - 1].nodes[0].tilemap!.cells[0], 0);
});
test('extracting an overridden root preserves parent-local translation and inherited visibility', () => {
  const p = fixture();
  p.scenes[1].nodes[0].visible = false;
  p.scenes[0].nodes[2].overrides = {
    hud_root: { x: 22, y: 27, visible: true },
    label: { text: 'Kept' },
  };
  const values = () =>
    displaySceneNodes(p, p.scenes[0])
      .filter((n) => n.kind === 'label')
      .map((n) => [n.x, n.y, n.visible, n.text]);
  const before = values();
  extractScene(p, p.scenes[1], 'hud_root');
  assert.deepEqual(values(), before);
  assert.deepEqual(p.scenes[0].nodes[2].overrides?.hud_root, { x: 22, y: 27, visible: true });
  assert.equal(sceneGraphIssues(p).length, 0);
});
