import { writeFile } from 'node:fs/promises';
import { makeNode, type Project } from '../src/model';
import { addInputPreset, makeInputChannel } from '../src/input/model';
const player = makeNode('rect', 0);
Object.assign(player, {
  id: 'player',
  name: 'Player',
  player: true,
  x: 144,
  y: 112,
  width: 20,
  height: 20,
  speed: 90,
  color: '#91c9a8',
});
const label = makeNode('label', 0);
Object.assign(label, {
  id: 'readout',
  name: 'Sensor readout',
  x: 16,
  y: 16,
  width: 288,
  height: 80,
  text: 'Physical inputs\nConnect a controller or use arrow keys.',
  uiLayer: true,
  color: '#e8eddc',
});
let inputs = addInputPreset({ sources: [], channels: [] }, 'adc');
inputs = addInputPreset(inputs, 'ble');
inputs = addInputPreset(inputs, 'serial');
const temperature = makeInputChannel('temperature', 'adc', 'float');
Object.assign(temperature, {
  name: 'Temperature',
  min: -40,
  center: 20,
  max: 125,
  timeoutMs: 1000,
});
inputs.channels.push(temperature);
const p: Project = {
  version: 1,
  id: 'physical_controllers',
  name: 'Physical Controllers',
  width: 320,
  height: 240,
  colorDepth: 16,
  inputs,
  sprites: [],
  audio: [],
  scenes: [
    {
      id: 'main',
      name: 'Controller lab',
      background: '#18232b',
      objective: '',
      completion: '',
      music: '',
      nodes: [label, player],
    },
  ],
  code: `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *game,lge_event_t event,lge_node_t *node,void *user) {
    (void)game;(void)event;(void)node;(void)user;
}
void game_on_update(lge_engine_t *game,float delta_seconds,void *user) {
    (void)game;(void)delta_seconds;(void)user;
    float value;
    if(ui_input_read_float(UI_CHANNEL_TEMPERATURE,&value)) {
        char text[96];
        if(value < -1000)value=-1000;
        if(value > 1000)value=1000;
        int tenths=(int)(value*10); /* No printf float formatting needed on small MCUs. */
        snprintf(text,sizeof(text),"Controller lab | temperature %d.%d C",tenths/10,tenths<0?-(tenths%10):tenths%10);
        ui_label_set_text(UI_NODE_READOUT,text);
    }
}
`,
};
await writeFile('examples/PhysicalControllers.lge.json', JSON.stringify(p, null, 2) + '\n');
