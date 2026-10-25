import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeAnimationFrame, layeredImages, animationFrames } from '../src/animation/layers';
import { importLayeredCharacter, importLayeredToolSwing } from '../src/animation/import-character';
import { resizeSprite } from '../src/compression';
import { createStarter } from '../src/assets';
import { parseProject, makeNode } from '../src/model';
import { emptyGameplay, type AnimationClip } from '../src/gameplay/model';
import { projectImages } from '../src/tile-assets';
import { generate } from '../src/exporter';
import { begin, advance } from '../src/simulation';
import type { SpriteAsset } from '../src/model';

function fixture() {
  const p = createStarter();
  delete p.flow;
  p.audio = [];
  const asset = (id: string, pixel: number[]): SpriteAsset => ({
    id,
    name: id,
    width: 2,
    height: 2,
    pixels: Array(4).fill(pixel).flat(),
  });
  p.sprites = [
    asset('body', [200, 0, 0, 255]),
    asset('body2', [0, 200, 0, 255]),
    asset('coat', [0, 0, 200, 128]),
    asset('coat2', [200, 200, 0, 128]),
  ];
  const clip: AnimationClip = {
    id: 'stack',
    name: 'Layered walk',
    frames: ['body', 'body2'],
    fps: 8,
    loop: true,
    layers: [
      { name: 'Body', frames: ['body', 'body2'], visible: true, x: 0, y: 0 },
      { name: 'Coat', frames: ['coat', 'coat2'], visible: true, x: 0, y: 0 },
    ],
  };
  p.gameplay = { ...emptyGameplay(), animations: [clip] };
  p.scenes[0].nodes = [
    makeNode('sprite', {
      id: 'npc',
      asset: animationFrames(clip)[0],
      width: 2,
      height: 2,
      animator: { idle: 'stack', move: '', jump: '', fall: '' },
    }),
  ];
  return { p, clip };
}
test('layer composition preserves alpha, order, visibility, offsets and all synchronized frame indices', () => {
  const { p, clip } = fixture(),
    source = new Map(p.sprites.map((s) => [s.id, s]));
  const before = JSON.stringify(p.sprites);
  assert.deepEqual(composeAnimationFrame(clip, 0, source).pixels.slice(0, 4), [100, 0, 100, 255]);
  assert.deepEqual(composeAnimationFrame(clip, 1, source).pixels.slice(0, 4), [100, 200, 0, 255]);
  clip.layers![1].x = 1;
  const shifted = composeAnimationFrame(clip, 0, source).pixels;
  assert.deepEqual(shifted.slice(0, 4), [200, 0, 0, 255]);
  assert.deepEqual(shifted.slice(4, 8), [100, 0, 100, 255]);
  clip.layers!.reverse();
  assert.deepEqual(composeAnimationFrame(clip, 0, source).pixels.slice(4, 8), [200, 0, 0, 255]);
  assert.equal(JSON.stringify(p.sprites), before);
});
test('layer edits invalidate bakes; legacy clips, malformed references, timelines and bounds remain explicit', () => {
  const { p, clip } = fixture();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.equal(projectImages(p).length, 6);
  const before = layeredImages(p)[0].pixels;
  clip.layers![1].visible = false;
  assert.notDeepEqual(layeredImages(p)[0].pixels, before);
  clip.layers![1].frames = ['missing'];
  assert.throws(() => parseProject(JSON.stringify(p)));
  clip.layers![1].frames = ['coat', 'coat2', 'coat'];
  assert.throws(() => parseProject(JSON.stringify(p)));
  clip.layers![1].frames = ['coat'];
  clip.layers![1].x = 129;
  assert.throws(() => parseProject(JSON.stringify(p)));
  delete clip.layers;
  assert.deepEqual(animationFrames(clip), ['body', 'body2']);
});
test('preview and clean export use the same precomposed frames, with no extra scene nodes or runtime layers', () => {
  const { p, clip } = fixture(),
    s = begin(p.scenes[0], p);
  for (let i = 0; i < 10; i++)
    advance(
      s,
      p,
      new Set(),
      1000 / 60,
      () => {},
      () => {},
    );
  assert.equal(s.nodes[0].asset, animationFrames(clip)[1]);
  const result = generate(p, {}),
    manifest = JSON.parse(String(result.files['ui/image-manifest.json']));
  assert.equal(manifest.images.length, 2);
  assert.ok(manifest.images.every((i: { asset: string }) => i.asset.startsWith('layered:')));
  assert.match(String(result.files['ui/generated/game_data.c']), /\.count=2,\.fps=8/);
  assert.equal(p.scenes[0].nodes.length, 1);
});
test('Mana Seed P1 import preserves native pixels and common registration, ordered behind-body layers and six-frame walking', () => {
  const source = (name: string, color: number) => ({
    name,
    sheet: {
      width: 512,
      height: 512,
      pixels: Uint8Array.from(
        Array.from({ length: 512 * 512 }, (_, i) => [
          color,
          (i % 512) % 256,
          Math.floor(i / 512) % 256,
          255,
        ]).flat(),
      ),
    },
  });
  const sources = [
    source('char_a_p1_2clo_lnpl_v01.png', 2),
    source('char_a_p1_0bas_humn_v01.png', 1),
    source('char_a_p1_0bot_lnpl_v01.png', 3),
  ];
  const c = importLayeredCharacter('Ranger', 'ranger', sources);
  assert.equal(c.clips.length, 8);
  assert.equal(c.clips[1].frames.length, 6);
  assert.equal(c.clips[0].layers![0].name, 'Rear cloak');
  assert.equal(c.clips[0].layers![1].name, 'Body');
  const first = c.sprites.find((s) => s.id === c.clips[0].layers![1].frames[0])!;
  assert.deepEqual(first.pixels.slice(0, 4), [1, 16, 8, 255]);
  assert.equal(first.width, 32);
  assert.equal(first.height, 48);
  // The pack's side-facing rows are Right then Left (opposite editor display order).
  // Check every layer for idle and walk so accessories cannot face the other way.
  for (const [direction, sourceRow] of [
    ['Left', 3],
    ['Right', 2],
  ] as const)
    for (const motion of ['idle', 'move'] as const) {
      const clip = c.clips.find((clip) => clip.id === `ranger_${motion}_${direction}`)!;
      for (const layer of clip.layers!) {
        const sprite = c.sprites.find((sprite) => sprite.id === layer.frames[0])!;
        assert.equal(sprite.pixels[2], ((sourceRow + (motion === 'move' ? 4 : 0)) * 64 + 8) % 256);
      }
    }
  assert.throws(
    () => importLayeredCharacter('Bad', 'bad', [source('char_a_p2_0bas_humn_v01.png', 1)]),
    /Pages must match/,
  );
});
test('integer character scaling preserves source pixels, scales feet bounds and deduplicates repeated source cells', () => {
  const pixels = new Uint8Array(512 * 512 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([80, 120, 160, 255], i);
  const sources = [
    { name: 'char_a_p1_0bas_humn_v01.png', sheet: { width: 512, height: 512, pixels } },
  ];
  const imported = importLayeredCharacter('Traveller', 'traveller', sources, { pixelScale: 2 });
  assert.equal(imported.sprites.length, 1);
  assert.deepEqual([imported.node.width, imported.node.height], [64, 96]);
  assert.deepEqual(imported.node.physics!.box, { x: 18, y: 60, width: 28, height: 18 });
  const original = imported.sprites[0];
  const scaled = resizeSprite(original, 64, 96);
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 64; x++) {
      const at = (Math.floor(y / 2) * 32 + Math.floor(x / 2)) * 4;
      assert.deepEqual(
        scaled.pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4),
        original.pixels.slice(at, at + 4),
      );
    }
  assert.equal(original.width, 32);
  const full = importLayeredCharacter('Traveller', 'full', sources, {
    fullCell: true,
    pixelScale: 2,
  });
  assert.deepEqual([full.node.width, full.node.height], [128, 128]);
  assert.deepEqual(full.node.physics!.box, { x: 50, y: 76, width: 28, height: 18 });
});
test('P2 tool swing keeps four directional body/outfit poses on a shared full-cell origin', () => {
  const pixels = new Uint8Array(512 * 512 * 4);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      pixels.set([row + 1, col + 1, 90, 255], ((row * 64 + 12) * 512 + col * 64 + 26) * 4);
  const source = (part: string) => ({
    name: `char_a_p2_${part}_v01.png`,
    sheet: { width: 512, height: 512, pixels },
  });
  const actions = importLayeredToolSwing('Traveller', 'tool', [
    source('5hat_hdpl'),
    source('0bas_humn'),
  ]);
  assert.equal(actions.clips.length, 4);
  const right = actions.clips[3];
  assert.equal(right.loop, false);
  assert.equal(right.frames.length, 4);
  assert.equal(right.layers![0].name, 'Body');
  const frame = actions.sprites.find((s) => s.id === right.frames[3])!;
  assert.deepEqual([frame.width, frame.height], [64, 64]);
  assert.deepEqual(frame.pixels.slice((12 * 64 + 26) * 4, (12 * 64 + 26) * 4 + 4), [3, 4, 90, 255]);
  const left = actions.clips.find((clip) => clip.id === 'tool_attack_Left')!;
  const leftFrame = actions.sprites.find((sprite) => sprite.id === left.frames[3])!;
  assert.deepEqual(
    leftFrame.pixels.slice((12 * 64 + 26) * 4, (12 * 64 + 26) * 4 + 4),
    [4, 4, 90, 255],
  );
  assert.throws(
    () =>
      importLayeredToolSwing('Bad', 'bad', [
        { ...source('0bas_humn'), name: 'char_a_p1_0bas_humn_v01.png' },
      ]),
    /Pages must match/,
  );
});
