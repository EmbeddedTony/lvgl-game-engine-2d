const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { NativePlaytestService } = require('../../desktop/playtest/service.cjs');
const wait = (check, timeout = 6000) =>
  new Promise((resolve, reject) => {
    const start = Date.now(),
      timer = setInterval(() => {
        try {
          const value = check();
          if (value) {
            clearInterval(timer);
            resolve(value);
          } else if (Date.now() - start > timeout) {
            clearInterval(timer);
            reject(new Error('Playtest condition timed out.'));
          }
        } catch (error) {
          clearInterval(timer);
          reject(error);
        }
      }, 20);
  });
async function fixture(t, code, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lge-runner-'));
  const entries = [];
  async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + '/');
      else entries.push({ path: name, data: await fs.readFile(path.join(dir, entry.name)) });
    }
  }
  await walk(options.generatedRoot ?? '.cache/generated/ui');
  if (code) entries.find((e) => e.path === 'user/game_hooks.c').data = code;
  const events = [];
  const service = new NativePlaytestService({
    sdkRoot: path.resolve('.cache/native-sdk'),
    cacheRoot: root,
    ...options,
    emit: (event) => {
      events.push(event);
      options.onEvent?.(event, service);
    },
  });
  t.after(async () => {
    await service.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  const request = { entries, width: 320, height: 240, target: { kind: 'entry' } };
  return { service, events, request };
}
const customC = `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *g,lge_event_t event,lge_node_t *n,void *user) {
 (void)n;(void)user;
 if(event==LGE_EVENT_START) {printf("AUTHORED C: %s\\n",g->scene->id);ui_label_set_text(UI_NODE_TITLE_HEADING,"RUNNING NATIVE C");}
}
void game_on_update(lge_engine_t *g,float dt,void *user) {(void)g;(void)dt;(void)user;}
`;
test('actual compiled C renders, receives real LVGL clicks/input, pauses, completes audio, restarts and reuses cache', async (t) => {
  const { service, events, request } = await fixture(t, customC);
  const { runId } = await service.start(request);
  await wait(() => events.find((e) => e.kind === 'status' && e.phase === 'running'));
  const frame = await wait(() => events.find((e) => e.kind === 'frame'));
  assert.equal(frame.pixels.length, 320 * 240 * 4);
  assert.ok(frame.pixels.some((v) => v !== 0));
  await new Promise((r) => setTimeout(r, 140));
  assert.equal(
    events.filter((e) => e.kind === 'frame').length,
    1,
    'Only one frame may be in flight.',
  );
  assert.equal(service.control('stale', { op: 'reset' }), false);
  const ack = () => {
    for (const e of events.filter((e) => e.kind === 'frame' && !e.acked)) {
      e.acked = true;
      service.control(runId, { op: 'frame-ack' });
    }
  };
  const acks = setInterval(ack, 10);
  t.after(() => clearInterval(acks));
  ack();
  service.control(runId, { op: 'pointer', x: 160, y: 170, down: true });
  await new Promise((r) => setTimeout(r, 30));
  service.control(runId, { op: 'pointer', x: 160, y: 170, down: false });
  await wait(() => events.find((e) => e.kind === 'game' && e.scene === 'grove'));
  service.control(runId, { op: 'pause', paused: true });
  await wait(() => events.find((e) => e.kind === 'game' && e.paused));
  service.control(runId, { op: 'input', mask: 4 });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(events.findLast((e) => e.kind === 'game').score, 0);
  assert.equal(events.findLast((e) => e.kind === 'game').paused, true);
  service.control(runId, { op: 'pause', paused: false });
  service.control(runId, { op: 'input', mask: 4 });
  await wait(() => events.find((e) => e.kind === 'game' && e.score >= 1));
  const play = await wait(() => events.find((e) => e.kind === 'audio' && e.command.op === 'play'));
  assert.ok(play.command.voice > 0);
  assert.equal(play.command.cue, 'cue_pickup');
  assert.equal(service.control(runId, { op: 'complete', voice: play.command.voice }), true);
  await wait(() => events.find((e) => e.kind === 'log' && e.text.includes('AUTHORED C: grove')));
  await service.stop(runId);
  assert.equal(service.session, null);
  await service.start(request);
  await wait(() =>
    events.find(
      (e) => e.runId !== runId && e.kind === 'status' && e.phase === 'running' && e.cached,
    ),
  );
  await service.stop();
});
test('C errors report source locations and a corrected build can run in the same service', async (t) => {
  const { service, events, request } = await fixture(t, '#include "ui.h"\nvoid game_on_event( {\n');
  await service.start(request);
  const failure = await wait(() => events.find((e) => e.kind === 'status' && e.phase === 'error'));
  assert.ok(failure.diagnostics.some((d) => d.file === 'user/game_hooks.c' && d.line === 2));
  await wait(() => !service.session);
  request.entries.find((e) => e.path === 'user/game_hooks.c').data = customC;
  await service.start(request);
  await wait(() => events.find((e) => e.kind === 'status' && e.phase === 'running'));
  await service.stop();
});
test('a blocking C hook is terminated without hanging the editor service', async (t) => {
  const code =
    '#include "ui.h"\nvoid game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){(void)g;(void)e;(void)n;(void)u;for(;;){}}\nvoid game_on_update(lge_engine_t*g,float d,void*u){(void)g;(void)d;(void)u;}';
  const { service, events, request } = await fixture(t, code, { heartbeatMs: 700 });
  await service.start(request);
  const failure = await wait(() => events.find((e) => e.kind === 'status' && e.phase === 'error'));
  assert.match(failure.message, /stopped responding/);
  await wait(() => !service.session);
});
test('build cancellation and concurrent-start protection leave no child process', async (t) => {
  const { service, request } = await fixture(t, customC);
  const started = await service.start(request);
  await assert.rejects(service.start(request), /Stop|already/);
  await service.stop(started.runId);
  assert.equal(service.session, null);
  await assert.rejects(
    service.start({ ...request, target: { kind: 'scene', id: '../escape' } }),
    /Invalid/,
  );
});

for (const depth of [16, 32])
  test(`odd display dimensions with ${depth}-bit output use the native renderer`, async (t) => {
    const { service, events, request } = await fixture(t, customC);
    request.width = 321;
    request.height = 241;
    const header = request.entries.find((e) => e.path === 'generated/game_data.h');
    header.data = header.data
      .toString()
      .replace('#define GAME_WIDTH 320', '#define GAME_WIDTH 321')
      .replace('#define GAME_HEIGHT 240', '#define GAME_HEIGHT 241')
      .replace('#define GAME_COLOR_DEPTH 16', `#define GAME_COLOR_DEPTH ${depth}`);
    await service.start(request);
    const frame = await wait(() => events.find((e) => e.kind === 'frame'));
    assert.equal(frame.pixels.length, 321 * 241 * 4);
    assert.equal(frame.pixels[3], 255);
    assert.ok(frame.pixels[0] + frame.pixels[1] + frame.pixels[2] > 0);
    await service.stop();
  });

test('audio completion during START is accepted before the first running status', async (t) => {
  const code = `#include "ui.h"
#include <stdio.h>
static const lge_cue_t silent={.id="cue_silent",.uri="none.wav",.sample_rate=8000,.channels=1,.bus=LGE_BUS_SFX,.gain=.2f};
static bool reported;
void game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){(void)n;(void)u;if(e==LGE_EVENT_START)lge_audio_play(g,&silent);}
void game_on_update(lge_engine_t*g,float d,void*u){(void)d;(void)u;if(!reported&&!g->voices[0].handle){reported=true;puts("EARLY AUDIO COMPLETE");}}
`;
  let accepted = false;
  const { service, events, request } = await fixture(t, code, {
    onEvent: (event, runner) => {
      if (event.kind === 'audio' && event.command.op === 'play')
        accepted = runner.control(event.runId, { op: 'complete', voice: event.command.voice });
    },
  });
  await service.start(request);
  await wait(() => events.find((e) => e.kind === 'log' && e.text.includes('EARLY AUDIO COMPLETE')));
  assert.equal(accepted, true);
  await service.stop();
});

test('exported physics runs in LVGL: grounded bodies, child hurtboxes, area hooks, audio and collision overlay', async (t) => {
  const code = `#include "ui.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static bool grounded;
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {
 (void)g;(void)u;
 if(e==LGE_EVENT_START) {
   lge_box_t box; assert(ui_node_bounds("player",&box) && box.width==16);
   assert(!ui_find_object("hurtbox")); assert(strcmp(ui_node_parent("hurtbox"),"player")==0);
 }
 if(e==LGE_EVENT_AREA_ENTER && strcmp(n->definition->id,"hitbox")==0) {
   assert(strcmp(ui_event_other(),"hurtbox")==0);
   assert(ui_area_contains("hitbox","hurtbox"));
   assert(ui_label_set_text("status","HIT CONFIRMED")); puts("HITBOX HIT HURTBOX");
 }
}
void game_on_update(lge_engine_t *g,float dt,void *u) {
 (void)g;(void)dt;(void)u;
 if(!grounded && ui_body_is_on_floor("player")) {grounded=true;puts("PLAYER GROUNDED");}
}
`;
  const { service, events, request } = await fixture(t, code, {
    generatedRoot: '.cache/generated-physics/ui',
  });
  const { runId } = await service.start(request);
  const acks = setInterval(() => {
    for (const e of events.filter((e) => e.kind === 'frame' && !e.acked)) {
      e.acked = true;
      service.control(runId, { op: 'frame-ack' });
    }
  }, 10);
  t.after(() => clearInterval(acks));
  await wait(() => events.find((e) => e.kind === 'log' && e.text.includes('PLAYER GROUNDED')));
  assert.equal(service.control(runId, { op: 'collision-debug', enabled: true }), true);
  const after = events.length;
  await wait(() =>
    events.slice(after).find((e) => e.kind === 'frame' && e.pixels[(212 * 320 + 12) * 4 + 1] > 160),
  );
  assert.throws(
    () => service.control(runId, { op: 'collision-debug', enabled: 'invalid' }),
    /Invalid native playtest control/,
  );
  service.control(runId, { op: 'input', mask: 2 });
  await wait(() => events.find((e) => e.kind === 'log' && e.text.includes('HITBOX HIT HURTBOX')));
  const sound = await wait(() => events.find((e) => e.kind === 'audio' && e.command.op === 'play'));
  assert.equal(sound.command.cue, 'cue_pickup');
  await service.stop();
});

test('live physical input batches reach the real C bank and opt-in telemetry reports timeouts and disconnects', async (t) => {
  const code = `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u){(void)g;(void)e;(void)n;(void)u;}
void game_on_update(lge_engine_t *g,float dt,void *u){(void)dt;(void)u;if(lge_input_pressed(g)&UI_INPUT_ACTION)puts("MONITOR SHORT TAP IN C");}
`;
  const { service, events, request } = await fixture(t, code, {
    generatedRoot: '.cache/generated-inputs/ui',
  });
  const { runId } = await service.start(request);
  await wait(() => events.find((e) => e.kind === 'status' && e.phase === 'running'));
  assert(!events.some((e) => e.kind === 'inputs'));
  assert(service.control(runId, { op: 'input-monitor', enabled: true }));
  assert(
    service.control(runId, {
      op: 'physical-input',
      samples: [
        { channel: 0, type: 'int', value: 4095 },
        { channel: 9, type: 'float', value: 23.5 },
        { channel: 2, type: 'bool', value: false, pulse: true },
      ],
    }),
  );
  await wait(() =>
    events.some(
      (e) =>
        e.kind === 'inputs' &&
        e.channels[0].value === 4095 &&
        e.x === 1 &&
        e.channels[9].value === 23.5,
    ),
  );
  await wait(() =>
    events.some((e) => e.kind === 'log' && e.text.includes('MONITOR SHORT TAP IN C')),
  );
  service.control(runId, {
    op: 'physical-input',
    samples: [{ channel: 2, type: 'bool', value: true }],
  });
  await wait(() => events.some((e) => e.kind === 'inputs' && e.actions & 16));
  service.control(runId, {
    op: 'physical-input',
    samples: [{ channel: 2, type: 'bool', value: false, pulse: true }],
  });
  await wait(() =>
    events.some((e) => e.kind === 'log' && e.text.split('MONITOR SHORT TAP IN C').length >= 4),
  );
  for (const bad of [
    { channel: 0, type: 'int', value: Infinity },
    { channel: 0, type: 'int', value: 1.5 },
    { channel: 0, type: 'float', value: 1e50 },
    { channel: -1, type: 'bool', value: true },
  ])
    assert.throws(
      () => service.control(runId, { op: 'physical-input', samples: [bad] }),
      /Invalid/,
    );
  // C validation rejects a mismatched type atomically, even for well-framed commands.
  assert(
    service.control(runId, {
      op: 'physical-input',
      samples: [
        { channel: 0, type: 'int', value: 0 },
        { channel: 1, type: 'float', value: 10 },
      ],
    }),
  );
  await wait(() => events.filter((e) => e.kind === 'inputs').length >= 2);
  assert(!events.some((e) => e.kind === 'inputs' && e.channels[0].value === 0));
  await wait(() => events.some((e) => e.kind === 'inputs' && !e.channels[0].active && e.x === 0));
  service.control(runId, {
    op: 'physical-input',
    samples: [{ channel: 0, type: 'int', value: 0 }],
  });
  await wait(() => events.some((e) => e.kind === 'inputs' && e.x === -1));
  service.control(runId, { op: 'physical-disconnect', device: 0 });
  await wait(() => events.at(-1)?.kind === 'inputs' && events.at(-1).channels[0].value === null);
  service.control(runId, { op: 'input-monitor', enabled: false });
  await service.stop(runId);
});
