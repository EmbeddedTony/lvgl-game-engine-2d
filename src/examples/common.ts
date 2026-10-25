import { createStarter } from '../assets';
import { makeNode, type GameNode, type Project, type Scene, type TileMap } from '../model';
import { makePhysics } from '../physics';
import { exampleSprites, exampleTiles } from './art';
export function exampleProject(id: string, name: string): Project {
  const p = createStarter();
  p.id = id;
  p.name = name;
  p.pixelPerfect = true;
  p.dimension = '2d';
  delete p.rendering;
  delete p.target;
  delete p.flow;
  p.sprites = exampleSprites();
  p.tilesets = [exampleTiles()];
  p.scenes = [];
  return p;
}
export function terrain(
  p: Project,
  columns: number,
  rows: number,
  cells: number[],
  id = 'terrain',
): GameNode {
  const set = p.tilesets![0];
  const tilemap: TileMap = {
    tileSize: 16,
    columns,
    rows,
    tiles: set.tiles.map((t) => t.id),
    cells,
    solidTiles: set.tiles.flatMap((t, i) => (t.solid ? [i + 1] : [])),
    tileset: set.id,
  };
  return makeNode('tilemap', {
    id,
    name: 'Terrain tilemap',
    x: 0,
    y: 0,
    width: columns * 16,
    height: rows * 16,
    tilemap,
  });
}
export function textbox(speaker: string, message: string): GameNode[] {
  return [
    makeNode('group', {
      id: 'dialogue',
      name: 'Dialogue textbox',
      layer: 'ui',
      x: 8,
      y: 180,
      width: 304,
      height: 56,
    }),
    makeNode('rect', {
      id: 'dialogue_border',
      name: 'Textbox frame',
      parent: 'dialogue',
      layer: 'ui',
      x: 0,
      y: 0,
      width: 304,
      height: 56,
      color: '#cfbf8e',
    }),
    makeNode('rect', {
      id: 'dialogue_panel',
      name: 'Textbox panel',
      parent: 'dialogue',
      layer: 'ui',
      x: 1,
      y: 1,
      width: 302,
      height: 54,
      color: '#263746',
    }),
    makeNode('label', {
      id: 'dialogue_speaker',
      name: 'Textbox speaker',
      parent: 'dialogue',
      x: 10,
      y: 4,
      width: 284,
      height: 16,
      text: speaker,
      color: '#f4ca78',
    }),
    makeNode('label', {
      id: 'dialogue_text',
      name: 'Textbox text',
      parent: 'dialogue',
      x: 10,
      y: 21,
      width: 284,
      height: 34,
      text: message,
      color: '#f3eedc',
    }),
  ];
}
export function hud(title: string, counter: string): GameNode[] {
  return [
    makeNode('rect', {
      id: 'hud_background',
      name: 'HUD background',
      layer: 'ui',
      x: 0,
      y: 0,
      width: 320,
      height: 24,
      color: '#263746',
    }),
    makeNode('label', {
      id: 'hud_title',
      name: 'HUD title',
      x: 10,
      y: 4,
      width: 180,
      height: 18,
      text: title,
      color: '#f3eedc',
    }),
    makeNode('label', {
      id: 'counter',
      name: 'Collectible counter',
      x: 196,
      y: 4,
      width: 118,
      height: 18,
      text: counter,
      binding: 'score',
      color: '#f4ca78',
    }),
  ];
}
export function pickup(id: string, x: number, y: number, relic = false): GameNode {
  return makeNode('sprite', {
    id,
    name: relic ? 'Sunstone relic' : `Spark ${id.replace('spark_', '')}`,
    asset: relic ? 'relic' : 'spark',
    x,
    y,
    width: 16,
    height: 16,
    collectible: true,
    cue: 'cue_pickup',
    physics: {
      ...makePhysics('area'),
      layer: 32,
      mask: 2,
      box: { x: 3, y: 1, width: 10, height: 11 },
    },
  });
}
export function results(name: string, speaker: string, message: string): Scene {
  return {
    id: 'complete',
    name: 'Journey complete',
    folder: 'menus',
    background: '#263746',
    music: '',
    objective: message,
    completion: message,
    nodes: [
      makeNode('label', {
        id: 'ending_title',
        name: 'Ending title',
        x: 36,
        y: 48,
        width: 274,
        height: 24,
        text: name,
        color: '#f4ca78',
      }),
      makeNode('sprite', {
        id: 'ending_relic',
        name: 'Recovered relic',
        x: 152,
        y: 88,
        width: 16,
        height: 16,
        asset: 'relic',
      }),
      makeNode('button', {
        id: 'replay',
        name: 'Play again',
        x: 98,
        y: 126,
        width: 124,
        height: 30,
        text: 'Play again',
      }),
      ...textbox(speaker, message),
    ],
  };
}
export function journey(p: Project, scenes: Scene[]) {
  p.scenes = scenes;
  const used = new Set(scenes.flatMap((s) => s.nodes.map((n) => n.asset)));
  p.sprites = p.sprites.filter((a) => used.has(a.id));
  p.flow = {
    folders: [
      { id: 'levels', name: 'Playable scenes' },
      { id: 'menus', name: 'Menus' },
    ],
    entry: { kind: 'sequence', id: 'journey' },
    sequences: [
      {
        id: 'journey',
        name: 'Complete demo',
        end: 'loop',
        steps: scenes.map((s, i) => ({
          id: `step_${s.id}`,
          scene: s.id,
          advance: i === scenes.length - 1 ? 'click' : 'complete',
          ...(i === scenes.length - 1 ? { button: 'replay' } : {}),
        })),
      },
    ],
  };
}
export const exampleHooks = `#include "ui.h"
/* Built-in movement, tile collision, pickups, camera and scene sequence run in
 * both preview and firmware. No allocation or project parser runs on the MCU.
 * This is the place to add board-independent dialogue/combat/game rules.
 * Resolve audio cue URIs through the normal injected nonblocking audio backend. */
void game_on_event(lge_engine_t *game,lge_event_t event,lge_node_t *node,void *user) {
    (void)game;(void)event;(void)node;(void)user;
}
void game_on_update(lge_engine_t *game,float dt,void *user) {
    (void)game;(void)dt;(void)user;
}
`;
