import type { Project } from './model';
import { getFlow } from './flow';

export function flowData(p: Project, quote: (s: string) => string) {
  const flow = getFlow(p);
  const index = (id: string) => p.scenes.findIndex((s) => s.id === id);
  const header = `#ifndef GAME_FLOW_DATA_H
#define GAME_FLOW_DATA_H
#include "engine/lge_flow.h"
#include <stddef.h>
#define GAME_SEQUENCE_COUNT ${flow.sequences.length}
#define GAME_ENTRY_SCENE ${flow.entry.kind === 'scene' ? quote(flow.entry.id) : 'NULL'}
#define GAME_ENTRY_SEQUENCE ${flow.entry.kind === 'sequence' ? quote(flow.entry.id) : 'NULL'}
extern const lge_flow_sequence_t game_sequences[${Math.max(1, flow.sequences.length)}];
#endif
`;
  const arrays = flow.sequences
    .map(
      (seq, i) => `static const lge_flow_step_t steps_${i}[${Math.max(1, seq.steps.length)}] = {
${seq.steps.length ? seq.steps.map((step) => `    {.id=${quote(step.id)}, .scene=${index(step.scene)}, .advance=LGE_FLOW_${step.advance.toUpperCase()}, .button=${step.advance === 'click' ? quote(step.button!) : 'NULL'}}`).join(',\n') : '    {0}'}
};`,
    )
    .join('\n');
  const source = `#include "game_flow.h"
#include <stddef.h>
${arrays}
const lge_flow_sequence_t game_sequences[${Math.max(1, flow.sequences.length)}] = {
${flow.sequences.length ? flow.sequences.map((seq, i) => `    {.id=${quote(seq.id)}, .steps=steps_${i}, .count=${seq.steps.length}, .loop=${seq.end === 'loop' ? 'true' : 'false'}, .end_scene=${seq.end === 'scene' ? index(seq.endScene!) : -1}}`).join(',\n') : '    {0}'}
};
`;
  return { header, source };
}
