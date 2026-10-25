import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextReveal, isTextRevealing, stepTextReveal } from '../src/gameplay/text-reveal';
import { createGameplayDemo } from '../src/gameplay/demo';
import { begin, advance } from '../src/simulation';
import { chooseDialogue, startScript } from '../src/gameplay/runtime';
import { dialogueNodes } from '../src/gameplay/dialogue-view';
import { parseProject } from '../src/model';
import { storyData } from '../src/gameplay/export';
test('text reveal follows simulation time, preserves Unicode code points and supports instant text', () => {
  const text = 'Aé🙂 é!',
    reveal = createTextReveal(text);
  stepTextReveal(text, reveal, 1 / 60);
  assert.equal(reveal.end, 0);
  stepTextReveal(text, reveal, 1 / 60);
  assert.equal(text.slice(0, reveal.end), 'A');
  stepTextReveal(text, reveal, 1 / 30);
  assert.equal(text.slice(0, reveal.end), 'Aé');
  stepTextReveal(text, reveal, 1 / 30);
  assert.equal(text.slice(0, reveal.end), 'Aé🙂');
  stepTextReveal(text, reveal, Number.NaN);
  assert.equal(text.slice(0, reveal.end), 'Aé🙂');
  stepTextReveal(text, reveal, Number.MAX_VALUE);
  assert.equal(reveal.end, text.length);
  assert.equal(isTextRevealing(text, createTextReveal(text, 0)), false);
  const parts = createTextReveal(text, 15),
    whole = createTextReveal(text, 15);
  for (let i = 0; i < 60; i++) stepTextReveal(text, parts, 1 / 60);
  stepTextReveal(text, whole, 1);
  assert.deepEqual(parts, whole);
});
test('confirm reveals once, held input never advances, next press selects; layout stays stable', () => {
  const p = createGameplayDemo(),
    sim = begin(p.scenes[0], p),
    state = sim.gameplay!;
  const frame = (keys = new Set<string>()) =>
    advance(
      sim,
      p,
      keys,
      17,
      () => {},
      () => {},
    );
  startScript(state, p, 'talk', 'scout');
  frame();
  const d = state.dialogue!,
    before = dialogueNodes(state, p);
  assert.equal(d.reveal.end, 0);
  assert.equal(before.find((n) => n.id === 'story_text')!.text, '');
  assert.equal(
    before.some((n) => n.id.startsWith('story_choice_')),
    false,
  );
  assert.match(before.find((n) => n.id === 'story_continue')!.text, /Reveal/);
  frame(new Set(['e']));
  assert.equal(d.reveal.end, d.text.length);
  assert.equal(state.values.quest, 0);
  for (let i = 0; i < 30; i++) frame(new Set(['e']));
  assert.equal(state.dialogue, d);
  assert.equal(state.values.quest, 0);
  const after = dialogueNodes(state, p);
  for (const id of ['story_frame', 'story_continue']) {
    const a = before.find((n) => n.id === id)!,
      b = after.find((n) => n.id === id)!;
    assert.deepEqual([a.x, a.y, a.width, a.height], [b.x, b.y, b.width, b.height]);
  }
  assert.ok(after.some((n) => n.id === 'story_choice_0'));
  frame();
  frame(new Set(['e']));
  assert.equal(state.values.quest, 1);
  assert.notEqual(state.dialogue, d);
  assert.equal(state.dialogue!.reveal.end, 0);
});
test('every page resets its reveal cursor, natural completion advances on one press, speed validates/exports', () => {
  const p = createGameplayDemo(),
    script = p.gameplay!.scripts.find((s) => s.id === 'talk')!;
  script.actions = [
    {
      id: 'message',
      type: 'say',
      speaker: 'Guide',
      text: 'The village has many stories. '.repeat(12),
      textSpeed: 60,
      choices: [],
    },
  ];
  const sim = begin(p.scenes[0], p),
    state = sim.gameplay!;
  const frame = () =>
    advance(
      sim,
      p,
      new Set(),
      17,
      () => {},
      () => {},
    );
  startScript(state, p, 'talk', 'scout');
  frame();
  let d = state.dialogue!;
  assert.ok(d.pages.length > 1);
  chooseDialogue(state, p, 0);
  assert.equal(d.page, 0);
  assert.equal(d.reveal.end, d.text.length);
  chooseDialogue(state, p, 0);
  assert.equal(d.page, 1);
  assert.equal(d.reveal.end, 0);
  for (let i = 0; i < 600 && isTextRevealing(d.text, d.reveal); i++) frame();
  assert.equal(d.reveal.end, d.text.length);
  const page = d.page,
    last = page + 1 === d.pages.length;
  chooseDialogue(state, p, 0);
  if (last) assert.equal(state.dialogue, null);
  else assert.equal(d.page, page + 1);
  const generated = storyData(p, JSON.stringify, () => 'NULL').source.join('\n');
  assert.match(generated, /\.text_speed=60/);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  for (const speed of [-1, 121, 1.5, Number.NaN]) {
    (script.actions[0] as { textSpeed: number }).textSpeed = speed;
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
  (script.actions[0] as { textSpeed: number }).textSpeed = 0;
  assert.match(storyData(p, JSON.stringify, () => 'NULL').source.join('\n'), /\.text_speed=0/);
});
