#include "ui.h"
#include <assert.h>
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
    while (n--) {
        lv_tick_inc(17);
        lv_timer_handler();
    }
}
static uint32_t pond_hash(void) {
    uint32_t h = 2166136261u;
    for (unsigned y = 64; y < 96; ++y)
        for (unsigned x = 208; x < 240; ++x)
            h = (h ^ frame[y * 320 + x]) * 16777619u;
    return h;
}
int main(int argc, char **argv) {
    lv_init();
    lv_display_t *display = lv_display_create(320, 240);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display, buffer, NULL, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    assert(ui_init());
    ticks(4);
    lge_rpg_t *r = ui_rpg();
    assert(r && r->count == 2 && r->party[0].hp == 68 && r->party[1].mp == 20);
    printf("RPG context: %zu bytes; menu option scratch: %zu bytes.\n", sizeof(*r),
           sizeof(lge_rpg_option_t) * 8);
    uint32_t water = pond_hash();
    ticks(20);
    assert(water != pond_hash());
    ui_set_paused(true);
    water = pond_hash();
    ticks(20);
    assert(water == pond_hash());
    ui_set_paused(false);
    r->party[0].hp = 17;
    r->party[0].statuses[0] = 2;
    r->gold = 42;
    lge_rpg_random(r);
    assert(ui_state_set("potion", 2));
    uint8_t saved[512], expected[512];
    size_t size = ui_save_size();
    assert(size < sizeof(saved) && ui_save_write(saved, size));
    assert(argc > 1);
    FILE *f = fopen(argv[1], "rb");
    assert(f);
    assert(fread(expected, 1, sizeof(expected), f) == size);
    fclose(f);
    assert(memcmp(saved, expected, size) == 0);
    r->party[0].hp = 1;
    r->gold = 0;
    assert(ui_state_set("potion", 0));
    assert(ui_save_read(saved, size));
    assert(r->party[0].hp == 17 && r->gold == 42 && lge_inventory_count(r, "potion") == 2);
    saved[size - 1] ^= 1;
    assert(!ui_save_read(saved, size) && r->party[0].hp == 17);
    saved[size - 1] ^= 1;
    assert(ui_party_rest());
    assert(ui_party_open());
    ticks(2);
    assert(ui_game()->simulation_blocked);
    lge_rpg_option_t options[8];
    unsigned count = lge_rpg_options(r, options);
    assert(count == 5 && strcmp(options[4].label, "Close") == 0);
    assert(lge_rpg_select(r, 4));
    ticks(2);
    assert(!ui_game()->simulation_blocked);
    assert(ui_script_start("fight", NULL));
    ticks(2);
    assert(r->claimed && r->phase == LGE_BATTLE_COMMAND && r->turn == 0);
    assert(ui_save_size() == 0);
    assert(!lge_party_add(r, "hero", 1));
    assert(!ui_battle_command(LGE_RPG_ATTACK, NULL, 0));
    assert(ui_battle_command(LGE_RPG_SKILL, "rally", 0));
    assert(r->party[0].statuses[3] == 3 && r->party[0].mp == 10);
    assert(ui_battle_command(LGE_RPG_SKILL, "spark_burst", 4));
    for (unsigned i = 0; i < 40 && r->phase == LGE_BATTLE_COMMAND; ++i) {
        unsigned target = 4;
        while (target < 8 && (!lge_party_member(r, target) || !lge_party_member(r, target)->hp))
            ++target;
        assert(ui_battle_command(LGE_RPG_ATTACK, NULL, target));
    }
    assert(r->phase == LGE_BATTLE_VICTORY);
    uint32_t gold = r->gold;
    assert(lge_battle_acknowledge(r));
    ticks(2);
    assert(ui_dialogue_text() && strstr(ui_dialogue_text(), "path is clear"));
    assert(!r->claimed && r->gold == gold);
    while (ui_dialogue()) {
        ui_dialogue_choose(0);
        ticks(2);
    }
    assert(!ui_game()->simulation_blocked);
    assert(argc > 2);
    size = ui_save_size();
    assert(ui_save_write(saved, size));
    f = fopen(argv[2], "rb");
    assert(f);
    assert(fread(expected, 1, sizeof(expected), f) == size);
    fclose(f);
    assert(memcmp(saved, expected, size) == 0);
    ui_set_input(UI_INPUT_MENU);
    ticks(2);
    assert(r->menu_open);
    ui_set_input(0);
    ticks(1);
    ui_set_input(UI_INPUT_MENU);
    ticks(2);
    assert(!r->menu_open);
    ui_set_input(0);
    ticks(2);
    assert(lge_party_add(r, "hero", 2));
    assert(lge_party_add(r, "hero", 3));
    assert(!lge_party_add(r, "hero", 1));
    assert(lge_party_remove(r, 3));
    assert(lge_party_remove(r, 2));
    assert(lge_party_remove(r, 1));
    assert(!lge_party_remove(r, 0));
    ui_deinit();
    assert(!ui_rpg());
    assert(ui_init());
    ticks(2);
    assert(ui_rpg()->count == 2);
    ui_deinit();
    lv_display_delete(display);
    lv_deinit();
    puts("RPG LVGL: animated tile pixels/pause, exact TS/C session saves, atomic corruption "
         "rejection, party menus, turn combat, statuses, XP/gold, script outcomes and "
         "reinitialization passed.");
    return 0;
}
