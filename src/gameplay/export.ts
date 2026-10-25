import type { GameNode, Project } from '../model';
import { stateSchema } from './save';
import { emptyGameplay, type Action, type Condition } from './model';
import { DEFAULT_TEXT_SPEED } from './text-reveal';
export function storyData(p: Project, q: (s: string) => string, cue: (s: string) => string) {
  const g = p.gameplay ?? emptyGameplay();
  const condition = (c: Condition) =>
    `{.key=${g.state.findIndex((v) => v.id === c.key)},.compare=LGE_COMPARE_${c.compare.toUpperCase()},.value=${c.value}}`;
  const source = ['#include "engine/lge_story.h"'];
  const hash = stateSchema(p);
  source.push(
    `static const lge_state_def_t story_fields[${Math.max(1, g.state.length)}]={${g.state.map((v) => `{.id=${q(v.id)},.initial=${v.initial},.min=${v.min},.max=${v.max},.persistent=${v.persistent}}`).join(',') || '{0}'}};`,
  );
  g.scripts.forEach((s, si) => {
    const dest = (id: string) => (id ? s.actions.findIndex((a) => a.id === id) : -1);
    const command = (a: Action, ai: number) => {
      switch (a.type) {
        case 'state':
          return `.type=LGE_ACTION_STATE_${a.operation.toUpperCase()},.condition={.key=${g.state.findIndex((v) => v.id === a.key)}},.value=${a.value}`;
        case 'branch':
          return `.type=LGE_ACTION_BRANCH,.condition=${condition(a.condition)},.yes=${dest(a.yes)},.no=${dest(a.no)}`;
        case 'jump':
          return `.type=LGE_ACTION_JUMP,.yes=${dest(a.target)}`;
        case 'wait':
          return `.type=LGE_ACTION_WAIT,.value=${a.ms}`;
        case 'warp':
          return `.type=LGE_ACTION_WARP,.scene=${q(a.scene)},.x=${a.x},.y=${a.y}`;
        case 'visible':
          return `.type=LGE_ACTION_VISIBLE,.node=${q(a.node)},.value=${Number(a.value)}`;
        case 'velocity':
          return `.type=LGE_ACTION_VELOCITY,.node=${q(a.node)},.x=${a.x},.y=${a.y}`;
        case 'move':
          return `.type=LGE_ACTION_MOVE,.node=${q(a.node)},.x=${a.x},.y=${a.y},.value=${a.ms}`;
        case 'camera':
          return `.type=LGE_ACTION_CAMERA,.x=${a.x},.y=${a.y},.value=${a.ms},.yes=${a.mode === 'follow' ? 1 : 0}`;
        case 'checkpoint':
          return `.type=LGE_ACTION_CHECKPOINT,.value=${a.operation === 'save' ? 1 : 0},.yes=${dest(a.success)},.no=${dest(a.failure)}`;
        case 'emitter':
          return `.type=LGE_ACTION_EMITTER,.node=${q(a.node)},.value=${Number(a.enabled)}`;
        case 'sound':
          return `.type=LGE_ACTION_SOUND,.cue=${cue(a.cue)}`;
        case 'battle':
          return `.type=LGE_ACTION_BATTLE,.text=${q(a.encounter)},.yes=${dest(a.win)},.no=${dest(a.lose)},.escape=${dest(a.escape)}`;
        case 'party-rest':
          return '.type=LGE_ACTION_PARTY_REST';
        case 'end':
          return '.type=LGE_ACTION_END';
        case 'say':
          if (a.choices.length)
            source.push(
              `static const lge_choice_t choices_${si}_${ai}[]={${a.choices.map((c) => `{.text=${q(c.text)},.target=${dest(c.target)}}`).join(',')}};`,
            );
          return `.type=LGE_ACTION_SAY,.speaker=${q(a.speaker)},.text=${q(a.text)},.text_speed=${a.textSpeed ?? DEFAULT_TEXT_SPEED},.choices=${a.choices.length ? `choices_${si}_${ai}` : 'NULL'},.choice_count=${a.choices.length}`;
      }
    };
    const actions = s.actions.map((a, ai) => `{${command(a, ai)}}`);
    source.push(
      `static const lge_action_t actions_${si}[${Math.max(1, actions.length)}]={${actions.join(',') || '{0}'}};`,
    );
  });
  source.push(
    `static const lge_script_def_t story_scripts[${Math.max(1, g.scripts.length)}]={${g.scripts.map((s, i) => `{.id=${q(s.id)},.actions=actions_${i},.count=${s.actions.length},.blocking=${s.blocking},.cinematic=${s.kind === 'cutscene'},.skip_to=${s.skipTo ? s.actions.findIndex((a) => a.id === s.skipTo) : -1}}`).join(',') || '{0}'}};`,
  );
  source.push(
    `const lge_story_def_t game_story={.fields=story_fields,.field_count=${g.state.length},.scripts=story_scripts,.script_count=${g.scripts.length},.schema=UINT32_C(${hash})};`,
  );
  function bindings(n: GameNode, name: string) {
    const entries = Object.entries(n.stateBindings ?? {});
    if (!entries.length) return 'NULL';
    source.push(
      `static const struct lge_state_binding ${name}[]={${entries.map(([from, to]) => `{.from=${g.state.findIndex((v) => v.id === from)},.to=${g.state.findIndex((v) => v.id === to)}}`).join(',')}};`,
    );
    return name;
  }
  function events(n: GameNode, name: string) {
    if (!n.events?.length) return 'NULL';
    const pages = n.events.map((e, i) => {
      if (e.when)
        source.push(`static const lge_condition_t ${name}_when_${i}=${condition(e.when)};`);
      return `{.trigger=LGE_TRIGGER_${e.trigger.toUpperCase()},.script=${g.scripts.findIndex((s) => s.id === e.script)},.when=${e.when ? '&' + name + '_when_' + i : 'NULL'}}`;
    });
    source.push(`static const struct lge_event_page ${name}[]={${pages.join(',')}};`);
    return name;
  }
  return { source, events, bindings };
}
