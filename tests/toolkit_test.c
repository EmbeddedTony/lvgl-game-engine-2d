#include "lge_gameplay.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static lge_engine_t game;
static lge_projectiles_t pool;
static unsigned hits, updates;
static float observed_dt;
static void event(lge_engine_t *g, lge_event_t e, lge_node_t *n, void *user) {
    (void)user;
    if (e == LGE_EVENT_PROJECTILE_HIT) {
        const lge_projectile_t *b = lge_projectile_hit(g);
        assert(n && strcmp(n->definition->id, "player") == 0);
        assert(g->event_other && b && b->pattern->damage == 3);
        assert(b->x <= 14.001f);
        ++hits;
    }
}
static void update(lge_engine_t *g, float dt, void *user) {
    (void)user;
    ++updates;
    observed_dt = dt;
    assert(fabsf(lge_delta_seconds(g) - dt) < .000001f);
    assert(lge_platform_move(lge_find(g, "lift"), 60 * dt, 0));
}
static lge_physics_def_t character = {.body = LGE_BODY_CHARACTER,
                                      .motion = LGE_MOTION_PLATFORMER,
                                      .layer = 2,
                                      .mask = 255,
                                      .gravity = 600,
                                      .jump_speed = 240,
                                      .world_bounds = true};
static lge_physics_def_t up = {.body = LGE_BODY_STATIC, .layer = 1, .mask = 255, .slope = 1};
static lge_physics_def_t down = {.body = LGE_BODY_STATIC, .layer = 1, .mask = 255, .slope = 2};
static lge_physics_def_t platform = {
    .body = LGE_BODY_PLATFORM, .layer = 1, .mask = 255, .velocity_x = 60};
static void steps(unsigned count) {
    for (unsigned i = 0; i < count; ++i)
        lge_physics_step(&game);
}
int main(void) {
    lge_node_def_t nodes[] = {
        {.id = "player",
         .kind = LGE_RECT,
         .x = 20,
         .y = 100,
         .width = 8,
         .height = 12,
         .speed = 60,
         .player = true,
         .visible = true,
         .physics = &character},
        {.id = "flat", .x = 0, .y = 112, .width = 32, .height = 8, .solid = true, .visible = true},
        {.id = "up",
         .x = 32,
         .y = 80,
         .width = 64,
         .height = 32,
         .solid = true,
         .visible = true,
         .physics = &up},
        {.id = "crest",
         .x = 96,
         .y = 80,
         .width = 32,
         .height = 40,
         .solid = true,
         .visible = true},
        {.id = "down",
         .x = 128,
         .y = 80,
         .width = 64,
         .height = 32,
         .solid = true,
         .visible = true,
         .physics = &down},
        {.id = "end",
         .x = 192,
         .y = 112,
         .width = 128,
         .height = 8,
         .solid = true,
         .visible = true}};
    lge_scene_def_t scene = {.id = "lab", .width = 320, .height = 240, .nodes = nodes, .count = 6};
    lge_init(&game, NULL, event, NULL);
    assert(lge_load(&game, &scene));
    steps(1);
    lge_set_input(&game, LGE_INPUT_RIGHT);
    steps(90);
    assert(fabsf(game.nodes[0].x - 110) < .001f && fabsf(game.nodes[0].y - 68) < .001f &&
           game.nodes[0].on_floor);
    steps(100);
    assert(fabsf(game.nodes[0].x - 210) < .001f && fabsf(game.nodes[0].y - 100) < .001f &&
           game.nodes[0].on_floor);
    lge_set_input(&game, LGE_INPUT_ACTION);
    steps(1);
    assert(game.nodes[0].velocity_y < 0 && !game.nodes[0].on_floor);
    nodes[5] = (lge_node_def_t){.id = "low_ceiling",
                                .x = 0,
                                .y = 75,
                                .width = 96,
                                .height = 8,
                                .solid = true,
                                .visible = true};
    assert(lge_load(&game, &scene));
    steps(1);
    lge_set_input(&game, LGE_INPUT_RIGHT);
    steps(90);
    assert(game.nodes[0].y >= 83 && game.nodes[0].x < 72 && game.nodes[0].on_wall);
    /* Same ramp query through RAW8 and RLE tile banks. */
    const void *tiles[] = {NULL};
    const uint8_t cells[] = {1, 1}, slopes[] = {1};
    const uint16_t runs[] = {2, 1};
    lge_tilemap_t map = {.tile_size = 32,
                         .columns = 2,
                         .rows = 1,
                         .tile_count = 1,
                         .tiles = tiles,
                         .cells = cells,
                         .solid_mask = 1,
                         .slopes = slopes};
    nodes[0].x = 36;
    nodes[0].y = 40;
    nodes[1] = (lge_node_def_t){.id = "tiles",
                                .kind = LGE_TILEMAP,
                                .x = 32,
                                .y = 80,
                                .width = 64,
                                .height = 32,
                                .tilemap = &map,
                                .visible = true};
    scene.count = 2;
    for (unsigned codec = 0; codec < 2; ++codec) {
        if (codec) {
            map.cells = NULL;
            map.runs = runs;
            map.run_count = 1;
        }
        assert(lge_load(&game, &scene));
        steps(35);
        assert(fabsf(game.nodes[0].y + 12 - 100) < .001f && game.nodes[0].on_floor);
    }
    nodes[0].x = 30;
    nodes[0].y = 80;
    nodes[0].width = 10;
    nodes[0].height = 10;
    nodes[0].player = false;
    character.motion = LGE_MOTION_CODE;
    nodes[1] = (lge_node_def_t){.id = "lift",
                                .x = 20,
                                .y = 90,
                                .width = 40,
                                .height = 8,
                                .solid = true,
                                .visible = true,
                                .physics = &platform};
    assert(lge_load(&game, &scene));
    steps(30);
    assert(fabsf(game.nodes[0].x - 60) < .001f && game.nodes[0].y == 80);
    assert(lge_body_set_velocity(&game.nodes[0], 0, -200));
    steps(1);
    float x = game.nodes[0].x;
    steps(5);
    assert(game.nodes[0].x == x);
    platform.velocity_x = 0;
    platform.velocity_y = -60;
    nodes[2] = (lge_node_def_t){
        .id = "ceiling", .y = 60, .width = 100, .height = 5, .solid = true, .visible = true};
    scene.count = 3;
    assert(lge_load(&game, &scene));
    steps(60);
    assert(game.nodes[0].y == 65 && game.nodes[1].y == 75);
    /* Direct displacement is safe from on_update; definition positions stay const. */
    scene.count = 2;
    platform.velocity_y = 0;
    assert(lge_load(&game, &scene));
    game.on_update = update;
    lge_update(&game, 100);
    assert(updates == 6 && fabsf(observed_dt - LGE_FIXED_SECONDS) < .000001f);
    assert(fabsf(game.nodes[0].x - 36) < .001f && fabsf(game.nodes[1].x - 26) < .001f);
    assert(fabsf(lge_time_seconds(&game) - .1f) < .000001f && lge_delta_seconds(&game) == 0);
    assert(lge_node_set_speed(&game.nodes[0], 123) && game.nodes[0].speed == 123 &&
           nodes[0].speed == 60);
    assert(!lge_node_set_speed(&game.nodes[0], NAN));
    assert(!lge_platform_move(&game.nodes[1], 21, 0));
    float vx, vy;
    assert(lge_body_velocity(&game.nodes[1], &vx, &vy) && vx == 0 && vy == 0);
    lge_pause(&game, true);
    lge_update(&game, 100);
    assert(updates == 6);
    game.on_update = NULL;
    platform.travel_x = 60;
    platform.travel_y = -30;
    platform.travel_seconds = 1;
    assert(lge_load(&game, &scene));
    steps(1200);
    assert(fabsf(game.nodes[1].x - 20) < .01f && fabsf(game.nodes[1].y - 90) < .01f);
    /* Only a scene using the pool pays its storage; hits are swept and ordered. */
    const lge_pattern_t pattern = {.id = "fan",
                                   .mode = LGE_PATTERN_FAN,
                                   .count = 4,
                                   .radius = 2,
                                   .mask = 2,
                                   .damage = 3,
                                   .speed = 600,
                                   .interval = 1,
                                   .lifetime = 3};
    nodes[0] = (lge_node_def_t){.id = "emitter",
                                .kind = LGE_GROUP,
                                .y = 10,
                                .width = 2,
                                .height = 2,
                                .visible = true,
                                .pattern = &pattern,
                                .emitter_autoplay = true};
    nodes[1] = (lge_node_def_t){.id = "player",
                                .x = 16,
                                .y = 5,
                                .width = 1,
                                .height = 12,
                                .visible = true,
                                .physics = &character};
    character.gravity = 0;
    lge_projectiles_init(&game, &pool, 2);
    assert(lge_load(&game, &scene));
    lge_update(&game, 17);
    assert(lge_projectiles_count(&game) == 2 && pool.dropped == 2);
    lge_update(&game, 34);
    assert(hits == 2 && lge_projectiles_count(&game) == 0 && !lge_projectile_hit(&game) &&
           !game.event_other);
    assert(lge_emitter_set_enabled(&game.nodes[0], false));
    lge_update(&game, 100);
    assert(pool.dropped == 2);
    assert(lge_emitter_set_enabled(&game.nodes[0], true));
    lge_update(&game, 17);
    assert(lge_projectiles_count(&game) == 2);
    game.simulation_blocked = true;
    float remaining = pool.slots[0].remaining;
    lge_update(&game, 100);
    assert(pool.slots[0].remaining == remaining);
    assert(lge_load(&game, &scene));
    assert(lge_projectiles_count(&game) == 0 && pool.dropped == 0);
    lge_pattern_t aimed = pattern;
    aimed.mode = LGE_PATTERN_AIMED;
    aimed.count = 1;
    aimed.mask = 0;
    aimed.speed = 60;
    nodes[0].pattern = &aimed;
    nodes[1].player = true;
    nodes[1].x = 100;
    nodes[1].y = 10;
    nodes[1].width = 2;
    nodes[1].height = 2;
    assert(lge_load(&game, &scene));
    lge_update(&game, 17);
    assert(fabsf(pool.slots[0].vx - 60) < .001f && fabsf(pool.slots[0].vy) < .001f);
    game.on_event = NULL;
    lge_physics_def_t hurt = {.body = LGE_BODY_AREA, .layer = 16, .mask = 8};
    nodes[0] = (lge_node_def_t){
        .id = "player", .width = 2, .height = 2, .visible = true, .physics = &character};
    aimed.mode = LGE_PATTERN_FAN;
    aimed.mask = 16;
    aimed.speed = 600;
    nodes[1] = (lge_node_def_t){.id = "emitter",
                                .kind = LGE_GROUP,
                                .parent = 1,
                                .y = 10,
                                .width = 2,
                                .height = 2,
                                .visible = true,
                                .pattern = &aimed,
                                .emitter_autoplay = true};
    nodes[2] = (lge_node_def_t){.id = "hurtbox",
                                .kind = LGE_AREA,
                                .parent = 1,
                                .x = 12,
                                .y = 5,
                                .width = 1,
                                .height = 12,
                                .visible = true,
                                .physics = &hurt};
    scene.count = 3;
    assert(lge_load(&game, &scene));
    lge_update(&game, 51);
    assert(lge_projectiles_count(&game) == 1 && pool.slots[0].x > 20);
    /* Flash records, integer stat growth, explicit random rolls, bounded lookup. */
    const lge_rpg_actor_def_t actors[] = {{.id = "ranger",
                                           .hp = 40,
                                           .attack = 10,
                                           .defense = 6,
                                           .speed = 8,
                                           .hp_growth = 6,
                                           .attack_growth = 2,
                                           .defense_growth = 1,
                                           .speed_growth = 1}};
    const lge_rpg_skill_t skills[] = {
        {.id = "strike", .power = 8, .accuracy = 95},
        {.id = "mend", .healing = true, .power = 12, .accuracy = 100}};
    const lge_rpg_encounter_entry_t entries[] = {
        {.actor = "ranger", .weight = 100, .min_level = 1, .max_level = 4}};
    const lge_rpg_encounter_t tables[] = {{.id = "grove", .entries = entries, .count = 1}};
    const lge_rpg_database_t db = {.actors = actors,
                                   .actor_count = 1,
                                   .skills = skills,
                                   .skill_count = 2,
                                   .encounters = tables,
                                   .encounter_count = 1};
    lge_rpg_stats_t stats;
    assert(lge_rpg_stats(lge_rpg_actor(&db, "ranger"), 3, &stats));
    assert(stats.hp == 52 && stats.attack == 14 && stats.defense == 8 && stats.speed == 10);
    assert(!lge_rpg_stats(actors, 0, &stats) && !lge_rpg_actor(&db, "missing"));
    assert(lge_rpg_skill_amount(lge_rpg_skill(&db, "strike"), 14, 8, 94) == 18 &&
           lge_rpg_skill_amount(skills, 14, 8, 95) == 0);
    assert(lge_rpg_skill_amount(&skills[1], 9999, 9999, 0) == 12);
    uint8_t level;
    assert(strcmp(lge_rpg_choose(lge_rpg_encounter(&db, "grove"), 42, 6, &level), "ranger") == 0 &&
           level == 3);
    lge_destroy(&game);
    printf("2D Toolkit C99/UBSan: ramps/crest/RAW8/RLE, carry/jump/crush, update-loop "
           "motion/time/speed, bounded swept projectiles, modal/reset and deterministic RPG data "
           "passed. Pool: %zu bytes on host.\n",
           sizeof(pool));
    return 0;
}
