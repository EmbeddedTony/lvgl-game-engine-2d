#include "lge_melee.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
static lge_engine_t g;
static lge_melee_t pool;
static unsigned hits;
static void event(lge_engine_t *game, lge_event_t e, lge_node_t *node, void *unused) {
    (void)unused;
    if (e != LGE_EVENT_HIT)
        return;
    const lge_melee_hit_t *h = lge_melee_hit(game);
    assert(h && h->attacker == &game->nodes[0] && h->target == node && h->damage == 2);
    assert(game->event_other == h->attacker);
    ++hits;
}
static void tick(unsigned n) {
    for (unsigned i = 0; i < n; i++)
        lge_update(&g, 17);
}
int main(void) {
    const lge_melee_def_t m = {.reach = 24,
                               .width = 20,
                               .windup = 2,
                               .active = 4,
                               .recovery = 3,
                               .damage = 2,
                               .mask = 4,
                               .lock_movement = true};
    const lge_physics_def_t body = {
        .body = LGE_BODY_CHARACTER, .layer = 2, .mask = 1, .world_bounds = true};
    const lge_physics_def_t area = {.body = LGE_BODY_AREA, .layer = 4};
    const lge_node_def_t nodes[] = {{.id = "hero",
                                     .kind = LGE_SPRITE,
                                     .visible = true,
                                     .player = true,
                                     .x = 100,
                                     .y = 100,
                                     .width = 16,
                                     .height = 16,
                                     .speed = 60,
                                     .physics = &body,
                                     .melee = &m},
                                    {.id = "target",
                                     .kind = LGE_SPRITE,
                                     .visible = true,
                                     .x = 120,
                                     .y = 100,
                                     .width = 16,
                                     .height = 16,
                                     .physics = &area},
                                    {.id = "right",
                                     .kind = LGE_BUTTON,
                                     .width = 40,
                                     .height = 40,
                                     .visible = true,
                                     .ui_layer = true,
                                     .input_action = LGE_INPUT_RIGHT},
                                    {.id = "right2",
                                     .kind = LGE_BUTTON,
                                     .width = 40,
                                     .height = 40,
                                     .visible = true,
                                     .ui_layer = true,
                                     .input_action = LGE_INPUT_RIGHT},
                                    {.id = "sword",
                                     .kind = LGE_BUTTON,
                                     .width = 40,
                                     .height = 40,
                                     .visible = true,
                                     .ui_layer = true,
                                     .input_action = LGE_INPUT_ACTION}};
    const lge_camera2d_def_t cam = {
        .world_width = 1600, .world_height = 960, .follow = 1, .follow_y = true};
    const lge_scene_def_t scene = {
        .id = "meadow", .width = 800, .height = 480, .nodes = nodes, .count = 5, .camera2d = &cam};
    lge_init(&g, NULL, event, NULL);
    lge_melee_init(&g, &pool);
    assert(lge_load(&g, &scene));
    // Short virtual taps survive until a fixed step; touch release preserves held keyboard.
    lge_set_input(&g, LGE_INPUT_RIGHT);
    lge_button_input(&g.nodes[4], true);
    lge_button_input(&g.nodes[4], false);
    tick(1);
    assert(lge_melee_active(&g.nodes[0]) && hits == 0);
    float x = g.nodes[0].x;
    tick(7);
    assert(hits == 1 && g.nodes[0].x == x);
    assert(!lge_melee_hit(&g));
    tick(3);
    assert(!lge_melee_active(&g.nodes[0]));
    assert(g.nodes[0].x > x && (lge_input(&g) & LGE_INPUT_RIGHT));
    lge_button_input(&g.nodes[2], true);
    lge_button_input(&g.nodes[3], true);
    lge_set_input(&g, 0);
    lge_button_input(&g.nodes[2], false);
    assert(lge_input(&g) == LGE_INPUT_RIGHT);
    lge_button_input(&g.nodes[3], false);
    assert(lge_input(&g) == 0);
    assert(lge_melee_start(&g.nodes[0]));
    tick(8);
    assert(hits == 2);
    tick(4);
    lge_pause(&g, true);
    assert(!lge_melee_start(&g.nodes[0]));
    lge_button_input(&g.nodes[4], true);
    assert(!lge_input(&g));
    lge_pause(&g, false);
    lge_node_set_position(&g.nodes[0], 1000, 700);
    float cx, cy;
    lge_camera_position(&g, &cx, &cy);
    assert(cx == 608 && cy == 468);
    lge_physics_def_t falling = body;
    falling.motion = LGE_MOTION_PLATFORMER;
    falling.gravity = 600;
    falling.velocity_y = 120;
    lge_node_def_t airborne = nodes[0];
    airborne.physics = &falling;
    lge_scene_def_t air_scene = scene;
    air_scene.nodes = &airborne;
    air_scene.count = 1;
    assert(lge_load(&g, &air_scene));
    lge_set_input(&g, LGE_INPUT_ACTION);
    tick(10);
    assert(g.nodes[0].velocity_y > 210 && g.nodes[0].y > 125);
    lge_melee_def_t world_hit = m;
    world_hit.mask = LGE_LAYER_WORLD;
    lge_node_def_t legacy[2] = {nodes[0], nodes[1]};
    legacy[0].melee = &world_hit;
    legacy[1].physics = NULL;
    legacy[1].solid = true;
    lge_scene_def_t legacy_scene = scene;
    legacy_scene.nodes = legacy;
    legacy_scene.count = 2;
    assert(lge_load(&g, &legacy_scene));
    lge_set_input(&g, LGE_INPUT_ACTION | LGE_INPUT_RIGHT);
    tick(8);
    assert(hits == 3); /* Legacy colliders use the same layer defaults as preview. */
    puts("Melee timing, masks, one hit per swing, touch/keyboard merging and camera passed.");
}
