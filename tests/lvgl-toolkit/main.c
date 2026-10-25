#include "ui.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static uint16_t frame[320 * 240];
static uint8_t buffer[320 * 32 * 2];
static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *data) {
    const uint16_t *p = (const uint16_t *)data;
    for (int y = a->y1; y <= a->y2; ++y)
        for (int x = a->x1; x <= a->x2; ++x)
            frame[y * 320 + x] = *p++;
    lv_display_flush_ready(d);
}
static void ticks(unsigned n) {
    for (unsigned i = 0; i < n; ++i) {
        lv_tick_inc(17);
        lv_timer_handler();
    }
}
int main(int argc, char **argv) {
    lv_init();
    lv_display_t *d = lv_display_create(320, 240);
    lv_display_set_color_format(d, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(d, buffer, NULL, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(d, flush);
    assert(ui_init());
    ticks(4);
    const lge_rpg_database_t *db = ui_rpg_database();
    const lge_rpg_actor_def_t *actor = lge_rpg_actor(db, UI_ACTOR_RANGER);
    assert(actor && actor->image && actor->skill_count == 2);
    lge_rpg_stats_t stats;
    assert(lge_rpg_stats(actor, 3, &stats) && stats.hp == 52);
    assert(lge_rpg_item(db, UI_ITEM_POTION)->heal == 20);
    uint8_t level;
    assert(strcmp(lge_rpg_choose(lge_rpg_encounter(db, UI_ENCOUNTER_GROVE), 42, 6, &level),
                  UI_ACTOR_WISP) == 0 &&
           level == 3);
    assert(ui_game()->projectiles == NULL && ui_projectiles_count() == 0);
    lge_node_t *platform = ui_find_node("code_platform"), *player = ui_find_node("player");
    assert(platform && player);
    float x = platform->x;
    assert(x > 24); /* Exported C update hook moves the platform. */
    assert(ui_node_set_position("player", x + 12, platform->y - 16));
    assert(ui_body_set_velocity("player", 0, 0));
    ticks(15);
    assert(platform->x > x + 8 && fabsf(player->x - platform->x - 12) < .01f);
    assert(ui_node_set_speed("player", 100) && player->speed == 100);
    float vx, vy;
    assert(ui_body_velocity("player", &vx, &vy));
    assert(ui_delta_seconds() == 0 && ui_time_seconds() > .2f);
    ui_set_paused(true);
    float t = ui_time_seconds(), px = platform->x;
    ticks(10);
    assert(ui_time_seconds() == t && platform->x == px);
    ui_set_paused(false);
    ui_set_collision_debug(true);
    ticks(2);
    assert(ui_request_scene(UI_SCENE_BULLET_LAB));
    ticks(4);
    assert(ui_game()->projectiles && ui_projectiles_count() == 8);
    lv_obj_t *root = lv_obj_get_parent(ui_find_object("player"));
    lv_obj_t *surface = lv_obj_get_child(root, 2);
    assert(lv_obj_get_width(surface) == 320 && lv_obj_get_height(surface) == 240);
    assert(lv_obj_get_index(ui_find_object("player")) < 2 &&
           lv_obj_get_index(ui_find_object("title")) > 2);
    ticks(90);
    assert(ui_projectiles_count() > 8 && ui_projectiles_count() <= 32);
    unsigned orange = 0;
    /* Confirm emitted color using the port's LVGL conversion, not a host RGB assumption. */
    orange = 0;
    uint16_t color = lv_color_to_u16(lv_color_hex(0xffb86b));
    for (unsigned i = 0; i < 320 * 240; ++i)
        if (frame[i] == color)
            ++orange;
    assert(orange > 8);
    assert(ui_emitter_set_enabled("emitter", false));
    ticks(200);
    assert(ui_projectiles_count() == 0);
    assert(ui_emitter_set_enabled("emitter", true));
    ticks(4);
    assert(ui_projectiles_count() == 8);
    assert(ui_request_scene(UI_SCENE_PLATFORM_LAB));
    ticks(3);
    assert(!ui_game()->projectiles && !ui_projectile_hit());
    assert(ui_request_scene(UI_SCENE_BULLET_LAB));
    ticks(40);
    if (argc > 1) {
        FILE *out = fopen(argv[1], "wb");
        assert(out);
        fprintf(out, "P6\n320 240\n255\n");
        for (unsigned i = 0; i < 320 * 240; ++i) {
            unsigned v = frame[i];
            unsigned char rgb[3] = {(unsigned char)(((v >> 11) & 31) * 255 / 31),
                                    (unsigned char)(((v >> 5) & 63) * 255 / 63),
                                    (unsigned char)((v & 31) * 255 / 31)};
            fwrite(rgb, 1, 3, out);
        }
        fclose(out);
    }
    ui_deinit();
    ui_deinit();
    lv_deinit();
    puts("Toolkit LVGL: canonical export, C update-loop passenger carry, time/speed/velocity API, "
         "flash RPG portraits/stats/encounters, pooled projectile pixels/z-order, pause and scene "
         "allocation/reset passed.");
    return 0;
}
