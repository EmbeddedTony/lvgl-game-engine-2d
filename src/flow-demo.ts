import { createStarter } from './assets';
import { makeNode } from './model';
/** A complete multi-scene example; base starter stays useful for isolated scene tests. */
export function createFlowDemo() {
  const p = createStarter();
  p.id = 'project_journey';
  p.name = 'The Little Grove · Scene Journey';
  p.scenes[0].folder = 'folder_levels';
  p.scenes.push({
    id: 'scene_title',
    name: 'Title',
    folder: 'folder_menus',
    background: '#18392d',
    objective: '',
    completion: '',
    music: '',
    nodes: [
      makeNode('label', {
        id: 'title_heading',
        name: 'Title heading',
        x: 24,
        y: 56,
        width: 280,
        height: 24,
        text: 'THE LITTLE GROVE',
        color: '#d8e8bb',
      }),
      makeNode('label', {
        id: 'title_hint',
        name: 'Title hint',
        x: 24,
        y: 90,
        width: 280,
        height: 40,
        text: 'Find three crystals. Then see your results.',
        color: '#a5c7ae',
      }),
      makeNode('button', {
        id: 'begin_button',
        name: 'Begin adventure',
        x: 80,
        y: 155,
        width: 160,
        height: 32,
        text: 'Begin adventure',
      }),
    ],
  });
  p.scenes.push({
    id: 'scene_results',
    name: 'Results',
    folder: 'folder_menus',
    background: '#18392d',
    objective: '',
    completion: '',
    music: '',
    nodes: [
      makeNode('label', {
        id: 'results_heading',
        name: 'Results heading',
        x: 35,
        y: 60,
        width: 270,
        height: 24,
        text: 'ALL CRYSTALS FOUND!',
        color: '#e2c876',
      }),
      makeNode('label', {
        id: 'results_hint',
        name: 'Results hint',
        x: 35,
        y: 94,
        width: 260,
        height: 36,
        text: 'A complete journey, made of reusable scenes.',
        color: '#a5c7ae',
      }),
      makeNode('button', {
        id: 'replay_button',
        name: 'Play again',
        x: 80,
        y: 155,
        width: 160,
        height: 32,
        text: 'Play again',
      }),
    ],
  });
  p.flow = {
    folders: [
      { id: 'folder_menus', name: 'Menus' },
      { id: 'folder_levels', name: 'Chapter 1' },
    ],
    entry: { kind: 'sequence', id: 'journey' },
    sequences: [
      {
        id: 'journey',
        name: 'Main journey',
        end: 'loop',
        steps: [
          { id: 'step_title', scene: 'scene_title', advance: 'click', button: 'begin_button' },
          { id: 'step_grove', scene: 'grove', advance: 'complete' },
          { id: 'step_results', scene: 'scene_results', advance: 'click', button: 'replay_button' },
        ],
      },
    ],
  };
  return p;
}
