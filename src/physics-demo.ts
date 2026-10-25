import { createStarter } from './assets';
import { makeNode, type Project } from './model';
import { makePhysics } from './physics';

export function createPhysicsDemo(): Project {
  const p = createStarter();
  p.id = 'physics_playground';
  p.name = 'Physics Playground';
  delete p.flow;
  p.scenes = [
    {
      id: 'playground',
      name: 'Physics playground',
      background: '#202b38',
      music: '',
      objective: '',
      completion: '',
      nodes: [
        makeNode('label', {
          id: 'heading',
          name: 'Heading',
          x: 16,
          y: 14,
          width: 290,
          text: 'PHYSICS PLAYGROUND',
          color: '#dce6f1',
        }),
        makeNode('label', {
          id: 'help',
          name: 'Controls',
          x: 16,
          y: 36,
          width: 290,
          text: 'A/D move  |  Space / Up jump',
          color: '#a3b4c8',
        }),
        makeNode('label', {
          id: 'status',
          name: 'Contact status',
          x: 16,
          y: 58,
          width: 290,
          text: 'Blue body / amber detection areas',
          color: '#e8ba65',
        }),
        makeNode('rect', {
          id: 'floor',
          name: 'Floor',
          x: 0,
          y: 212,
          width: 320,
          height: 28,
          color: '#49634f',
          solid: true,
        }),
        makeNode('rect', {
          id: 'ledge',
          name: 'Lower platform',
          x: 80,
          y: 158,
          width: 76,
          height: 8,
          color: '#49634f',
          solid: true,
        }),
        makeNode('rect', {
          id: 'upper',
          name: 'Upper platform',
          x: 184,
          y: 112,
          width: 74,
          height: 8,
          color: '#49634f',
          solid: true,
        }),
        makeNode('sprite', {
          id: 'player',
          name: 'Player',
          x: 30,
          y: 172,
          width: 24,
          height: 24,
          asset: 'spr_player',
          player: true,
          speed: 100,
          physics: {
            ...makePhysics('character'),
            motion: 'platformer',
            gravity: 800,
            jumpSpeed: 300,
            box: { x: 4, y: 4, width: 16, height: 20 },
          },
        }),
        makeNode('area', {
          id: 'hurtbox',
          name: 'Player hurtbox',
          parent: 'player',
          x: 3,
          y: 3,
          width: 18,
          height: 21,
          physics: { ...makePhysics('area'), layer: 16, mask: 0 },
        }),
        makeNode('rect', {
          id: 'hazard',
          name: 'Hazard artwork',
          x: 205,
          y: 202,
          width: 28,
          height: 10,
          color: '#bb6374',
        }),
        makeNode('area', {
          id: 'hitbox',
          name: 'Hazard hitbox',
          parent: 'hazard',
          x: 0,
          y: 0,
          width: 28,
          height: 10,
          physics: { ...makePhysics('area'), layer: 8, mask: 16 },
          cue: 'cue_pickup',
        }),
        makeNode('area', {
          id: 'checkpoint',
          name: 'Checkpoint trigger',
          x: 214,
          y: 78,
          width: 30,
          height: 34,
          physics: { ...makePhysics('area'), layer: 64, mask: 2 },
        }),
      ],
    },
  ];
  p.code = `#include "ui.h"
#include <stdio.h>
#include <string.h>

void game_on_event(lge_engine_t *game, lge_event_t event, lge_node_t *node, void *user) {
    (void)game; (void)user;
    if(event == LGE_EVENT_AREA_ENTER) {
        const char *other = ui_event_other();
        printf("AREA ENTER %s <- %s\\n", node->definition->id, other ? other : "");
        if(strcmp(node->definition->id, "hitbox") == 0)
            ui_label_set_text("status", "Hitbox detected the player's hurtbox!");
        if(strcmp(node->definition->id, "checkpoint") == 0)
            ui_label_set_text("status", "Checkpoint reached!");
    }
}

void game_on_update(lge_engine_t *game, float dt, void *user) {
    (void)game; (void)dt; (void)user;
    /* Code-driven movement: ui_body_set_velocity("enemy", 60, 0).
     * Ground state: ui_body_is_on_floor("player").
     * Area cues use the same injected audio backend as every other sound. */
}
`;
  return p;
}
