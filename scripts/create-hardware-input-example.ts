import { readFile, writeFile } from 'node:fs/promises';
import { parseProject, validate } from '../src/model';
import { useH7Board } from '../src/boards/stm32h7s78';
import { controllerDraft, planController } from '../src/input/hardware/wizard';
import { serializeProject } from '../src/project-file';
const project = parseProject(await readFile('examples/PhysicalControllers.lge.json', 'utf8'));
useH7Board(project);
project.name = 'DK Hardware Inputs · Joystick & Buttons';
const empty = { sources: [], channels: [] };
const plan = planController(empty, controllerDraft(empty));
if (plan.errors.length) throw Error(plan.errors.join('\n'));
project.inputs = plan.config;
project.code = `#include "ui.h"
#include <stdio.h>
void game_on_event(lge_engine_t *game,lge_event_t event,lge_node_t *node,void *user) {
    (void)game;(void)event;(void)node;(void)user;
}
void game_on_update(lge_engine_t *game,float delta_seconds,void *user) {
    (void)game;(void)delta_seconds;(void)user;
    int32_t x=0,y=0;bool pressed=false;
    bool live=ui_input_read_int(UI_CHANNEL_CONTROLLER_X,&x) && ui_input_read_int(UI_CHANNEL_CONTROLLER_Y,&y);
    ui_input_read_bool(UI_CHANNEL_CONTROLLER_BUTTON_1,&pressed);
    char text[96];
    snprintf(text,sizeof(text),"DK joystick | X %ld | Y %ld | B2 %s | %s",(long)x,(long)y,pressed?"pressed":"released",live?"live":"waiting");
    ui_label_set_text(UI_NODE_READOUT,text);
}
`;
const errors = validate(project).filter((i) => i.severity === 'error');
if (errors.length) throw Error(JSON.stringify(errors));
await writeFile('examples/DKHardwareInputs.lge.json', serializeProject(project));
const gpio = controllerDraft(plan.config);
gpio.joystick = false;
project.inputs = planController(plan.config, gpio).config;
project.code =
  '#include "ui.h"\nvoid game_on_event(lge_engine_t*g,lge_event_t e,lge_node_t*n,void*u){(void)g;(void)e;(void)n;(void)u;}\nvoid game_on_update(lge_engine_t*g,float d,void*u){(void)g;(void)d;(void)u;}\n';
await writeFile('.cache/hardware-gpio-only.lge.json', serializeProject(project));
