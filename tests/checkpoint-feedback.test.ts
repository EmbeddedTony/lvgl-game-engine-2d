import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointFeedback, checkpointNodes } from '../src/gameplay/checkpoint-feedback';
import { createGameplayDemo } from '../src/gameplay/demo';
import { begin } from '../src/simulation';
import { startScript, stepGameplay, enterGameplay } from '../src/gameplay/runtime';
import { saveState } from '../src/gameplay/save';

test('save feedback waits for presentation and real time, then expires without IO', () => {
  let now = 100;
  const feedback = new CheckpointFeedback(() => now);
  assert.equal(feedback.status, 'none');
  assert.equal(feedback.notify('saving'), false);
  now += 1000;
  assert.equal(feedback.notify('saving'), false, 'simulation catch-up cannot acknowledge a frame');
  feedback.markPresented();
  assert.equal(feedback.notify('saving'), true);
  feedback.notify('saved');
  assert.equal(feedback.status, 'saved');
  now += 2999;
  assert.equal(feedback.status, 'saved');
  now++;
  assert.equal(feedback.status, 'none');
  assert.deepEqual(checkpointNodes(feedback, 800, 480), []);
});

test('repeated saves replace old success; failure never says safe to power off', () => {
  let now = 0;
  const feedback = new CheckpointFeedback(() => now);
  feedback.notify('saved');
  feedback.notify('saving');
  feedback.markPresented();
  now = 159;
  assert.equal(feedback.notify('saving'), false);
  now = 160;
  assert.equal(feedback.notify('saving'), true);
  feedback.notify('failed');
  const nodes = checkpointNodes(feedback, 800, 480);
  assert.match(nodes[1].text, /Not saved/);
  assert.doesNotMatch(nodes[1].text, /Safe to power off/);
  assert.ok(nodes.every((n) => n.layer === 'ui' && n.y >= 78 && n.y + n.height < 240));
  now += 5000;
  assert.equal(feedback.status, 'none');
});

test('actual checkpoint action reports Saved after storage success, keeps packets unchanged, and cancels safely', () => {
  const p = createGameplayDemo();
  p.gameplay!.scripts.push({
    id: 'save_notice',
    name: 'Save',
    folder: '',
    blocking: true,
    actions: [
      { id: 'save', type: 'checkpoint', operation: 'save', success: 'done', failure: 'done' },
      { id: 'done', type: 'end' },
    ],
  });
  const sim = begin(p.scenes[0], p),
    s = sim.gameplay!;
  let now = 0,
    writes = 0;
  s.checkpointFeedback = new CheckpointFeedback(() => now);
  const original = saveState(s, p);
  s.checkpointStore = {
    read: () => null,
    write: (data) => {
      assert.equal(s.checkpointFeedback!.status, 'saving');
      assert.deepEqual(data, original);
      writes++;
    },
  };
  assert.ok(startScript(s, p, 'save_notice'));
  for (let i = 0; i < 60; i++) stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(writes, 0);
  now = 1000;
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(writes, 0);
  s.checkpointFeedback.markPresented();
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(writes, 1);
  assert.equal(s.checkpointFeedback.status, 'saved');
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.ok(startScript(s, p, 'save_notice'));
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(s.checkpointFeedback.status, 'saving');
  enterGameplay(s, p, []);
  assert.equal(s.checkpointFeedback.status, 'failed');
  assert.equal(writes, 1);
});
