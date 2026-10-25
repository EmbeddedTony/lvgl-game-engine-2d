import { createFlowDemo } from './flow-demo';
import { makeNode, type Scene } from './model';
/** Playable composition example: one character, three crystal instances, a HUD,
 * and the same button scene reused across two menu scenes. */
export function createSceneDemo() {
  const p = createFlowDemo();
  p.id = 'project_scene_composition';
  p.name = 'The Little Grove · Scene Composition';
  p.flow!.folders.push({ id: 'folder_shared', name: 'Reusable scenes' });
  const grove = p.scenes[0];
  const source = (id: string, name: string, nodes: Scene['nodes']): Scene => ({
    id,
    name,
    nodes,
    folder: 'folder_shared',
    background: '#18392d',
    objective: '',
    completion: '',
    music: '',
  });
  const player = grove.nodes.find((n) => n.id === 'player')!;
  p.scenes.push(source('scene_character', 'Character', [{ ...player, x: 0, y: 0 }]));
  const crystal = grove.nodes.find((n) => n.collectible)!;
  p.scenes.push(
    source('scene_crystal', 'Crystal', [
      { ...crystal, id: 'gem', name: 'Crystal sprite', x: 0, y: 0 },
    ]),
  );
  const hud = grove.nodes.filter((n) => n.layer === 'ui');
  p.scenes.push(
    source('scene_hud', 'Game HUD', [
      makeNode('group', { id: 'hud_root', name: 'HUD root', x: 0, y: 0, layer: 'ui' }),
      ...hud.map((n) => ({ ...n, parent: 'hud_root' })),
    ]),
  );
  grove.nodes = grove.nodes.flatMap((n) =>
    n.id === 'player'
      ? [
          makeNode('instance', {
            id: 'hero',
            name: 'Hero · Character',
            scene: 'scene_character',
            x: n.x,
            y: n.y,
          }),
        ]
      : n.collectible
        ? [makeNode('instance', { id: n.id, name: n.name, scene: 'scene_crystal', x: n.x, y: n.y })]
        : n.layer === 'ui'
          ? []
          : [n],
  );
  grove.nodes.push(
    makeNode('instance', {
      id: 'hud',
      name: 'HUD · Game HUD',
      scene: 'scene_hud',
      x: 0,
      y: 0,
      layer: 'ui',
      overrides: { title: { text: 'SCENE DEMO' } },
    }),
  );
  p.scenes.push(
    source('scene_action', 'Menu action', [
      makeNode('button', {
        id: 'action',
        name: 'Action button',
        x: 0,
        y: 0,
        width: 160,
        height: 32,
        text: 'Continue',
      }),
    ]),
  );
  for (const menu of p.scenes.filter((s) => s.id === 'scene_title' || s.id === 'scene_results')) {
    menu.nodes = menu.nodes.map((n) =>
      n.kind === 'button'
        ? makeNode('instance', {
            id: n.id,
            name: n.name,
            scene: 'scene_action',
            x: n.x,
            y: n.y,
            layer: 'ui',
            overrides: { action: { text: n.text } },
          })
        : n,
    );
  }
  p.flow!.sequences[0].steps[0].button = 'begin_button/action';
  p.flow!.sequences[0].steps[2].button = 'replay_button/action';
  return p;
}
