#include "ui.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static uint16_t frame[320 * 240];
static uint8_t draw_buffer[320 * 32 * 2];
static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *bytes) {
    const uint16_t *src = (const uint16_t *)bytes;
    for (int y = area->y1; y <= area->y2; ++y)
        for (int x = area->x1; x <= area->x2; ++x)
            frame[y * 320 + x] = *src++;
    lv_display_flush_ready(display);
}
static void ticks(unsigned n) {
    for (unsigned i = 0; i < n; ++i) {
        lv_tick_inc(17);
        lv_timer_handler();
    }
}
static void text_box(void) {
    lv_obj_t *label = ui_find_object("dialogue_text");
    assert(label);
    assert(strchr(lv_label_get_text(label), '\n'));
    assert(lv_obj_get_x(label) == 18 && lv_obj_get_y(label) == 201);
    assert(lv_obj_get_x(ui_find_object("dialogue_panel")) == 9);
    assert(lv_obj_get_y(ui_find_object("dialogue_panel")) == 181);
}
int main(int argc, char **argv) {
    lv_init();
    lv_display_t *display = lv_display_create(320, 240);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display, draw_buffer, NULL, sizeof(draw_buffer),
                           LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    assert(ui_init());
    ticks(8);
    text_box();
    bool platformer = ui_game()->scene->camera2d != NULL;
    if (platformer) {
        assert(ui_game()->scene->camera2d->world_width == 768);
        assert(ui_node_set_position("player", 680, 144));
        ticks(4);
        float x = -1, y = -1;
        assert(ui_camera_position(&x, &y));
        assert(x == 448 && y == 0);
        assert(fabsf(lv_obj_get_x(ui_find_object("player")) - (ui_find_node("player")->x - x)) <=
               1);
        assert(lv_obj_get_x(ui_find_object("terrain")) == -448);
        text_box();
        ui_set_input(UI_INPUT_RIGHT);
        ticks(20);
        ui_set_input(0);
        assert(ui_find_node("player")->x > 700);
        assert(ui_sequence_start("journey"));
        ticks(3);
    } else {
        assert(ui_find_node("player")->definition->physics->motion == LGE_MOTION_TOPDOWN);
        assert(ui_request_scene("shrine"));
        ticks(4);
        text_box();
        assert(strstr(lv_label_get_text(ui_find_object("dialogue_text")), "relics"));
    }
    /* Move to each actual pickup and let real collision/flow run through the
     * completion scene. Route reachability is covered separately in preview. */
    unsigned chapters = platformer ? 1 : 2;
    if (!platformer) {
        assert(ui_sequence_start("journey"));
        ticks(4);
    }
    for (unsigned chapter = 0; chapter < chapters; ++chapter) {
        for (unsigned i = 1; i <= (platformer ? 6 : 3); ++i) {
            char id[24];
            snprintf(id, sizeof(id), "spark_%u", i);
            lge_node_t *pickup = ui_find_node(id);
            assert(pickup);
            assert(ui_node_set_position("player", pickup->x, pickup->y));
            ticks(3);
        }
        ticks(3);
    }
    assert(!strcmp(ui_current_scene(), "complete"));
    text_box();
    assert(lv_obj_get_width(ui_find_object("dialogue_border")) == 304);
    lv_obj_send_event(ui_find_object("replay"), LV_EVENT_CLICKED, NULL);
    ticks(3);
    assert(!strcmp(ui_current_scene(), platformer ? "trail" : "grove"));
    text_box();
    if (argc > 1) {
        FILE *f = fopen(argv[1], "wb");
        assert(f);
        fprintf(f, "P6\n320 240\n255\n");
        for (unsigned i = 0; i < 320 * 240; ++i) {
            uint16_t p = frame[i];
            unsigned char rgb[3] = {(unsigned char)(((p >> 11) & 31) * 255 / 31),
                                    (unsigned char)(((p >> 5) & 63) * 255 / 63),
                                    (unsigned char)((p & 31) * 255 / 31)};
            fwrite(rgb, 1, 3, f);
        }
        fclose(f);
    }
    ui_deinit();
    puts(platformer ? "LVGL side scroller: world motion/camera, pinned dialogue/HUD, collection, "
                      "completion and replay passed."
                    : "LVGL adventure: grove/shrine textboxes, foot colliders, collection, scene "
                      "sequence, completion and replay passed.");
    return 0;
}
