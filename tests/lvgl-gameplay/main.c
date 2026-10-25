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
static void finish(void) {
    for (unsigned i = 0; i < 30 && ui_game()->simulation_blocked; ++i) {
        if (ui_dialogue())
            assert(ui_dialogue_choose(0));
        ticks(2);
    }
    assert(!ui_dialogue());
    assert(!ui_game()->simulation_blocked);
}
static int32_t state(const char *id) {
    int32_t n;
    assert(ui_state_get(id, &n));
    return n;
}
int main(int argc, char **argv) {
    lv_init();
    lv_display_t *d = lv_display_create(320, 240);
    lv_display_set_color_format(d, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(d, buffer, NULL, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(d, flush);
    assert(ui_init());
    ticks(4);
    const char *grove = ui_current_scene();
    ui_set_input(UI_INPUT_INTERACT);
    ticks(2);
    assert(ui_dialogue());
    assert(strcmp(ui_dialogue()->speaker, "MIRA") == 0);
    float x = ui_find_node("player")->x;
    ui_set_input(UI_INPUT_INTERACT | UI_INPUT_RIGHT);
    ticks(15);
    assert(ui_find_node("player")->x == x);
    ui_set_input(0);
    if(ui_dialogue_revealing()) assert(ui_dialogue_choose(0));
    assert(ui_dialogue_choose(0));
    ticks(2);
    assert(state("quest") == 1);
    finish();
    assert(ui_script_start("door", "door"));
    ticks(2);
    assert(strstr(ui_dialogue_text(), "locked"));
    finish();
    assert(strcmp(grove, ui_current_scene()) == 0);
    assert(ui_script_start("chest", "chest/body"));
    ticks(2);
    assert(state("amber_key") == 1);
    assert(state("chest_opened") == 1);
    finish();
    assert(ui_script_start("chest", "chest/body"));
    ticks(2);
    assert(strstr(ui_dialogue_text(), "empty"));
    finish();
    assert(state("amber_key") == 1);
    assert(ui_script_start("chest", "other_chest/body"));
    ticks(2);
    finish();
    assert(state("amber_key") == 2 && state("second_chest_opened") == 1);
    int32_t opened;
    assert(ui_node_state_get("other_chest/body", "chest_opened", &opened) && opened == 1);
    uint8_t save[64], bad[64];
    size_t size = ui_save_size();
    assert(size == 36);
    assert(ui_save_write(save, size));
    assert(ui_state_set("amber_key", 7));
    memcpy(bad, save, size);
    bad[12] ^= 1;
    assert(!ui_save_read(bad, size));
    assert(state("amber_key") == 7);
    assert(ui_save_read(save, size));
    assert(state("amber_key") == 2);
    /* Match the TS codec's exact byte order/schema/checksum, including transient reset. */
    if (argc > 2) {
        FILE *f = fopen(argv[2], "rb");
        assert(f);
        uint8_t expected[64];
        assert(fread(expected, 1, size, f) == size);
        fclose(f);
        assert(memcmp(save, expected, size) == 0);
    }
    assert(ui_script_start("door", "door"));
    ticks(2);
    while (ui_dialogue()) {
        assert(ui_dialogue_choose(0));
        ticks(2);
    }
    ticks(3);
    assert(strcmp(grove, ui_current_scene()) != 0);
    assert(fabsf(ui_find_node("player")->x - 48) < .01f);
    assert(state("amber_key") == 2);
    assert(ui_script_start("encounter", "spirit"));
    ticks(2);
    assert(ui_dialogue()->choice_count == 3);
    if(ui_dialogue_revealing()) assert(ui_dialogue_choose(1));
    assert(ui_dialogue_choose(1));
    ticks(2);
    assert(strstr(ui_dialogue_text(), "stayed to listen"));
    if (argc > 1) {
        ticks(4);
        FILE *f = fopen(argv[1], "wb");
        assert(f);
        fputs("P6\n320 240\n255\n", f);
        for (unsigned i = 0; i < 320 * 240; ++i) {
            unsigned c = frame[i];
            uint8_t rgb[] = {(uint8_t)(((c >> 11) & 31) * 255 / 31),
                             (uint8_t)(((c >> 5) & 63) * 255 / 63), (uint8_t)((c & 31) * 255 / 31)};
            fwrite(rgb, 1, 3, f);
        }
        fclose(f);
    }
    finish();
    assert(state("resolved") == 1);
    assert(ui_request_scene_at(grove, 256, 128));
    ticks(3);
    assert(fabsf(ui_find_node("player")->x - 256) < .01f);
    assert(state("amber_key") == 2);
    const char *shrine = game_scenes[1].id;
    assert(ui_request_scene_at(shrine, 48, 128));
    ticks(4);
    assert(!ui_find_node("spirit")->visible);
    /* Actual image descriptors switch, independently of immutable source definitions. */
    ui_set_input(UI_INPUT_RIGHT);
    bool changed = false;
    const void *first = ui_find_node("player")->definition->image;
    for (unsigned i = 0; i < 20; ++i) {
        ticks(1);
        if (ui_find_node("player")->image != first)
            changed = true;
    }
    assert(changed);
    ui_set_input(0);
    ui_deinit();
    assert(!ui_is_ready());
    printf("Gameplay LVGL: interactions, blocking, paginated dialogue/choices, one-time inventory, "
           "exact TS/C save codec, room spawns, persistence and animated images passed. Story "
           "context: %zu bytes.\n",
           sizeof(lge_story_t));
    return 0;
}
