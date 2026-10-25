#include "ui.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static uint8_t terrain_memory[3 * 1024 * 1024 + 64] __attribute__((aligned(32)));
void test_terrain_cache(void);
static FILE *frame_trace;
static unsigned tile_draw_tasks;
static uint16_t frame[800 * 480];
static uint8_t buffer[800 * 32 * 2];
static lv_indev_data_t pointer;
static void read_pointer(lv_indev_t *device, lv_indev_data_t *data) {
    (void)device;
    data->point = pointer.point;
    data->state = pointer.state;
}
static void touch(lv_indev_t *device, int x, int y, bool held) {
    pointer.point.x = x;
    pointer.point.y = y;
    pointer.state = held ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    lv_indev_read(device);
}
static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *data) {
    const uint16_t *p = (const uint16_t *)data;
    for (int y = a->y1; y <= a->y2; y++)
        for (int x = a->x1; x <= a->x2; x++)
            frame[y * 800 + x] = *p++;
    if (frame_trace && lv_display_flush_is_last(d))
        assert(fwrite(frame, sizeof(frame), 1, frame_trace) == 1);
    lv_display_flush_ready(d);
}
static void count_tile_task(lv_event_t *event) {
    if (lv_draw_task_get_type(lv_event_get_draw_task(event)) == LV_DRAW_TASK_TYPE_IMAGE)
        ++tile_draw_tasks;
}
static void ticks(unsigned n) {
    for (unsigned i = 0; i < n; i++) {
        lv_tick_inc(17);
        lv_timer_handler();
    }
}
static void save_frame(const char *path) {
    FILE *out = fopen(path, "wb");
    assert(out);
    fprintf(out, "P6\n800 480\n255\n");
    for (unsigned i = 0; i < 800 * 480; i++) {
        unsigned v = frame[i];
        unsigned char rgb[3] = {(v >> 11) * 255 / 31, ((v >> 5) & 63) * 255 / 63,
                                (v & 31) * 255 / 31};
        fwrite(rgb, 1, 3, out);
    }
    fclose(out);
}
static lv_obj_t *find_label(lv_obj_t *parent, const char *text) {
    if (lv_obj_check_type(parent, &lv_label_class) && strcmp(lv_label_get_text(parent), text) == 0)
        return parent;
    for (unsigned i = 0; i < lv_obj_get_child_count(parent); ++i) {
        lv_obj_t *found = find_label(lv_obj_get_child(parent, (int32_t)i), text);
        if (found)
            return found;
    }
    return NULL;
}
int main(int argc, char **argv) {
    if (argc > 6) {
        frame_trace = fopen(argv[6], "wb");
        assert(frame_trace);
    }
    lv_init();
    test_terrain_cache();
    lv_display_t *d = lv_display_create(800, 480);
    lv_display_set_color_format(d, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(d, buffer, NULL, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(d, flush);
    lv_indev_t *input = lv_indev_create();
    lv_indev_set_type(input, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(input, read_pointer);
    unsigned display_events = lv_display_get_event_count(d);
    memset(terrain_memory, 0xcd, sizeof(terrain_memory));
    const char *cache_kib = getenv("LGE_TEST_CACHE_KIB");
    unsigned kib = cache_kib ? (unsigned)atoi(cache_kib) : 0;
    assert(kib <= 3072);
    const char *cache_format = getenv("LGE_TEST_CACHE_RGB565");
    lge_tile_cache_config_t cache = {.pixels = terrain_memory + 32, .bytes = kib * 1024u,
        .color_format = cache_format ? LV_COLOR_FORMAT_RGB565 : LV_COLOR_FORMAT_XRGB8888,
        .atlas = getenv("LGE_TEST_CACHE_ATLAS") != NULL};
    ui_config_t config = {.terrain_cache = kib ? &cache : NULL,
        .sync_to_refresh = getenv("LGE_TEST_REFRESH_SYNC") != NULL};
    assert(ui_init_with_config(&config));
    lv_obj_t *terrain = ui_find_object("terrain");
    assert(terrain);
    bool faded = getenv("LGE_TEST_CACHE_FADE") != NULL;
    if (faded) lv_obj_set_style_opa(lv_obj_get_parent(terrain), 200, 0);
#if LVGL_VERSION_MINOR >= 6
    lv_obj_set_send_draw_task_events(terrain, true);
#else
    lv_obj_add_flag(terrain, LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS);
#endif
    lv_obj_add_event_cb(terrain, count_tile_task, LV_EVENT_DRAW_TASK_ADDED, NULL);
    ticks(4);
    lge_node_t *hero = ui_find_node("player");
    assert(hero && ui_game()->melee);
    const lv_image_dsc_t *hero_image = hero->image;
    assert(hero_image->header.cf == LV_COLOR_FORMAT_ARGB8888);
    assert((uintptr_t)hero_image->data % 16 == 0);
    const lv_image_dsc_t *ground_image = ui_find_node("terrain")->definition->tilemap->tiles[0];
    assert(ground_image && (ground_image->header.cf == LV_COLOR_FORMAT_ARGB8888 || ground_image->header.cf == LV_COLOR_FORMAT_XRGB8888));
    assert((uintptr_t)ground_image->data % 16 == 0);
    /* This unobstructed grass cell is checked against the cooked source, pixel by
     * pixel. Country Woods' one-pixel texture must survive actual RGB565 drawing. */
    float initial_cx, initial_cy;
    lge_camera_position(ui_game(), &initial_cx, &initial_cy);
    int tile_x = 33 * 32 - (int)initial_cx, tile_y = 27 * 32 - (int)initial_cy;
    assert(tile_x >= 0 && tile_x + 32 <= 800 && tile_y >= 36 && tile_y + 32 <= 328);
    for (unsigned py = 0; !faded && py < 32; ++py)
        for (unsigned px = 0; px < 32; ++px) {
            const uint8_t *color = ground_image->data + py * ground_image->header.stride + px * 4;
            assert(color[3] == 255);
            uint16_t expected = (uint16_t)(((color[2] >> 3) << 11) | ((color[1] >> 2) << 5) | (color[0] >> 3));
            assert(frame[(tile_y + py) * 800 + tile_x + px] == expected);
        }
    float x = hero->x, y = hero->y;
    lge_node_t *layered_npc = ui_find_node("npc_cloak");
    if (layered_npc) {
        const void *first_image = layered_npc->image;
        float first_x = layered_npc->x;
        ticks(12);
        assert(layered_npc->x > first_x);
        assert(layered_npc->image != first_image);
        const lv_image_dsc_t *npc_image = layered_npc->image;
        assert(npc_image->header.w == layered_npc->definition->width &&
               npc_image->header.h == layered_npc->definition->height);
        assert(npc_image->header.cf == LV_COLOR_FORMAT_ARGB8888);
        assert((uintptr_t)npc_image->data % 16 == 0);
    }
    if (argc > 2) save_frame(argv[2]);
    // The modal page must leave every authored controller button reachable.
    assert(ui_script_start("welcome", "guide"));
    ticks(2);
    assert(ui_dialogue());
    lv_obj_t *root = lv_obj_get_parent(ui_find_object("talk"));
    assert(ui_dialogue_revealing() && ui_dialogue_visible_bytes()<strlen(ui_dialogue_text()));
    assert(!find_label(root,ui_dialogue_text())); /* Body is actually partial, not only its cursor. */
    lv_obj_t *reveal_label = find_label(root, "Reveal (E / Enter)");
    assert(reveal_label);
    lv_obj_t *advance = lv_obj_get_parent(reveal_label), *panel = lv_obj_get_parent(advance);
    lv_area_t panel_area, advance_area, pad_area;
    lv_obj_get_coords(panel, &panel_area);
    lv_obj_get_coords(advance, &advance_area);
    lv_obj_get_coords(ui_find_object("pad_up"), &pad_area);
    assert(panel_area.y1 >= 8 && panel_area.y2 < pad_area.y1 - 7);
    assert(advance_area.y2 - advance_area.y1 + 1 == 40);
    if (argc > 3) save_frame(argv[3]);
    touch(input, 736, 386, true); // First TALK reveals; the next TALK closes.
    touch(input, 736, 386, false);
    ticks(2);
    assert(ui_dialogue() && !ui_dialogue_revealing());
    assert(find_label(root,ui_dialogue_text())); /* LVGL copied the complete UTF-8 prefix. */
    lv_area_t revealed_area;lv_obj_get_coords(advance,&revealed_area);
    assert(memcmp(&revealed_area,&advance_area,sizeof(advance_area))==0);
    touch(input, 736, 386, true);
    touch(input, 736, 386, false);
    ticks(2);
    assert(!ui_dialogue());
    assert(ui_script_start("welcome", "guide"));
    ticks(2);
    touch(input, (advance_area.x1 + advance_area.x2) / 2,
          (advance_area.y1 + advance_area.y2) / 2, true);
    touch(input, (advance_area.x1 + advance_area.x2) / 2,
          (advance_area.y1 + advance_area.y2) / 2, false);
    ticks(2);
    assert(ui_dialogue() && !ui_dialogue_revealing());
    touch(input, (advance_area.x1 + advance_area.x2) / 2,
          (advance_area.y1 + advance_area.y2) / 2, true);
    touch(input, (advance_area.x1 + advance_area.x2) / 2,
          (advance_area.y1 + advance_area.y2) / 2, false);
    ticks(2);
    assert(!ui_dialogue());
    // Verify controller and code-driven actors select matching side-facing clips.
    // Source-row orientation is covered separately by the importer pixel tests.
    for (unsigned side = 0; side < 2; ++side) {
        bool right = side == 0;
        ui_set_input(right ? UI_INPUT_RIGHT : UI_INPUT_LEFT);
        if (layered_npc)
            assert(ui_body_set_velocity("npc_cloak", right ? 28 : -28, 0));
        ticks(4);
        const lge_animator_def_t *animator = hero->definition->animator;
        assert(right ? hero->velocity_x > 0 : hero->velocity_x < 0);
        assert(hero->animation == (right ? animator->move_right : animator->move_left));
        if (layered_npc) {
            animator = layered_npc->definition->animator;
            assert(right ? layered_npc->velocity_x > 0 : layered_npc->velocity_x < 0);
            assert(layered_npc->animation == (right ? animator->move_right : animator->move_left));
        }
        if (argc > 5) {
            char path[1024];
            int length = snprintf(path, sizeof(path), "%s-%s.ppm", argv[5], right ? "right" : "left");
            assert(length > 0 && (size_t)length < sizeof(path));
            save_frame(path);
        }
    }
    ui_set_input(0);
    if (layered_npc)
        assert(ui_body_set_velocity("npc_cloak", 28, 0));
    ticks(2);
    // Exercise the actual LVGL touch driver path, not synthesized widget events.
    touch(input, 140, 398, true);
    assert(lge_input(ui_game()) == LGE_INPUT_RIGHT);
    ticks(180);
    touch(input, 140, 398, false);
    ticks(2);
    assert(hero->x > x + 400 && hero->y == y);
    float cx, cy;
    lge_camera_position(ui_game(), &cx, &cy);
    assert(cx > 1000 && cy > 600);
    assert(lv_obj_get_x(ui_find_object("title")) == 16);
    assert(lv_obj_get_x(ui_find_object("player")) == (int)roundf(hero->x - cx));
    touch(input, 140, 398, true);
    touch(input, 200, 398, true); // Release direction in the gap, without lifting.
    assert(!lge_input(ui_game()));
    touch(input, 88, 350, true);
    assert(lge_input(ui_game()) == LGE_INPUT_UP);
    touch(input, 88, 446, true);
    assert(lge_input(ui_game()) == LGE_INPUT_DOWN);
    touch(input, 400, 200, false); // Release outside every control.
    assert(!lge_input(ui_game()));
    lge_set_input(ui_game(), LGE_INPUT_UP);
    touch(input, 140, 398, true);
    assert(lge_input(ui_game()) == (LGE_INPUT_UP | LGE_INPUT_RIGHT));
    touch(input, 140, 398, false);
    assert(lge_input(ui_game()) == LGE_INPUT_UP);
    lge_set_input(ui_game(), 0);
    // Place a grass hurtbox within the sword's right-facing hit region.
    lge_node_t *bush = ui_find_node("bush_0");
    lge_box_t hero_box = lge_node_bounds(hero), bush_box = lge_node_bounds(bush);
    assert(ui_node_set_position("bush_0", hero_box.x + hero_box.width + 8 - (bush_box.x - bush->x),
                               hero_box.y - (bush_box.y - bush->y)));
    touch(input, 736, 438, true);
    touch(input, 736, 438, false);
    ticks(1);
    assert(ui_melee_active("player"));
    const void *image = hero->image;
    ticks(6);
    assert(hero->image != image);
    assert(!bush->effective_visible);
    if (argc > 4) save_frame(argv[4]);
    ticks(20);
    assert(!ui_melee_active("player"));
    touch(input, 140, 398, true);
    lge_node_set_visible(ui_find_node("pad_right"), false);
    assert(!lge_input(ui_game()));
    touch(input, 140, 398, false);
    lge_node_set_visible(ui_find_node("pad_right"), true);
    const lge_tilemap_t *map = ui_find_node("terrain")->definition->tilemap;
    assert(lge_tile_image(map, 4, 0) != lge_tile_image(map, 4, 12));
    assert(lge_tile_is_solid(map, 4));
    if (argc > 1) {
        save_frame(argv[1]);
    }
    if (kib) {
        const lge_tile_cache_stats_t *stats = ui_terrain_cache_stats();
        assert(stats && stats->builds && (!faded || !cache_format ? stats->draws > 0 : true) && !stats->failures);
        assert(stats->pixel_bytes <= kib * 1024u && stats->metadata_bytes < 8192);
        printf("Terrain cache: %u builds, %u image draws, %zu pixel bytes, %zu metadata bytes\n",
               stats->builds, stats->draws, stats->pixel_bytes, stats->metadata_bytes);
        for(unsigned i=0;i<32;i++) {
            assert(terrain_memory[i] == 0xcd);
            assert(terrain_memory[32 + kib * 1024u + i] == 0xcd);
        }
    }
    ui_deinit();
    assert(!ui_game());
    assert(lv_display_get_event_count(d) == display_events);
    assert(ui_init());
    ticks(2);
    ui_deinit();
    lv_indev_delete(input);
    if (frame_trace) assert(fclose(frame_trace) == 0);
    printf("Terrain image draw tasks: %u\n", tile_draw_tasks);
    puts("H7 demo native LVGL: exact terrain RGB565 pixels, touch driver, slide/gap/release, input merging, scrolling, HUD, "
         "left/right player and NPC clips, touch dialogue advance/close, sword frames/hit events, water and "
         "teardown passed.");
}
