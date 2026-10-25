import { makeNode, type GameNode, type Project, type Scene } from '../../model';
import type { Action, Condition, EventScript } from '../../gameplay/model';
import { makePhysics } from '../../physics';
import { defaultPattern } from '../../gameplay/toolkit';
import {
  chapters,
  opening,
  sideStories,
  endingLines,
  epilogue,
  interludes,
  type Line,
} from './story';
import { makeArea, prop, marker, actor, connectInteractions, SPAWN, type Cast } from './world';
type Beat = Action extends infer A
  ? A extends Action
    ? Omit<A, 'id'> & {
        id?: string;
      }
    : never
  : never;
const say = (speaker: string, text: string, id?: string): Beat => ({
  type: 'say',
  speaker,
  text,
  choices: [],
  ...(id ? { id } : {}),
});
const lines = (text: Line[]): Beat[] => text.map(([speaker, text]) => say(speaker, text));
const set = (key: string, value: number, id?: string): Beat => ({
  type: 'state',
  key,
  value,
  operation: 'set',
  ...(id ? { id } : {}),
});
const add = (key: string, value: number): Beat => ({ type: 'state', key, value, operation: 'add' });
const branch = (
  key: string,
  compare: Condition['compare'],
  value: number,
  yes = '',
  no = '',
): Beat => ({ type: 'branch', condition: { key, compare, value }, yes, no });
const end = (id = 'done'): Beat => ({ type: 'end', id });
const warp = (room: number): Beat => ({ type: 'warp', scene: `area_${room}`, ...SPAWN });
const show = (node: string, value: boolean, id?: string): Beat => ({
  type: 'visible',
  node,
  value,
  ...(id ? { id } : {}),
});
const emit = (node: string, enabled: boolean): Beat => ({ type: 'emitter', node, enabled });
/** One commit at a guarded story boundary, after rewards and before leaving its scene.
 * Keep this ordinary editor data: the storage backend owns atomicity and wear.
 * No timers, new persistent fields or save-format changes are needed. */
function autosave(room: number): Beat[] {
  return [
    set('checkpoint_room', room),
    {
      type: 'checkpoint',
      operation: 'save',
      success: 'autosave_done',
      failure: 'autosave_failed',
    },
    say(
      'AUTOSAVE',
      'Progress could not be saved. Your previous checkpoint is still available. Keep playing and try a REST / SAVE lamp before switching off.',
      'autosave_failed',
    ),
    { type: 'wait', ms: 0, id: 'autosave_done' },
  ];
}
/** Content compiler, not a second runtime. Every quest/cutscene becomes inspectable editor data. */
class Author {
  constructor(readonly p: Project) {}
  state(id: string, name: string, initial = 0, max = 1, folder = 'Campaign') {
    const g = this.p.gameplay!;
    if (!g.state.some((v) => v.id === id))
      g.state.push({
        id,
        name,
        folder,
        kind: max === 1 ? 'flag' : 'counter',
        initial,
        min: 0,
        max,
        persistent: true,
      });
    return id;
  }
  script(
    id: string,
    name: string,
    folder: string,
    beats: Beat[],
    cinematic = false,
    blocking = true,
    skipTo?: string,
  ) {
    const s: EventScript = {
      id,
      name,
      folder,
      blocking,
      actions: beats.map((a, i) => ({ ...a, id: a.id ?? `beat_${i}` }) as Action),
      ...(cinematic ? { kind: 'cutscene' } : {}),
      ...(skipTo ? { skipTo } : {}),
    };
    if (this.p.gameplay!.scripts.some((v) => v.id === id))
      throw new Error('Duplicate script ' + id);
    if (s.actions.length > 128) throw new Error(`${id}: ${s.actions.length} beats exceeds 128`);
    this.p.gameplay!.scripts.push(s);
    return id;
  }
  attach(
    n: GameNode,
    script: string,
    trigger: 'start' | 'interact' | 'hit' | 'click' = 'interact',
  ) {
    (n.events ??= []).push({ id: `${trigger}_${n.events?.length ?? 0}`, trigger, script });
    return n;
  }
}
function healthHud(): Beat[] {
  return Array.from({ length: 8 }, (_, i) => [
    branch('health', 'gte', i + 1, `lit_${i}`, `unlit_${i}`),
    show(`heart_${i}`, true, `lit_${i}`),
    { type: 'jump', target: `next_${i}` } as Beat,
    show(`heart_${i}`, false, `unlit_${i}`),
    { type: 'wait', ms: 0, id: `next_${i}` } as Beat,
  ]).flat();
}
const stage = (x = 520, y = 640): Beat[] => [
  { type: 'camera', mode: 'pan', x: Math.max(0, x - 400), y: Math.max(0, y - 240), ms: 700 },
  { type: 'move', node: 'companion', x: x + 36, y: y - 78, ms: 700 },
];
function interactable(
  a: Author,
  scene: Scene,
  id: string,
  asset: string,
  text: string,
  x: number,
  y: number,
  script: string,
) {
  const n = a.attach(prop(a.p, id, asset, x, y, false), script);
  scene.nodes.push(n, marker(id + '_label', text, x - 20, y - 26, Math.min(280, 2060 - x)));
  return n;
}
function rest(a: Author, scene: Scene, room: number) {
  const beats: Beat[] = [
    set('health', 8),
    set('checkpoint_room', room),
    branch('q_kettle', 'eq', 3, 'tea'),
    branch('q_recipe', 'eq', 3, 'cooked', 'plain'),
    set('tonics', 7, 'tea'),
    { type: 'jump', target: 'refresh' },
    set('tonics', 5, 'cooked'),
    { type: 'jump', target: 'refresh' },
    set('tonics', 3, 'plain'),
    { type: 'wait', ms: 0, id: 'refresh' },
    ...healthHud(),
    { type: 'checkpoint', operation: 'save', success: 'saved', failure: 'no_storage' },
    say(
      'REST LAMP',
      'Warmth returns to your hands. Health and tonics restored. Progress saved. You can use CONTINUE on the title screen next time.',
      'saved',
    ),
    end(),
    say(
      'REST LAMP',
      'Health and tonics restored. Progress could not be saved in this session. Keep the game open until you can save at a lamp.',
      'no_storage',
    ),
    end('failed'),
  ];
  interactable(
    a,
    scene,
    'rest_lamp',
    'pack_lamp',
    'REST / SAVE',
    352,
    608,
    a.script(`rest_${room}`, 'Rest lamp · ' + scene.name, 'System / Checkpoints', beats),
  );
}
function route(
  a: Author,
  scene: Scene,
  room: number,
  destination: number,
  forward: boolean,
  chapterGate = -1,
) {
  const beats: Beat[] = [];
  if (chapterGate >= 0) beats.push(branch('chapter', 'gte', chapterGate, '', 'locked'));
  beats.push(
    warp(destination),
    say(
      'ROAD SIGN',
      'The next road will open after the current chapter is resolved. JOURNAL lists the records, witness and ward you still need.',
      'locked',
    ),
    end(),
  );
  const name = chapters[Math.floor(destination / 4)].places[destination % 4];
  interactable(
    a,
    scene,
    `road_${forward ? 'east' : 'west'}`,
    'pack_sign',
    `${forward ? 'EAST' : 'WEST'} · ${name}`,
    forward ? 1840 : 96,
    588,
    a.script(`road_${room}_${destination}`, 'Travel → ' + name, 'Travel', beats),
  );
}
function ward(a: Author, cast: Cast, scene: Scene, room: number, j: number, boss: boolean) {
  const ci = Math.floor(room / 4),
    id = `ward_${j}`,
    hp = `ward_hp_${room}_${j}`;
  a.state(
    hp,
    `${scene.name} · ward ${j + 1}`,
    boss ? 7 + ci : 3 + Math.floor(ci / 2),
    20,
    'Combat / Wards',
  );
  const n = actor(
    cast,
    boss ? 'warden' : 'rowan',
    id,
    boss ? 'Preservation knot' : 'Repeating ward',
    boss ? 1008 + j * 224 : 992 + j * 448,
    boss ? 696 : 640,
  );
  n.physics = {
    ...makePhysics('area'),
    motion: 'code',
    layer: 4,
    mask: 0,
    box: n.physics!.box,
    velocityX: 0,
    velocityY: 0,
  };
  // Area bodies receive sword overlaps without pushing the player. Scripted velocity uses character bodies.
  n.physics.body = 'character';
  n.physics.mask = 1;
  n.emitter = { pattern: boss ? `knot_${ci % 3}` : `echo_${ci % 3}`, autoplay: false };
  const patrol: Beat[] = [
    branch(hp, 'gte', 1, 'alive', 'dead'),
    show('self', false, 'dead'),
    emit('self', false),
    end('retired'),
    { type: 'wait', ms: 250, id: 'alive' },
  ];
  if (boss) patrol.push(branch(`seal_${ci}`, 'eq', 1, '', 'alive'));
  patrol.push(
    emit('self', true),
    { type: 'velocity', node: 'self', x: boss ? 12 : 24, y: 0, id: 'east' },
    { type: 'wait', ms: boss ? 2400 : 1800 },
    branch(hp, 'lt', 1, 'dead'),
    { type: 'velocity', node: 'self', x: boss ? -12 : -24, y: 0 },
    { type: 'wait', ms: boss ? 2400 : 1800 },
    branch(hp, 'lt', 1, 'dead'),
    { type: 'jump', target: 'east' },
  );
  a.attach(
    n,
    a.script(
      `patrol_${room}_${j}`,
      `${n.name} ${j + 1} · bounded patrol`,
      'Combat / Patrols',
      patrol,
      false,
      false,
    ),
    'start',
  );
  const hit: Beat[] = [
    branch(hp, 'lt', 1, 'done'),
    show(`ward_flash_${j}`, true),
    add(hp, -1),
    branch(hp, 'gte', 1, 'recover', 'defeat'),
    show('self', false, 'defeat'),
    emit('self', false),
    add('wards_released', 1),
    add('tonics', 1),
  ];
  if (boss) hit.push(add(`knots_${ci}`, 1));
  hit.push(
    end(),
    { type: 'wait', ms: 120, id: 'recover' },
    show(`ward_flash_${j}`, false),
    end('recovered'),
  );
  a.attach(
    n,
    a.script(
      `hit_${room}_${j}`,
      `${n.name} ${j + 1} · health / reward`,
      'Combat / Damage',
      hit,
      false,
      false,
    ),
    'hit',
  );
  scene.nodes.push(n);
  scene.nodes.push(
    makeNode('label', {
      id: `ward_flash_${j}`,
      name: 'Sword impact feedback',
      layer: 'world',
      parent: n.id,
      x: -8,
      y: -20,
      width: 100,
      height: 20,
      text: 'CRACK',
      color: '#fff3c7',
      visible: false,
      zIndex: 3,
    }),
  );
}
function sideQuests(a: Author, cast: Cast, scenes: Scene[]) {
  for (const [qi, q] of sideStories.entries()) {
    const key = a.state('q_' + q.id, q.title, 0, 3, 'Quests / Optional');
    const giverScene = scenes[q.chapter * 4];
    const giver = actor(
      cast,
      ['tamsin', 'bram', 'mira', 'bram', 'rowan', 'noor', 'ada', 'warden'][qi],
      `giver_${q.id}`,
      q.giver,
      832 + (qi % 2) * 352,
      864,
    );
    const offer = a.script(`quest_${q.id}`, q.title, 'Quests / ' + q.title, [
      branch(key, 'eq', 3, 'after'),
      branch(key, 'eq', 2, 'deliver'),
      branch(key, 'eq', 1, 'remind'),
      ...lines(q.request),
      {
        type: 'say',
        speaker: q.giver,
        text: 'Will you help?',
        choices: [
          { text: 'I will look for it.', target: 'accept' },
          { text: 'Not yet.', target: 'done' },
        ],
      },
      set(key, 1, 'accept'),
      say(
        'FIELD NOTES',
        `${q.title} added to your journal. Search ${chapters[Math.floor(q.destination / 4)].places[q.destination % 4]}.`,
      ),
      end(),
      say(
        q.giver,
        `I am still looking for the thing we talked about in ${chapters[Math.floor(q.destination / 4)].places[q.destination % 4]}. You can return whenever you are ready.`,
        'remind',
      ),
      end('reminded'),
      { type: 'wait', ms: 0, id: 'deliver' },
      ...lines(q.finish),
      set(key, 3),
      add('witnesses', 1),
      add('tonics', q.id === 'letter' ? 3 : 2),
      ...(q.id === 'tuesday' ? [set('health', 8), ...healthHud()] : []),
      ...autosave(q.chapter * 4),
      say('FIELD NOTES', q.reward),
      end('completed'),
      say(
        q.giver,
        'Thank you for coming back. It matters that this was more than a story you passed through. I will keep my part of the promise.',
        'after',
      ),
      end('after_done'),
    ]);
    a.attach(giver, offer);
    giverScene.nodes.push(
      giver,
      marker(`giver_label_${qi}`, q.giver, giver.x - 12, giver.y - 24, 180),
    );
    const found = a.script(`find_${q.id}`, q.title + ' · discovery', 'Quests / ' + q.title, [
      branch(key, 'eq', 0, 'unasked'),
      branch(key, 'gte', 2, 'already'),
      ...lines(q.find),
      set(key, 2),
      say('FIELD NOTES', `Return to ${q.giver} in ${giverScene.name}.`),
      end(),
      say(
        'FIELD NOTES',
        'Someone in the nearby settlement may be looking for this. You leave it safe until you know who needs it.',
        'unasked',
      ),
      end('unasked_done'),
      say(
        'FIELD NOTES',
        'You have already made a note of this. Its place in the world can remain here.',
        'already',
      ),
      end('already_done'),
    ]);
    interactable(
      a,
      scenes[q.destination],
      `quest_object_${q.id}`,
      qi % 2 ? 'pack_crates' : 'pack_bench',
      `SEARCH · ${q.title}`,
      qi % 2 ? 576 : 1664,
      qi % 2 ? 864 : 864,
      found,
    );
  }
}
function chapterContent(a: Author, cast: Cast, scenes: Scene[], ci: number) {
  const c = chapters[ci],
    base = ci * 4;
  for (const [id, name, max] of [
    [`intro_${ci}`, 'Arrival seen', 1],
    [`witness_${ci}`, 'Witness heard', 1],
    [`records_${ci}`, 'Records found', 3],
    [`seal_${ci}`, 'Seal open', 1],
    [`puzzle_${ci}`, 'Bell progress', 3],
    [`knots_${ci}`, 'Knots released', 3],
  ] as const)
    a.state(id, name, 0, max, c.title);
  for (let j = 0; j < 3; j++)
    a.state(`record_${ci}_${j}`, c.places[j + 1] + ' · record', 0, 1, 'Records');
  const arrival = a.script(
    `arrival_${ci}`,
    c.title + ' · arrival',
    c.title + ' / Cutscenes',
    [
      branch(`intro_${ci}`, 'eq', 1, 'done'),
      ...stage(),
      ...lines(ci === 0 ? opening : c.arrival),
      set(`intro_${ci}`, 1, 'complete'),
      // Later chapters are already saved before their arrival starts. Avoid a
      // second commit for the same transition; a cold load may replay that arrival.
      ...(ci === 0 ? autosave(0) : []),
      end(),
    ],
    true,
    true,
    'complete',
  );
  const start = makeNode('group', {
    id: 'chapter_director',
    name: 'Chapter arrival director',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  a.attach(start, arrival, 'start');
  scenes[base].nodes.push(start);
  const confidence = a.state(
    `confidence_${ci}`,
    'Companion conversation / chosen boundary',
    0,
    2,
    c.title,
  );
  const companionScene = a.script(
    `companion_${ci}`,
    c.title + ' · a smaller conversation',
    c.title + ' / Cutscenes',
    [
      {
        type: 'say',
        speaker: ci >= 3 ? 'ADA' : 'MIRA',
        text: 'What do you need?',
        choices: [
          { text: 'Where should we go next?', target: 'directions' },
          { text: 'Can we talk for a moment?', target: 'personal' },
          { text: 'Tell me about the wards.', target: 'wards' },
          { text: 'Nothing just now.', target: 'done' },
        ],
      },
      say('NEXT ROAD', c.objective, 'directions'),
      end('directions_done'),
      say(
        'THE WARDS',
        'They are repeating preservation instructions. Stay between their volleys; use SWORD close to their feet. Each released ward leaves a tonic. Three larger knots hold each chapter gate. Opening the bells wakes those knots. SAFE RETURN is always available outside a conversation.',
        'wards',
      ),
      end('wards_done'),
      { ...branch(confidence, 'gte', 1, 'again'), id: 'personal' },
      ...stage(),
      ...lines(interludes[ci]),
      {
        type: 'say',
        id: 'decision',
        speaker: ci >= 3 ? 'ADA' : 'MIRA',
        text: 'Would you like company, or a little room?',
        choices: [
          { text: 'Stay with me for a while.', target: 'stay' },
          { text: 'I need some room. Thank you for asking.', target: 'space' },
        ],
      },
      set(confidence, 1, 'stay'),
      say(
        ci >= 3 ? 'ADA' : 'MIRA',
        'Then I will stay. We do not have to turn the silence into an answer.',
      ),
      end(),
      set(confidence, 2, 'space'),
      say(
        ci >= 3 ? 'ADA' : 'MIRA',
        'Of course. I will be nearby. You do not have to make needing space sound like an apology.',
      ),
      end('space_done'),
      say(
        ci >= 3 ? 'ADA' : 'MIRA',
        'I remember what you asked for. You can ask for something different later. The conversation does not have to become another rule we cannot change.',
        'again',
      ),
      end('again_done'),
    ],
    true,
    true,
  ); // Choices remain unskippable; the typewriter can still reveal instantly.
  for (let part = 0; part < 4; part++)
    a.attach(
      scenes[base + part].nodes.find((n) => n.id === 'companion')!,
      companionScene,
    );
  const witnessName = ['ORCHARD KEEPER', 'SERA', 'NOOR', 'ADA', 'FIRST KEEPER', 'TOWN RELAY'][ci];
  const witness = actor(
    cast,
    ['bram', 'tamsin', 'noor', 'ada', 'warden', 'mira'][ci],
    'witness',
    witnessName,
    800,
    640,
  );
  a.attach(
    witness,
    a.script(
      `witness_scene_${ci}`,
      c.title + ' · testimony',
      c.title + ' / Cutscenes',
      [
        branch(`witness_${ci}`, 'eq', 1, 'again'),
        ...stage(800),
        ...lines(ci === 0 ? [...c.arrival, ...c.witness] : c.witness),
        set(`witness_${ci}`, 1, 'complete'),
        ...autosave(base + 1),
        end(),
        say(
          witnessName,
          'You have heard my account. The three records still matter; a story told by one person should not have to carry the weight of everybody’s proof.',
          'again',
        ),
        end('again_done'),
      ],
      true,
      true,
      'complete',
    ),
  );
  scenes[base + 1].nodes.push(
    witness,
    marker('witness_label', witnessName, witness.x - 8, witness.y - 24),
  );
  for (let j = 0; j < 3; j++) {
    const room = base + j + 1;
    const script = a.script(
      `read_${ci}_${j}`,
      c.title + ' · record ' + (j + 1),
      c.title + ' / Records',
      [
        branch(`record_${ci}_${j}`, 'eq', 1, 'read'),
        set(`record_${ci}_${j}`, 1),
        add(`records_${ci}`, 1),
        // Only the third newly collected record commits. The initial read guard
        // bypasses this block on every revisit, even if other state changed.
        branch(`records_${ci}`, 'gte', 3, '', 'read'),
        ...autosave(room),
        say('WITNESS RECORD', c.notes[j], 'read'),
        say('FIELD NOTES', c.puzzleHint),
        end(),
      ],
    );
    interactable(
      a,
      scenes[room],
      'witness_record',
      j === 1 ? 'pack_stonework' : 'pack_crates',
      `RECORD ${j + 1} / 3`,
      j === 1 ? 1536 : 576,
      j === 1 ? 864 : 352,
      script,
    );
  }
  const labels = [
    ['CHILD', 'HOME', 'RIVER'],
    ['ASK', 'VISIT', 'RELEASE'],
    ['TOMORROW', 'NAME', 'WITNESS'],
    ['LISTEN', 'ANSWER', 'CHANGE'],
    ['CONSENT', 'DOUBT', 'WITNESS'],
    ['TOGETHER', 'TOMORROW', 'HERE'],
  ][ci];
  const puzzle: Beat[] = [
    branch(`seal_${ci}`, 'eq', 1, 'open'),
    branch(`records_${ci}`, 'gte', 3, '', 'missing'),
    branch(`witness_${ci}`, 'eq', 1, '', 'missing'),
    {
      type: 'say',
      id: 'choose',
      speaker: 'THREE BELLS',
      text: c.puzzleHint,
      choices: labels.map((text, i) => ({ text, target: `bell_${i + 1}` })),
    },
  ];
  for (let j = 1; j <= 3; j++) {
    puzzle.push(
      {
        ...branch(`puzzle_${ci}`, 'eq', 0, c.puzzle[0] === j ? 'step_1' : 'wrong', `test_${j}`),
        id: `bell_${j}`,
      },
      {
        ...branch(
          `puzzle_${ci}`,
          'eq',
          1,
          c.puzzle[1] === j ? 'step_2' : 'wrong',
          c.puzzle[2] === j ? 'unseal' : 'wrong',
        ),
        id: `test_${j}`,
      },
    );
  }
  puzzle.push(
    set(`puzzle_${ci}`, 1, 'step_1'),
    say('THREE BELLS', 'The first bell answers. Two more. Take your time.'),
    { type: 'jump', target: 'choose' },
    set(`puzzle_${ci}`, 2, 'step_2'),
    say('THREE BELLS', 'The second bell answers. One remains.'),
    { type: 'jump', target: 'choose' },
    set(`puzzle_${ci}`, 0, 'wrong'),
    say(
      'THREE BELLS',
      'The order slips. The bells settle without punishment. Read the sequence again and begin with its first word.',
    ),
    end(),
    say(
      'THREE BELLS',
      'Three witness records and the living witness’s account are required. Look for RECORD markers in each of the three areas, and speak to the witness in the first.',
      'missing',
    ),
    end('missing_done'),
    say(
      'THREE BELLS',
      'The seal is open. Release the three moving preservation knots to the east, then read the chapter record beyond them.',
      'open',
    ),
    end('open_done'),
    { type: 'camera', mode: 'pan', x: 704, y: 400, ms: 900, id: 'unseal' },
    ...lines(c.confrontation),
    set(`seal_${ci}`, 1, 'complete'),
    set(`puzzle_${ci}`, 3),
    ...autosave(base + 3),
    end('opened'),
  );
  interactable(
    a,
    scenes[base + 3],
    'bell_controls',
    'pack_pool',
    'THREE BELLS',
    544,
    568,
    a.script(
      `bells_${ci}`,
      c.title + ' · three-bell seal',
      c.title + ' / Cutscenes',
      puzzle,
      true,
      true,
      undefined,
    ),
  );
  // The puzzle is deliberately not skippable: its choices are gameplay, not a timed scene.
  const resolve: Beat[] = [
    branch('chapter', 'gte', ci + 1, 'again'),
    branch(`seal_${ci}`, 'eq', 1, '', 'locked'),
    branch(`knots_${ci}`, 'gte', 3, '', 'locked'),
    ...stage(1600),
    ...lines(c.resolution),
  ];
  if (ci < 5)
    resolve.push(
      set('chapter', ci + 1, 'complete'),
      add('tonics', 2),
      ...autosave(base + 4),
      warp(base + 4),
    );
  else
    resolve.push(
      { type: 'jump', target: 'decision', id: 'complete' },
      {
        type: 'say',
        id: 'decision',
        speaker: 'DAWN PROCEDURE',
        text: 'No procedure can remove our responsibility. What will Willowlight do at dawn?',
        choices: [
          { text: 'Keep the archive under a public review.', target: 'review' },
          { text: 'Open independent clocks and a right to leave.', target: 'open_check' },
          { text: 'Begin a gradual, accompanied closure.', target: 'close' },
          { text: 'I need to hear the conditions again.', target: 'conditions' },
        ],
      },
      say(
        'ADA',
        'The open procedure needs at least four independent witnesses from the optional town stories. The other two procedures remain available. You may leave, help people and return; nobody is asking you to decide before you are ready.',
        'conditions',
      ),
      { type: 'jump', target: 'decision' },
      { ...branch('witnesses', 'gte', 4, 'open', 'need_witnesses'), id: 'open_check' },
      say(
        'FIRST KEEPER',
        'Independent clocks cannot safely be promised without four people willing to maintain and challenge their anchors. Complete more optional stories, or choose another procedure. You can return without losing the released knots.',
        'need_witnesses',
      ),
      end('leave_decision'),
      set('ending', 1, 'review'),
      ...lines(endingLines.review),
      { type: 'jump', target: 'departure' },
      set('ending', 2, 'open'),
      ...lines(endingLines.open),
      { type: 'jump', target: 'departure' },
      set('ending', 3, 'close'),
      ...lines(endingLines.close),
      set('chapter', 6, 'departure'),
      ...autosave(20),
      { type: 'warp', scene: 'shore', x: 760, y: 546 },
    );
  resolve.push(
    say(
      'FIELD NOTES',
      `The three bells must be opened and all three preservation knots released before ${c.relic} can be read. Look east of the bell controls.`,
      'locked',
    ),
    end('locked_done'),
    say(
      'FIELD NOTES',
      `You keep ${c.relic} with you. The story of this place does not need to start over each time you return.`,
      'again',
    ),
    end('again_done'),
  );
  interactable(
    a,
    scenes[base + 3],
    'chapter_record',
    'pack_stonework',
    c.relic.toUpperCase(),
    1696,
    568,
    a.script(
      `resolution_${ci}`,
      c.title + ' · chapter resolution',
      c.title + ' / Cutscenes',
      resolve,
      true,
      true,
      ci < 5 ? 'complete' : undefined,
    ),
  );
  for (let part = 0; part < 4; part++) {
    const room = base + part,
      scene = scenes[room];
    rest(a, scene, room);
    if (part > 0) route(a, scene, room, room - 1, false);
    else if (ci > 0) route(a, scene, room, room - 1, false);
    if (part < 3) route(a, scene, room, room + 1, true);
    else if (ci < 5) route(a, scene, room, room + 1, true, ci + 1);
    if (part > 0)
      for (let j = 0; j < (part === 3 ? 3 : 2); j++) ward(a, cast, scene, room, j, part === 3);
  }
  a.script(`home_${ci}`, 'Safe return · ' + c.places[0], 'Travel', [
    say(
      'SAFE RETURN',
      'Return to this chapter’s settlement? Defeated wards and quest progress remain. Major milestones autosave; rest at a lamp to save other progress.',
    ),
    {
      type: 'say',
      speaker: 'SAFE RETURN',
      text: 'Choose a route.',
      choices: [
        { text: 'Return to the settlement.', target: 'go' },
        { text: 'Stay here.', target: 'done' },
      ],
    },
    { ...warp(base), id: 'go' },
    end(),
  ]);
}
export function createWillowlightCampaign(source: Project, cast: Cast): Project {
  const p = structuredClone(source);
  p.id = 'willowlight_names_v1';
  p.name = 'Willowlight · The Names We Leave';
  p.code =
    '#include "ui.h"\n/* Campaign gameplay is authored data: inspect Gameplay / Cutscene maker. */\nvoid game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u){(void)g;(void)e;(void)n;(void)u;}\nvoid game_on_update(lge_engine_t *g,float dt,void *u){(void)g;(void)dt;(void)u;}\n';
  p.gameplay = {
    state: [],
    scripts: [],
    animations: p.gameplay!.animations,
    projectileLimit: 48,
    patterns: Array.from({ length: 6 }, (_, i) => ({
      ...defaultPattern((i < 3 ? 'echo_' : 'knot_') + (i % 3)),
      name: i < 3 ? `Echo volley ${i + 1}` : `Preservation spiral ${i - 2}`,
      mode: i % 3 === 0 ? 'aimed' : i % 3 === 1 ? 'fan' : 'ring',
      count: i < 3 ? 3 : 5,
      spread: i % 3 === 0 ? 24 : 100,
      rotation: i < 3 ? 0 : 19,
      speed: i < 3 ? 92 : 108,
      intervalMs: i < 3 ? 1800 : 1450,
      lifetimeMs: 2100,
      radius: 3,
      damage: 1,
      color: i < 3 ? '#eac887' : '#96d5d0',
    })),
  };
  const a = new Author(p);
  a.state('chapter', 'Current chapter', 0, 6);
  a.state('health', 'Health', 8, 8, 'Combat');
  a.state('tonics', 'Amber tonics', 3, 9, 'Inventory');
  p.gameplay!.state.find((v) => v.id === 'tonics')!.kind = 'item';
  p.gameplay!.rpg = {
    items: [
      {
        id: 'amber_tonic',
        name: 'Amber tonic',
        folder: 'Consumables',
        description:
          'Restores three health. Rest lamps refill the bag; released wards leave a tonic behind.',
        icon: '',
        stack: 'tonics',
        price: 0,
        heal: 3,
      },
    ],
    skills: [],
    actors: [],
    encounters: [],
  };
  a.state('checkpoint_room', 'Resume area', 0, 23, 'System');
  a.state('witnesses', 'Independent witnesses', 0, 8);
  a.state('ending', 'Dawn procedure', 0, 3);
  a.state('wards_released', 'Wards released', 0, 999, 'Combat');
  a.state('recoveries', 'Times rescued', 0, 999, 'Combat');
  for (const q of sideStories) a.state('q_' + q.id, q.title, 0, 3, 'Quests / Optional');
  const scenes = Array.from({ length: 24 }, (_, i) => makeArea(p, cast, i));
  // A title scene provides explicit new/continue controls; it does not overwrite an old save.
  const title = structuredClone(scenes[0]);
  title.id = 'title';
  title.name = 'Willowlight · title';
  title.folder = 'system';
  title.nodes = title.nodes.filter((n) => n.layer === 'world');
  title.nodes.find((n) => n.player)!.visible = false;
  for (const n of title.nodes) n.events = [];
  title.nodes.push(
    makeNode('rect', {
      id: 'title_panel',
      layer: 'ui',
      x: 124,
      y: 76,
      width: 552,
      height: 336,
      color: '#162432',
      radius: 6,
    }),
    makeNode('label', {
      id: 'game_title',
      x: 160,
      y: 100,
      width: 500,
      height: 32,
      color: '#eac887',
      text: 'WILLOWLIGHT',
    }),
    makeNode('label', {
      id: 'subtitle',
      x: 160,
      y: 138,
      width: 500,
      height: 24,
      color: '#f5f2e9',
      text: 'THE NAMES WE LEAVE',
    }),
    makeNode('label', {
      id: 'content_note',
      x: 160,
      y: 176,
      width: 480,
      height: 48,
      color: '#b8d4d6',
      text: 'An action RPG about memory, grief and the right to change.\nSix chapters · optional stories · three dawns',
    }),
  );
  const load: Beat[] = [
    { type: 'checkpoint', operation: 'load', success: 'locate', failure: 'missing' },
    { type: 'wait', ms: 0, id: 'locate' },
    branch('chapter', 'gte', 6, 'shore'),
  ];
  for (let room = 0; room < 24; room++)
    load.push(branch('checkpoint_room', 'eq', room, `room_${room}`));
  load.push({ type: 'jump', target: 'missing' });
  for (let room = 0; room < 24; room++) load.push({ ...warp(room), id: `room_${room}` });
  load.push(
    { type: 'warp', scene: 'shore', x: 760, y: 546, id: 'shore' },
    say(
      'CONTINUE',
      'No compatible checkpoint is available. Begin a new journey: major milestones autosave, and REST / SAVE lamps save other progress. Preview and Native LVGL each keep their own persistent slot.',
      'missing',
    ),
    end(),
  );
  a.script('continue', 'Continue from latest checkpoint', 'System / Checkpoints', load);
  a.script('new_journey', 'Begin a new journey', 'System', [warp(0)]);
  a.script(
    'refresh_health',
    'Refresh health display on room entry',
    'Combat / Player',
    [...healthHud(), end()],
    false,
    false,
  );
  a.script('controls', 'Controls and accessibility', 'System', [
    say(
      'CONTROLS',
      'Arrows / WASD: move. SPACE / SWORD: attack. E / Enter / TALK: interact. First press reveals a line; the next advances. Touch controls are optional in Scene settings.',
    ),
    say(
      'CONTROLS',
      'Read RECORD markers. Speak to named witnesses. Bell puzzles have written clues and no penalty for a wrong answer. Major milestones autosave; rest lamps restore health, refill tonics and save other progress. SAFE RETURN keeps quest progress. Falling in combat returns you to the chapter’s settlement.',
    ),
    say(
      'CONTENT NOTE',
      'This story discusses bereavement, coercive care, loss of autonomy and a child’s past death. There is no graphic violence. Cutscenes can be skipped when doing so preserves a choice; dialogue can always be revealed immediately.',
    ),
    end(),
  ]);
  for (const [id, text, y] of [
    ['new_journey', 'NEW JOURNEY', 244],
    ['continue', 'CONTINUE', 294],
    ['controls', 'CONTROLS / CONTENT NOTE', 344],
  ] as const)
    title.nodes.push(
      a.attach(
        makeNode('button', {
          id: 'menu_' + id,
          x: 160,
          y,
          width: 480,
          height: 40,
          text,
          color: '#29434b',
        }),
        id,
        'click',
      ),
    );
  for (let ci = 0; ci < chapters.length; ci++) chapterContent(a, cast, scenes, ci);
  sideQuests(a, cast, scenes);
  const toShore = a.script('shore_road', 'The road to the sea', 'Epilogue', [
    branch('chapter', 'gte', 6, 'sea', 'not_yet'),
    { type: 'warp', id: 'sea', scene: 'shore', x: 760, y: 546 },
    say(
      'THE SHORE ROAD',
      'The road will be here after dawn. There are still people waiting to be heard.',
      'not_yet',
    ),
    end(),
  ]);
  interactable(
    a,
    scenes[20],
    'shore_road',
    'pack_sign',
    'THE SHORE / AFTER DAWN',
    1696,
    864,
    toShore,
  );
  const deathRoute: Beat[] = [];
  for (let ci = 0; ci < 6; ci++) deathRoute.push(branch('chapter', 'eq', ci, `recover_${ci}`));
  deathRoute.push({ ...warp(20), id: 'recover_final' });
  for (let ci = 0; ci < 6; ci++) deathRoute.push({ ...warp(ci * 4), id: `recover_${ci}` });
  a.script(
    'player_hurt',
    'Player · damage, grace period and rescue',
    'Combat / Player',
    [
      add('health', -1),
      ...healthHud(),
      branch('health', 'gte', 1, 'grace', 'rescue'),
      set('health', 8, 'rescue'),
      add('recoveries', 1),
      ...deathRoute,
      show('hurt_hint', true, 'grace'),
      { type: 'wait', ms: 250 },
      show('hurt_hint', false),
      { type: 'wait', ms: 650 },
      end(),
    ],
    false,
    false,
  );
  a.script(
    'drink_tonic',
    'Drink a tonic',
    'Inventory',
    [
      branch('health', 'gte', 8, 'full'),
      branch('tonics', 'gte', 1, '', 'empty'),
      add('health', 3),
      add('tonics', -1),
      ...healthHud(),
      end(),
      say('TONIC BAG', 'Your health is already full. No tonic used.', 'full'),
      end('full_done'),
      say(
        'TONIC BAG',
        'No tonics remain. Release a ward to find another, or rest at a lamp.',
        'empty',
      ),
      end('empty_done'),
    ],
    false,
    false,
  );
  const journal: Beat[] = [
    {
      type: 'say',
      speaker: 'FIELD NOTES',
      text: 'What would you like to review?',
      choices: [
        { text: 'Current chapter and next objective', target: 'main' },
        { text: 'Optional town stories', target: 'side' },
        { text: 'Map / navigation and combat help', target: 'help' },
        { text: 'Close journal', target: 'done' },
      ],
    },
    { type: 'wait', ms: 0, id: 'main' },
  ];
  for (let ci = 0; ci < 6; ci++) journal.push(branch('chapter', 'eq', ci, `chapter_${ci}`));
  journal.push(
    say(
      'FIELD NOTES',
      'Dawn has come. Revisit the settlements for unfinished optional stories. Your choice at the observatory remains part of this save. Rest lamps continue to work.',
    ),
    end('finished'),
  );
  for (let ci = 0; ci < 6; ci++)
    journal.push(
      say(chapters[ci].title, chapters[ci].premise, `chapter_${ci}`),
      say('NEXT OBJECTIVE', chapters[ci].objective),
      say(
        'MAP',
        chapters[ci].places.join(' → ') +
          '. Each area has a west sign near the entrance and an east sign at the far end. The three records are marked clearly; there is one in each area beyond the settlement.',
      ),
      end(`chapter_done_${ci}`),
    );
  journal.push(
    { type: 'jump', target: 'quest_list', id: 'side' },
    say(
      'HELP',
      'Road signs are physical objects: stand close and press TALK. The main road runs east–west through each area. Secondary roads lead to records and optional discoveries. Named NPCs live by the lower path in settlements. Release the three boss knots with your sword after opening their bells. Amber/blue projectiles can be dodged; damage has a short grace period. TONIC restores three health.',
      'help',
    ),
    end('help_done'),
    {
      type: 'say',
      id: 'quest_list',
      speaker: 'TOWN STORIES · 1 / 2',
      text: 'Complete stories by returning to the person who asked. Four independent witnesses enable the open-door dawn procedure.',
      choices: [
        ...sideStories.slice(0, 3).map((q) => ({ text: q.title, target: `q_${q.id}` })),
        { text: 'More stories →', target: 'quest_more' },
      ],
    },
    {
      type: 'say',
      id: 'quest_more',
      speaker: 'TOWN STORIES · 2 / 3',
      text: 'Small promises count.',
      choices: [
        ...sideStories.slice(3, 6).map((q) => ({ text: q.title, target: `q_${q.id}` })),
        { text: 'More stories →', target: 'quest_last' },
      ],
    },
    {
      type: 'say',
      id: 'quest_last',
      speaker: 'TOWN STORIES · 3 / 3',
      text: 'Some stories become available in later chapters.',
      choices: [
        ...sideStories.slice(6).map((q) => ({ text: q.title, target: `q_${q.id}` })),
        { text: 'Close journal', target: 'done' },
      ],
    },
  );
  for (const q of sideStories)
    journal.push(
      { ...branch('q_' + q.id, 'eq', 3, `q_done_${q.id}`), id: `q_${q.id}` },
      branch('q_' + q.id, 'eq', 2, `q_return_${q.id}`),
      say(
        q.title,
        `Speak to ${q.giver} in ${chapters[q.chapter].places[0]}. Search ${chapters[Math.floor(q.destination / 4)].places[q.destination % 4]} for the marked discovery. ${q.reward}`,
      ),
      end(`q_end_${q.id}`),
      say(
        q.title,
        `Discovery found. Return to ${q.giver} in ${chapters[q.chapter].places[0]}.`,
        `q_return_${q.id}`,
      ),
      end(`q_return_end_${q.id}`),
      say(q.title, 'Complete. This promise is part of your testimony at dawn.', `q_done_${q.id}`),
      end(`q_done_end_${q.id}`),
    );
  journal.push(end());
  // Separate journal pages keep each script within the bounded 128-beat authoring limit.
  const sideStart = journal.findIndex((v) => v.id === 'quest_list');
  const sideBody = journal.splice(sideStart);
  // Journal uses a conversation handoff via the same script: retain compact main pages (under cap).
  journal.splice(
    journal.findIndex((v) => v.id === 'side'),
    1,
    {
      type: 'say',
      id: 'side',
      speaker: 'TOWN STORIES',
      text: sideStories
        .map((q) => `${q.title}: ${q.giver} — ${chapters[q.chapter].places[0]}`)
        .join('\n'),
      choices: [],
    },
    end('side_done'),
  );
  journal.push(end());
  // The detailed optional journal is attached to a second button, avoiding recursive VM calls.
  a.script('journal', 'Journal · chapters / route / help', 'System / Journal', journal);
  a.script('side_journal', 'Journal · optional stories / progress', 'System / Journal', sideBody);
  const travel: Beat[] = [
    branch('q_seed', 'eq', 3, 'destinations', 'not_open'),
    {
      type: 'say',
      id: 'destinations',
      speaker: 'GARDEN PATHS',
      text: 'Rowan has marked the old garden routes. Choose a settlement you have reached.',
      choices: [
        { text: chapters[0].places[0], target: 'go_0' },
        { text: chapters[1].places[0], target: 'go_1' },
        { text: chapters[2].places[0], target: 'go_2' },
        { text: 'More destinations', target: 'more' },
      ],
    },
    {
      type: 'say',
      id: 'more',
      speaker: 'GARDEN PATHS',
      text: 'The route remains open in both directions.',
      choices: [
        { text: chapters[3].places[0], target: 'go_3' },
        { text: chapters[4].places[0], target: 'go_4' },
        { text: chapters[5].places[0], target: 'go_5' },
        { text: 'Stay here', target: 'done' },
      ],
    },
    say(
      'GARDEN PATHS',
      'Rowan knows the old garden paths. Help with A Tree Without Witnesses in Bellflower Schoolyard to reopen the settlement shortcuts.',
      'not_open',
    ),
    end(),
    say(
      'GARDEN PATHS',
      'You have not reached this settlement yet. Follow the current chapter’s road first.',
      'not_reached',
    ),
    end('not_reached_done'),
  ];
  for (let ci = 0; ci < 6; ci++)
    travel.push(
      { ...branch('chapter', 'gte', ci, '', 'not_reached'), id: `go_${ci}` },
      warp(ci * 4),
    );
  a.script('garden_routes', 'Garden routes · unlocked settlements', 'Travel', travel);
  for (const scene of scenes) {
    scene.nodes.push(
      a.attach(
        makeNode('button', {
          id: 'town_stories',
          x: 210,
          y: 26,
          width: 136,
          height: 32,
          text: 'TOWN STORIES',
          color: '#29434b',
        }),
        'side_journal',
        'click',
      ),
    );
    scene.nodes.push(
      a.attach(
        makeNode('group', {
          id: 'room_health',
          name: 'Health display director',
          width: 1,
          height: 1,
        }),
        'refresh_health',
        'start',
      ),
    );
    scene.nodes.push(
      a.attach(
        makeNode('button', {
          id: 'garden_routes',
          x: 352,
          y: 26,
          width: 90,
          height: 32,
          text: 'ROUTES',
          color: '#29434b',
        }),
        'garden_routes',
        'click',
      ),
    );
    connectInteractions(scene);
  }
  const shore = structuredClone(scenes[20]);
  shore.id = 'shore';
  shore.name = 'A Shore Without a Name';
  shore.folder = 'epilogue';
  shore.nodes = shore.nodes.filter((n) => !n.events?.some((e) => e.trigger === 'start'));
  // Shore reuses the same native landscape, with an animated waterfront occupying the east.
  const shoreMap = shore.nodes.find((n) => n.tilemap)!.tilemap!;
  const water = shoreMap.tiles.indexOf('v_water') + 1;
  shoreMap.cells = shoreMap.cells.map((v, i) => (i % 64 > 38 ? water : v));
  shore.nodes.find((n) => n.id === 'area_title')!.text = 'A SHORE WITHOUT A NAME';
  shore.nodes.find((n) => n.player)!.x = 760;
  a.state('epilogue_seen', 'Epilogue seen');
  const ep = a.script(
    'epilogue',
    'Epilogue · the door beyond the water',
    'Epilogue / Cutscenes',
    [
      branch('epilogue_seen', 'eq', 1, 'done'),
      ...stage(1000),
      ...lines(epilogue.slice(0, 5)),
      branch('q_chair_keeper', 'eq', 3, '', 'signal'),
      say(
        'FIRST KEEPER · NOTE',
        'There is a chair by the window now. Someone is reading a book I recommended. They do not like it. I thought you would want to know.',
      ),
      { type: 'wait', ms: 0, id: 'signal' },
      ...lines(epilogue.slice(5)),
      set('epilogue_seen', 1, 'complete'),
      ...autosave(20),
      end(),
    ],
    true,
    true,
    'complete',
  );
  const epNode = makeNode('group', {
    id: 'epilogue_director',
    name: 'Epilogue director',
    width: 1,
    height: 1,
  });
  a.attach(epNode, ep, 'start');
  shore.nodes.push(epNode);
  shore.nodes.push(
    a.attach(
      makeNode('group', {
        id: 'room_health',
        name: 'Health display director',
        width: 1,
        height: 1,
      }),
      'refresh_health',
      'start',
    ),
  );
  const shoreReturn = shore.nodes.find((n) => n.id === 'home')!;
  shoreReturn.events = [{ id: 'return', trigger: 'click', script: 'home_5' }];
  // Replace the copied lamp's script with one that saves the epilogue at a legal route checkpoint.
  const copiedLamp = shore.nodes.find((n) => n.id === 'rest_lamp');
  if (copiedLamp) copiedLamp.events = [{ id: 'rest', trigger: 'interact', script: 'rest_20' }];
  connectInteractions(shore);
  p.scenes = [title, ...scenes, shore];
  p.flow = {
    entry: { kind: 'scene', id: 'title' },
    folders: [
      { id: 'system', name: '00 · Start / Continue' },
      ...chapters.map((c) => ({ id: c.id, name: c.title })),
      { id: 'epilogue', name: 'VII · The Shore' },
    ],
    sequences: [],
  };
  return p;
}
