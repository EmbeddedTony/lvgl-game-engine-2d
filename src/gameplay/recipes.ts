import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay, type Action, type EventScript } from './model';
export type Recipe = 'conversation' | 'chest' | 'door' | 'patrol' | 'battle';
/** Recipes are ordinary editable data. IDs stay local and never leak genre logic into the VM. */
export function installRecipe(p: Project, kind: Recipe): string {
  p.gameplay ??= emptyGameplay();
  const g = p.gameplay;
  if (g.scripts.length >= 512) throw new Error('Maximum 512 scripts.');
  const field = (name: string, type: 'flag' | 'counter' | 'item', initial = 0, max = 999) => {
    if (g.state.length >= 512) throw new Error('Maximum 512 state fields.');
    const id = uid('state');
    g.state.push({
      id,
      name,
      folder: 'Recipes',
      kind: type,
      initial,
      min: 0,
      max: type === 'flag' ? 1 : max,
      persistent: true,
    });
    return id;
  };
  const say = (text: string, choices: { text: string; target: string }[] = []): Action => ({
    id: uid('step'),
    type: 'say',
    speaker: 'Guide',
    text,
    choices,
  });
  const end: Action = { id: uid('step'), type: 'end' };
  let name = '',
    actions: Action[] = [];
  if (kind === 'conversation') {
    name = 'A friendly conversation';
    const yes = say('Then let the adventure begin!');
    actions = [
      say('Will you help the village?', [
        { text: 'Yes, I will.', target: yes.id },
        { text: 'Maybe later.', target: end.id },
      ]),
      yes,
      end,
    ];
  }
  if (kind === 'chest') {
    name = 'Open a chest once';
    const opened = field('Chest opened', 'flag'),
      item = field('Amber key', 'item', 0, 99),
      done = say('The chest is empty.');
    const check: Action = {
      id: uid('step'),
      type: 'branch',
      condition: { key: opened, compare: 'eq', value: 1 },
      yes: done.id,
      no: '',
    };
    actions = [
      check,
      { id: uid('step'), type: 'state', key: item, operation: 'add', value: 1 },
      { id: uid('step'), type: 'state', key: opened, operation: 'set', value: 1 },
      say('You found an amber key!'),
      end,
      done,
    ];
  }
  if (kind === 'door') {
    name = 'Unlock a doorway';
    const item = g.state.find((v) => v.kind === 'item')?.id ?? field('Door key', 'item', 0, 99);
    const locked = say('You need a key to open this door.');
    actions = [
      {
        id: uid('step'),
        type: 'branch',
        condition: { key: item, compare: 'gte', value: 1 },
        yes: '',
        no: locked.id,
      },
      say('The key fits. Beyond lies another room.'),
      {
        id: uid('step'),
        type: 'warp',
        scene: p.scenes.find((s) => s.nodes.some((n) => n.player))?.id ?? p.scenes[0].id,
        x: 32,
        y: 64,
      },
      end,
      locked,
    ];
  }
  if (kind === 'patrol') {
    name = 'Patrol left and right';
    const first: Action = { id: uid('step'), type: 'velocity', node: 'self', x: 32, y: 0 };
    actions = [
      first,
      { id: uid('step'), type: 'wait', ms: 1000 },
      { id: uid('step'), type: 'velocity', node: 'self', x: -32, y: 0 },
      { id: uid('step'), type: 'wait', ms: 1000 },
      { id: uid('step'), type: 'jump', target: first.id },
    ];
  }
  if (kind === 'battle' && g.party && g.rpg?.encounters.length) {
    name = 'Database battle';
    const win = say('Victory!'),
      lose = say('The party was defeated.'),
      escape = say('The party escaped.');
    actions = [
      {
        id: uid('step'),
        type: 'battle',
        encounter: g.rpg.encounters[0].id,
        win: win.id,
        lose: lose.id,
        escape: escape.id,
      },
      win,
      end,
      lose,
      { id: uid('step'), type: 'end' },
      escape,
      { id: uid('step'), type: 'end' },
    ];
  } else if (kind === 'battle') {
    name = 'A small turn-based encounter';
    const hp = field('Encounter HP', 'counter', 3, 3),
      won = field('Encounter resolved', 'flag');
    const menu = say('A wandering spirit blocks your path.');
    const attack: Action = { id: uid('step'), type: 'state', key: hp, operation: 'add', value: -1 };
    const victory = say('The spirit settles. You may pass.');
    const mercy = say('You listen to the spirit. It fades peacefully.');
    menu.type === 'say' &&
      (menu.choices = [
        { text: 'Attack', target: attack.id },
        { text: 'Listen', target: mercy.id },
        { text: 'Leave', target: end.id },
      ]);
    actions = [
      menu,
      attack,
      {
        id: uid('step'),
        type: 'branch',
        condition: { key: hp, compare: 'lt', value: 1 },
        yes: victory.id,
        no: menu.id,
      },
      victory,
      { id: uid('step'), type: 'state', key: won, operation: 'set', value: 1 },
      end,
      mercy,
      { id: uid('step'), type: 'state', key: won, operation: 'set', value: 1 },
    ];
  }
  const s: EventScript = {
    id: uid('script'),
    name,
    folder: kind === 'battle' ? 'Encounters' : 'Interactions',
    blocking: kind !== 'patrol',
    actions,
  };
  g.scripts.push(s);
  return s.id;
}
