import type { Project, GameNode } from '../model';
import { makeNode } from '../model';
import type { GameplaySession } from './runtime';
import { isTextRevealing } from './text-reveal';
/** View-only nodes use the normal pixel renderer. They never enter scene/physics/history data. */
export function dialogueNodes(
  s: GameplaySession | undefined,
  p: Pick<Project, 'width' | 'height' | 'gameplay'>,
): GameNode[] {
  const d = s?.dialogue;
  const cutscene = s?.runners.some(
    (r) =>
      r.started &&
      p.gameplay?.scripts.some(
        (x) =>
          x.id === r.script &&
          x.kind === 'cutscene' &&
          x.skipTo &&
          r.pc <= x.actions.findIndex((a) => a.id === x.skipTo),
      ),
  );
  const skip = cutscene
    ? [
        makeNode('button', {
          id: 'story_skip',
          name: 'Skip cutscene',
          layer: 'ui',
          x: p.width - 144,
          y: 68,
          width: 136,
          height: 36,
          color: '#29434b',
          text: 'Skip scene',
        }),
      ]
    : [];
  if (!d) return skip;
  const lines = d.text.split('\n');
  const revealing = isTextRevealing(d.text, d.reveal);
  const body = d.text.slice(0, d.reveal.end),
    height = 84 + lines.length * 18 + d.choices.length * 20,
    y = Math.max(8, d.bottom - height);
  const next = p.gameplay?.scripts.find((script) => script.id === d.runner.script)?.actions[
    d.runner.pc + 1
  ];
  const closes = d.page === d.pages.length - 1 && (!next || next.type === 'end');
  const base: GameNode = {
    id: '',
    name: 'Dialogue',
    kind: 'label',
    layer: 'ui',
    x: 16,
    y,
    width: p.width - 32,
    height: 18,
    color: '#f5f2e9',
    radius: 0,
    text: '',
    asset: '',
    visible: true,
    solid: false,
    player: false,
    collectible: false,
    speed: 0,
    binding: 'none',
    cue: '',
  };
  return [
    ...skip,
    {
      ...base,
      id: 'story_frame',
      kind: 'rect',
      x: 8,
      y,
      width: p.width - 16,
      height,
      color: '#eac887',
    },
    {
      ...base,
      id: 'story_panel',
      kind: 'rect',
      x: 9,
      y: y + 1,
      width: p.width - 18,
      height: height - 2,
      color: '#162432',
    },
    { ...base, id: 'story_speaker', y: y + 6, text: d.speaker, color: '#eac887' },
    { ...base, id: 'story_text', y: y + 26, text: body, height: lines.length * 18 },
    ...(revealing ? [] : d.choices).map((text, i) => ({
      ...base,
      id: `story_choice_${i}`,
      kind: 'button' as const,
      y: y + 30 + lines.length * 18 + i * 20,
      text: `${i === d.selected ? '>' : ' '} ${text}`,
      color: i === d.selected ? '#b8d4d6' : '#7e9b9f',
      height: 18,
    })),
    {
      ...base,
      id: 'story_continue',
      kind: 'button',
      y: y + height - 48,
      height: 40,
      text: `${revealing ? 'Reveal' : d.choices.length ? 'Confirm' : closes ? 'Close' : 'Continue'} (E / Enter)`,
      color: '#29434b',
    },
  ];
}
