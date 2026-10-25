#include "lge.h"
#include "lge_gameplay.h"
#include "lge_melee.h"
#include "lge_story.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

static lge_story_t story;
static unsigned spawns, retires;
static const lge_action_t actions[] = {{.type = LGE_ACTION_WAIT, .value = 5000},
                                       {.type = LGE_ACTION_END}};
static const lge_script_def_t scripts[] = {{.id = "wait", .actions = actions, .count = 2}};
static const lge_story_def_t definition = {.scripts = scripts, .script_count = 1};
static const struct lge_event_page events[] = {{.trigger = LGE_TRIGGER_START, .script = 0}};
static const lge_physics_def_t physics = {.body = LGE_BODY_CHARACTER,
                                          .motion = LGE_MOTION_CODE,
                                          .layer = 2,
                                          .mask = 255,
                                          .velocity_x = 60};
static const lge_melee_def_t sword = {
    .reach = 12, .width = 8, .windup = 2, .active = 2, .recovery = 3, .mask = 255};
#define GROUP(ID, PARENT)                                                                          \
    {.id = ID, .kind = LGE_GROUP, .width = 1, .height = 1, .visible = true, .parent = PARENT}
#define ROOT(ID)                                                                                   \
    {.id = ID,                                                                                     \
     .kind = LGE_INSTANCE,                                                                         \
     .width = 1,                                                                                   \
     .height = 1,                                                                                  \
     .visible = true,                                                                              \
     .parent = 1,                                                                                  \
     .prefab = "slime"}
#define BODY(ID, PARENT)                                                                           \
    {.id = ID,                                                                                     \
     .kind = LGE_SPRITE,                                                                           \
     .width = 16,                                                                                  \
     .height = 16,                                                                                 \
     .x = 2,                                                                                       \
     .y = 3,                                                                                       \
     .visible = true,                                                                              \
     .speed = 72,                                                                                  \
     .physics = &physics,                                                                          \
     .parent = PARENT,                                                                             \
     .melee = &sword,                                                                              \
     .event_pages = events,                                                                        \
     .event_count = 1}
#define LABEL(ID, PARENT)                                                                          \
    {.id = ID,                                                                                     \
     .kind = LGE_LABEL,                                                                            \
     .width = 20,                                                                                  \
     .height = 10,                                                                                 \
     .x = 3,                                                                                       \
     .y = -10,                                                                                     \
     .visible = true,                                                                              \
     .parent = PARENT}
static const lge_node_def_t nodes[] = {
    GROUP("pool", 0), ROOT("slot_a"),         BODY("slot_a/body", 2),   LABEL("slot_a/label", 2),
    ROOT("slot_b"),   BODY("slot_b/body", 5), LABEL("slot_b/label", 5), GROUP("outside", 0)};
static const lge_scene_def_t scene = {
    .id = "level", .width = 320, .height = 240, .nodes = nodes, .count = 8};
static void callback(lge_engine_t *g, lge_event_t e, lge_node_t *n, void *u) {
    (void)u;
    if (e == LGE_EVENT_START)
        lge_story_enter(&story, g);
    if (e == LGE_EVENT_SPAWN) {
        spawns++;
        assert(!lge_prefab_spawn(g, "slime", 0, 0).generation); /* No recursive pool mutation. */
        assert(!lge_load(g, &scene));
        if (n->effective_visible)
            (void)lge_story_signal(&story, g, LGE_TRIGGER_START, n, NULL);
    }
    if (e == LGE_EVENT_DESPAWN) {
        retires++;
        lge_story_forget_node(&story, g, n);
    }
}
int main(void) {
    lge_engine_t g = {0};
    lge_melee_t melee;
    lge_projectiles_t bullets = {.capacity = 8};
    lge_story_init(&story, &definition);
    lge_init(&g, NULL, callback, NULL);
    g.melee = &melee;
    g.projectiles = &bullets;
    assert(lge_load(&g, &scene));
    assert(!g.nodes[1].effective_visible && !g.nodes[2].effective_visible);
    lge_node_set_visible(&g.nodes[1], true);
    assert(!g.nodes[1].effective_visible);
    assert(!lge_prefab_spawn(&g, "slime", NAN, 0).generation);
    assert(!lge_prefab_spawn(&g, "slime", 0, 40000).generation);
    assert(!lge_prefab_spawn(&g, "missing", 0, 0).generation);
    lge_prefab_handle_t first = lge_prefab_spawn(&g, "slime", 100, 90),
                        second = lge_prefab_spawn(&g, "slime", 200, 100);
    assert(first.generation && second.generation && first.index != second.index);
    assert(!lge_prefab_spawn(&g, "slime", 0, 0).generation);
    lge_node_t *body = lge_prefab_node(&g, first, "body");
    assert(body && body->x == 102 && body->y == 93 && body->effective_visible);
    assert(!lge_prefab_node(&g, first, "unknown"));
    assert(lge_prefab_node(&g, first, NULL) == &g.nodes[first.index]);
    lge_update(&g, 100);
    assert(body->x > 102);
    assert(lge_body_set_velocity(body, 900, 100));
    lge_node_set_visible(body, false);
    unsigned index = (unsigned)(body - g.nodes);
    g.area_contacts[index][0] = 255;
    g.area_contacts[7][index / 8] |= (uint8_t)(1u << (index % 8));
    bullets.slots[0] = (lge_projectile_t){.remaining = 1, .owner = (uint16_t)index};
    melee.actors[0].swinging = true;
    melee.actors[0].tick = 5;
    melee.actors[1].hits[0] = 1u << index;
    assert(lge_prefab_despawn(&g, first));
    assert(!lge_prefab_despawn(&g, first));
    assert(!lge_prefab_node(&g, first, "body"));
    assert(!bullets.slots[0].remaining && !melee.actors[0].swinging && !melee.actors[1].hits[0]);
    assert(!g.area_contacts[index][0] && !(g.area_contacts[7][index / 8] & (1u << (index % 8))));
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
        assert(!story.runners[i].script || story.runners[i].owner != index + 1);
    for (unsigned i = 0; i < 200; ++i) {
        lge_prefab_handle_t h = lge_prefab_spawn(&g, "slime", 50, 70);
        assert(h.generation && h.generation != first.generation);
        body = lge_prefab_node(&g, h, "body");
        assert(body && body->x == 52 && body->y == 73 && body->effective_visible &&
               body->velocity_x == 60 && body->velocity_y == 0 && body->speed == 72);
        assert(lge_prefab_despawn(&g, h));
    }
    assert(lge_load(&g, &scene));
    assert(!lge_prefab_node(&g, second, NULL));
    lge_prefab_handle_t after = lge_prefab_spawn(&g, "slime", 10, 20);
    assert(after.generation != second.generation && !lge_prefab_node(&g, second, NULL));
    assert(spawns >= 609 && retires >= 603);
    lge_destroy(&g);
    /* Collection accounting survives retirement and reacquisition. */
    lge_node_def_t pickup_nodes[8];
    memcpy(pickup_nodes, nodes, sizeof(nodes));
    const lge_physics_def_t pickup = {.body = LGE_BODY_AREA, .layer = 32, .mask = 2};
    const lge_physics_def_t player = {
        .body = LGE_BODY_CHARACTER, .layer = 2, .mask = 255, .motion = LGE_MOTION_CODE};
    pickup_nodes[2].collectible = true;
    pickup_nodes[2].physics = &pickup;
    pickup_nodes[2].melee = NULL;
    pickup_nodes[5].collectible = true;
    pickup_nodes[5].physics = &pickup;
    pickup_nodes[5].melee = NULL;
    pickup_nodes[7] = (lge_node_def_t){.id = "player",
                                       .kind = LGE_SPRITE,
                                       .width = 16,
                                       .height = 16,
                                       .visible = true,
                                       .player = true,
                                       .physics = &player,
                                       .x = 52,
                                       .y = 73};
    lge_scene_def_t pickup_scene = scene;
    pickup_scene.nodes = pickup_nodes;
    assert(lge_load(&g, &pickup_scene));
    assert(g.total == 0 && g.score == 0);
    lge_prefab_handle_t pickup_handle = lge_prefab_spawn(&g, "slime", 50, 70);
    assert(g.total == 1);
    lge_update(&g, 17);
    assert(g.score == 1 && g.total == 1);
    assert(lge_prefab_despawn(&g, pickup_handle));
    assert(g.total == 1 && g.score == 1);
    pickup_handle = lge_prefab_spawn(&g, "slime", 200, 100);
    assert(g.total == 2);
    assert(lge_prefab_despawn(&g, pickup_handle));
    assert(g.total == 1 && g.score == 1);
    lge_destroy(&g);
    puts("Prefabs C99/UBSan: bounded slots, full/reset/stale handles, parent-local restore, "
         "motion, contacts, attacks, projectiles, scripts and 200 allocation-free reuses passed.");
}
