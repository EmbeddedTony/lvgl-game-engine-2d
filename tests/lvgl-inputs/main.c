#include "ui.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static uint16_t pixels[320 * 32];
static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *p) {
    (void)a;
    (void)p;
    lv_display_flush_ready(d);
}
static void ticks(unsigned n) {
    while (n--) {
        lv_tick_inc(17);
        lv_timer_handler();
    }
}
int main(void) {
    lv_init();
    lv_display_t *d = lv_display_create(320, 240);
    lv_display_set_color_format(d, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(d, pixels, NULL, sizeof(pixels), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(d, flush);
    assert(!ui_input_set_int(UI_CHANNEL_ADC_X, 4095));
    assert(ui_init());
    lge_node_t *player = ui_find_node(UI_NODE_PLAYER);
    assert(player);
    float initial = player->x;
    assert(ui_input_set_int(UI_CHANNEL_ADC_X, 4095));
    assert(ui_input_set_float(UI_CHANNEL_TEMPERATURE, 23.5f));
    ticks(6);
    assert(player->x > initial + 5);
    int32_t raw = 0;
    assert(ui_input_read_int(UI_CHANNEL_ADC_X, &raw) && raw == 4095);
    float temperature = 0;
    assert(ui_input_read_float(UI_CHANNEL_TEMPERATURE, &temperature) && temperature == 23.5f);
    assert(strstr(lv_label_get_text(ui_find_object(UI_NODE_READOUT)), "23.5"));
    ui_set_input(UI_INPUT_LEFT);
    initial = player->x;
    ticks(2);
    assert(player->x < initial);
    ui_set_input(0);
    assert(ui_input_disconnect(UI_DEVICE_ADC));
    ticks(2);
    initial = player->x;
    ticks(2);
    assert(player->x == initial);
    const uint8_t report[] = {0xff, 0x0f, 0, 8, 0};
    assert(ui_input_report(UI_DEVICE_BLE, report, sizeof(report)));
    ticks(2);
    assert(player->x > initial);
    assert(!ui_input_report(UI_DEVICE_BLE, report, 1));
    ui_set_paused(true);
    assert(ui_input_set_bool(UI_CHANNEL_BLE_ACTION, true));
    ticks(2);
    assert(!ui_game()->pressed_input);
    ticks(35);
    assert(!ui_input_active(UI_CHANNEL_BLE_X));
    ui_set_paused(false);
    initial = player->x;
    ticks(2);
    assert(player->x == initial);
    lge_input_serial_t parser = {0};
    const char *line = "serial_x=4095\n";
    assert(ui_input_serial_feed(&parser, UI_DEVICE_SERIAL, line, strlen(line)) == 1);
    ticks(2);
    assert(player->x > initial);
    assert(ui_request_scene(UI_SCENE_MAIN));
    ticks(3);
    assert(ui_input_active(UI_CHANNEL_SERIAL_X));
    ui_deinit();
    assert(!ui_input_set_int(UI_CHANNEL_ADC_X, 4095));
    assert(ui_init());
    assert(!ui_input_active(UI_CHANNEL_SERIAL_X));
    ui_deinit();
    puts("LVGL typed inputs: generated IDs/defs, analog motion, keyboard merge, sensors in hooks, "
         "BLE reports/disconnect, paused timeout, serial, scene persistence and teardown passed.");
    lv_display_delete(d);
    lv_deinit();
    return 0;
}
