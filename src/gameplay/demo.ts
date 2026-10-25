import { createAdventureDemo } from '../examples/topdown-adventure';
import { makeNode, type Project } from '../model';
import { makePhysics } from '../physics';
import type { Action, EventScript } from './model';
const say = (
  id: string,
  speaker: string,
  text: string,
  choices: { text: string; target: string }[] = [],
): Action => ({ id, type: 'say', speaker, text, choices });
const end = (id = 'end'): Action => ({ id, type: 'end' });
const script = (
  id: string,
  name: string,
  folder: string,
  actions: Action[],
  blocking = true,
): EventScript => ({ id, name, folder, actions, blocking });
export function createGameplayDemo(): Project {
  const p = createAdventureDemo();
  p.id = 'gameplay_lab';
  p.name = '2D Gameplay Lab';
  delete p.flow;
  p.scenes = p.scenes.slice(0, 2);
  const [grove, shrine] = p.scenes;
  for (const s of p.scenes) {
    s.nodes = s.nodes.filter((n) => !n.collectible && !['guide', 'counter'].includes(n.id));
    delete s.folder;
    for (const n of s.nodes) {
      if (n.tilemap) n.zIndex = -10;
      if (n.player) n.sortY = true;
    }
    s.objective = 'Explore. E / Enter interacts.';
    s.completion = '';
    s.nodes.find((n) => n.id === 'dialogue_speaker')!.text = '2D GAMEPLAY LAB';
    s.nodes.find((n) => n.id === 'dialogue_text')!.text =
      'WASD move. E / Enter interacts.\nTalk, open a chest, unlock a room.';
  }
  grove.nodes.find((n) => n.id === 'hud_title')!.text = 'THE AMBER KEY';
  shrine.nodes.find((n) => n.id === 'hud_title')!.text = 'THE QUIET SHRINE';
  const npcAsset = p.sprites.find((s) => s.name === 'Mira the scout')?.id ?? p.sprites[0].id;
  const relic = p.sprites.find((s) => s.name === 'Sunstone relic')?.id ?? p.sprites[0].id;
  const event = (id: string, trigger: 'interact' | 'start', script: string) => ({
    id,
    trigger,
    script,
  });
  grove.nodes.push(
    makeNode('sprite', {
      id: 'scout',
      name: 'Mira · quest conversation',
      sortY: true,
      x: 64,
      y: 128,
      width: 16,
      height: 16,
      asset: npcAsset,
      events: [event('talk', 'interact', 'talk')],
    }),
  );
  grove.nodes.push(
    makeNode('sprite', {
      id: 'chest',
      name: 'Key chest · opens once',
      x: 144,
      y: 128,
      width: 16,
      height: 16,
      asset: relic,
      events: [event('open', 'interact', 'chest')],
    }),
  );
  grove.nodes.push(
    makeNode('rect', {
      id: 'door',
      name: 'Shrine entrance · needs key',
      x: 280,
      y: 128,
      width: 16,
      height: 16,
      color: '#c6a666',
      events: [event('unlock', 'interact', 'door')],
    }),
  );
  shrine.nodes.push(
    makeNode('sprite', {
      id: 'spirit',
      name: 'Spirit · turn-based encounter',
      sortY: true,
      x: 96,
      y: 128,
      width: 16,
      height: 16,
      asset: relic,
      events: [
        event('encounter', 'interact', 'encounter'),
        {
          ...event('resolved', 'start', 'hide'),
          when: { key: 'resolved', compare: 'eq', value: 1 },
        },
      ],
    }),
  );
  shrine.nodes.push(
    makeNode('rect', {
      id: 'return_door',
      name: 'Return to grove',
      x: 32,
      y: 128,
      width: 16,
      height: 16,
      color: '#c6a666',
      events: [event('return', 'interact', 'return')],
    }),
  );
  // One source scene, two linked copies, independent opened flags and shared inventory.
  const chest = grove.nodes.find((n) => n.id === 'chest')!;
  grove.nodes = grove.nodes.filter((n) => n.id !== 'chest');
  p.scenes.push({
    id: 'chest_source',
    name: 'Key chest · reusable prop',
    background: grove.background,
    objective: '',
    completion: '',
    music: '',
    nodes: [{ ...chest, id: 'body', x: 0, y: 0 }],
  });
  grove.nodes.push(
    makeNode('instance', {
      id: 'chest',
      name: 'Key chest A · linked',
      scene: 'chest_source',
      x: 144,
      y: 128,
      width: 16,
      height: 16,
    }),
    makeNode('instance', {
      id: 'other_chest',
      name: 'Key chest B · independent save state',
      scene: 'chest_source',
      x: 208,
      y: 128,
      width: 16,
      height: 16,
      overrides: { body: { stateBindings: { chest_opened: 'second_chest_opened' } } },
    }),
  );
  p.gameplay = {
    state: [
      {
        id: 'quest',
        name: 'Help the village',
        folder: 'Quest',
        kind: 'flag',
        initial: 0,
        min: 0,
        max: 1,
        persistent: true,
      },
      {
        id: 'chest_opened',
        name: 'Chest opened',
        folder: 'Quest',
        kind: 'flag',
        initial: 0,
        min: 0,
        max: 1,
        persistent: true,
      },
      {
        id: 'second_chest_opened',
        name: 'Second chest opened',
        folder: 'Quest',
        kind: 'flag',
        initial: 0,
        min: 0,
        max: 1,
        persistent: true,
      },
      {
        id: 'amber_key',
        name: 'Amber key',
        folder: 'Inventory',
        kind: 'item',
        initial: 0,
        min: 0,
        max: 99,
        persistent: true,
      },
      {
        id: 'spirit_hp',
        name: 'Spirit sigils',
        folder: 'Encounter',
        kind: 'counter',
        initial: 3,
        min: 0,
        max: 3,
        persistent: false,
      },
      {
        id: 'resolved',
        name: 'Shrine resolved',
        folder: 'Quest',
        kind: 'flag',
        initial: 0,
        min: 0,
        max: 1,
        persistent: true,
      },
    ],
    scripts: [
      script('talk', 'Mira’s request', 'Quest', [
        say('hello', 'MIRA', 'The old shrine is restless. Will you help?', [
          { text: 'I will help.', target: 'accept' },
          { text: 'Maybe later.', target: 'end' },
        ]),
        { id: 'accept', type: 'state', key: 'quest', operation: 'set', value: 1 },
        say(
          'directions',
          'MIRA',
          'The chest along this path holds an amber key. Take it to the doorway at the east end.',
        ),
        end(),
      ]),
      script('chest', 'One-time amber key', 'World', [
        {
          id: 'check',
          type: 'branch',
          condition: { key: 'chest_opened', compare: 'eq', value: 1 },
          yes: 'empty',
          no: '',
        },
        { id: 'item', type: 'state', key: 'amber_key', operation: 'add', value: 1 },
        { id: 'opened', type: 'state', key: 'chest_opened', operation: 'set', value: 1 },
        { id: 'sound', type: 'sound', cue: 'cue_pickup' },
        say(
          'found',
          'CHEST',
          'You found an amber key! It remains in your inventory when you change rooms.',
        ),
        end(),
        say(
          'empty',
          'CHEST',
          'The chest is empty. Its one-time reward is tracked by a saved quest flag.',
        ),
      ]),
      script('door', 'Locked shrine doorway', 'World', [
        {
          id: 'check',
          type: 'branch',
          condition: { key: 'amber_key', compare: 'gte', value: 1 },
          yes: 'open',
          no: 'locked',
        },
        say('open', 'SHRINE', 'The amber key opens the shrine. Step inside.'),
        { id: 'warp', type: 'warp', scene: shrine.id, x: 48, y: 128 },
        end(),
        say('locked', 'SHRINE', 'The doorway is locked. Search the chest on the village path.'),
      ]),
      script('encounter', 'Talk or act · small encounter', 'Encounter', [
        {
          id: 'check',
          type: 'branch',
          condition: { key: 'resolved', compare: 'eq', value: 1 },
          yes: 'peace',
          no: '',
        },
        { id: 'reset', type: 'state', key: 'spirit_hp', operation: 'set', value: 3 },
        say('menu', 'WANDERING SPIRIT', 'Three sigils hold this spirit here. What will you do?', [
          { text: 'Break a sigil', target: 'attack' },
          { text: 'Listen to the spirit', target: 'mercy' },
          { text: 'Leave it alone', target: 'end' },
        ]),
        { id: 'attack', type: 'state', key: 'spirit_hp', operation: 'add', value: -1 },
        say('hit', 'TRAVELLER', 'One sigil fades.'),
        {
          id: 'health',
          type: 'branch',
          condition: { key: 'spirit_hp', compare: 'eq', value: 0 },
          yes: 'victory',
          no: 'menu',
        },
        say('victory', 'SPIRIT', 'The final sigil breaks. I can rest now.'),
        { id: 'win', type: 'state', key: 'resolved', operation: 'set', value: 1 },
        end(),
        say('mercy', 'SPIRIT', 'You stayed to listen. That was all I needed.'),
        { id: 'spare', type: 'state', key: 'resolved', operation: 'set', value: 1 },
        { id: 'finish', type: 'jump', target: 'end' },
        say('peace', 'TRAVELLER', 'The shrine is peaceful now.'),
      ]),
      script('return', 'Return to the grove', 'World', [
        { id: 'warp', type: 'warp', scene: grove.id, x: 256, y: 128 },
      ]),
      script(
        'hide',
        'Hide resolved spirit on room entry',
        'World',
        [{ id: 'hide', type: 'visible', node: 'self', value: false }],
        false,
      ),
    ],
    animations: [],
  };
  // A second original frame; source pixels stay immutable when animation plays.
  const hero = p.sprites.find((s) => s.id === grove.nodes.find((n) => n.player)!.asset)!;
  const step = { ...hero, id: 'traveller_step', name: 'Traveller step', pixels: [...hero.pixels] };
  for (let x = 4; x < 12; x++)
    for (let c = 0; c < 4; c++) {
      const a = (14 * 16 + x) * 4 + c,
        b = (13 * 16 + x) * 4 + c;
      [step.pixels[a], step.pixels[b]] = [step.pixels[b], step.pixels[a]];
    }
  p.sprites.push(step);
  p.gameplay.animations.push(
    { id: 'hero_idle', name: 'Traveller idle', fps: 6, loop: true, frames: [hero.id] },
    { id: 'hero_walk', name: 'Traveller walk', fps: 8, loop: true, frames: [hero.id, step.id] },
  );
  for (const s of p.scenes) {
    const player = s.nodes.find((n) => n.player);
    if (!player) continue;
    player.animator = { idle: 'hero_idle', move: 'hero_walk', jump: '', fall: '' };
    player.physics = { ...makePhysics('character'), ...player.physics };
  }
  return p;
}
