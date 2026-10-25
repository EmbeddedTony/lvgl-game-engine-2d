#include "lge.h"
#include "lge_input_codec.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static unsigned locks, depth;
static uintptr_t lock_enter(void *context) {
    assert(context == &locks);
    assert(!depth);
    depth++;
    locks++;
    return 42;
}
static void lock_leave(void *context, uintptr_t key) {
    assert(context == &locks && key == 42 && depth == 1);
    depth--;
}
static const lge_input_source_t sources[] = {{256}, {7}};
static const lge_input_def_t defs[] = {{.id = "stick",
                                        .source = 0,
                                        .type = LGE_VALUE_INT,
                                        .binding = LGE_INPUT_BIND_MOVE_X,
                                        .minimum = 0,
                                        .center = 2048,
                                        .maximum = 4095,
                                        .deadzone = .1f,
                                        .press = .6f,
                                        .release = .4f,
                                        .timeout_ms = 100,
                                        .encoding = LGE_WIRE_U16_LE},
                                       {.id = "button",
                                        .source = 0,
                                        .type = LGE_VALUE_BOOL,
                                        .binding = LGE_INPUT_BIND_ACTION,
                                        .minimum = 0,
                                        .maximum = 1,
                                        .press = .6f,
                                        .release = .4f,
                                        .timeout_ms = 100,
                                        .encoding = LGE_WIRE_BIT,
                                        .offset = 2},
                                       {.id = "sensor",
                                        .source = 1,
                                        .type = LGE_VALUE_FLOAT,
                                        .binding = LGE_INPUT_BIND_MOVE_Y,
                                        .minimum = -1,
                                        .maximum = 1,
                                        .press = .6f,
                                        .release = .4f,
                                        .timeout_ms = 100,
                                        .encoding = LGE_WIRE_F32_LE,
                                        .offset = 1},
                                       {.id = "trigger",
                                        .source = 1,
                                        .type = LGE_VALUE_FLOAT,
                                        .binding = LGE_INPUT_BIND_INTERACT,
                                        .minimum = 0,
                                        .maximum = 1,
                                        .press = .6f,
                                        .release = .4f,
                                        .timeout_ms = 100}};
static lge_inputs_t bank;
static void near(float a, float b) {
    assert(fabsf(a - b) < .0001f);
}
static void core(void) {
    lge_input_lock_t lock = {&locks, lock_enter, lock_leave};
    assert(lge_inputs_init(&bank, defs, 4, sources, 2, &lock));
    lge_input_value_t value = {.integer = 123};
    assert(!lge_inputs_read(&bank, 0, LGE_VALUE_INT, &value) && value.integer == 123);
    assert(!lge_inputs_set_float(&bank, 0, 1));
    assert(!lge_inputs_set_float(&bank, 2, NAN));
    assert(!lge_inputs_set_int(&bank, 256, 1));
    assert(lge_inputs_set_int(&bank, 0, 2048));
    assert(lge_inputs_set_bool(&bank, 1, true));
    assert(lge_inputs_set_bool(&bank, 1, false));
    lge_input_frame_t f = lge_inputs_poll(&bank, UINT32_MAX - 30, 16);
    near(f.x, 0);
    assert(f.actions == 0 && f.pressed == LGE_INPUT_ACTION);
    f = lge_inputs_poll(&bank, UINT32_MAX - 14, 16);
    assert(!f.pressed);
    assert(lge_inputs_read(&bank, 0, LGE_VALUE_INT, &value) && value.integer == 2048);
    assert(lge_inputs_set_int(&bank, 0, 4095));
    f = lge_inputs_poll(&bank, 4, 16);
    near(f.x, 1);
    f = lge_inputs_poll(&bank, 104, 16);
    near(f.x, 0);
    assert(!lge_inputs_active(&bank, 0));
    assert(lge_inputs_set_int(&bank, 0, 0));
    f = lge_inputs_poll(&bank, 110, 6);
    near(f.x, -1);
    assert(lge_inputs_disconnect(&bank, 0));
    f = lge_inputs_poll(&bank, 111, 1);
    near(f.x, 0);
    assert(lge_inputs_set_float(&bank, 3, .7f));
    f = lge_inputs_poll(&bank, 112, 1);
    assert(f.actions == LGE_INPUT_INTERACT && f.pressed == LGE_INPUT_INTERACT);
    assert(lge_inputs_set_float(&bank, 3, .5f));
    f = lge_inputs_poll(&bank, 113, 1);
    assert(f.actions == LGE_INPUT_INTERACT && !f.pressed);
    assert(lge_inputs_set_float(&bank, 3, .3f));
    f = lge_inputs_poll(&bank, 114, 1);
    assert(!f.actions);
    lge_input_sample_t bad[] = {{0, LGE_VALUE_INT, {.integer = 4095}},
                                {2, LGE_VALUE_FLOAT, {.real = INFINITY}}};
    assert(!lge_inputs_publish(&bank, bad, 2));
    assert(!lge_inputs_active(&bank, 0));
    assert(locks > 0 && !depth);
}
static void codecs(void) {
    assert(lge_inputs_init(&bank, defs, 4, sources, 2, NULL));
    lge_input_serial_t parser = {0};
    assert(lge_inputs_serial_feed(&bank, &parser, 0, "sti", 3) == 0);
    const char *lines =
        "ck=4095\r\nbutton=true\nbutton=false\nsensor=1\nstick=oops\nstick=2147483648\n";
    assert(lge_inputs_serial_feed(&bank, &parser, 0, lines, strlen(lines)) == 3);
    lge_input_frame_t f = lge_inputs_poll(&bank, 10, 16);
    near(f.x, 1);
    assert(f.pressed == LGE_INPUT_ACTION);
    assert(!lge_inputs_active(&bank, 2));
    char overflow[100];
    memset(overflow, 'x', sizeof(overflow));
    assert(!lge_inputs_serial_feed(&bank, &parser, 0, overflow, sizeof(overflow)));
    assert(!lge_inputs_serial_feed(&bank, &parser, 0, "stick=0\n", 8));
    assert(lge_inputs_serial_feed(&bank, &parser, 0, "stick=0\n", 8) == 1);
    f = lge_inputs_poll(&bank, 11, 1);
    near(f.x, -1);
    uint8_t packet[] = {0xff, 0x0f, 1};
    assert(lge_inputs_report(&bank, 0, packet, 3));
    f = lge_inputs_poll(&bank, 12, 1);
    near(f.x, 1);
    assert(f.actions == LGE_INPUT_ACTION);
    packet[0] = 0;
    assert(!lge_inputs_report(&bank, 0, packet, 2));
    f = lge_inputs_poll(&bank, 13, 1);
    near(f.x, 1);
    uint8_t ble[] = {7, 0, 0, 0x80, 0x3f};
    assert(lge_inputs_report(&bank, 1, ble, 5));
    f = lge_inputs_poll(&bank, 14, 1);
    near(f.y, 1);
    ble[0] = 8;
    assert(!lge_inputs_report(&bank, 1, ble, 5));
    ble[0] = 7;
    ble[3] = 0xc0;
    ble[4] = 0x7f;
    assert(!lge_inputs_report(&bank, 1, ble, 5));
    f = lge_inputs_poll(&bank, 15, 1);
    near(f.y, 1);
    assert(lge_inputs_disconnect(&bank, 1));
    f = lge_inputs_poll(&bank, 16, 1);
    near(f.y, 0);
    near(f.x, 1);
}
static void wire_types_and_decimal(void) {
    lge_input_def_t integers[5];
    const lge_input_encoding_t encodings[] = {LGE_WIRE_I8, LGE_WIRE_U8, LGE_WIRE_I16_LE,
                                              LGE_WIRE_U16_LE, LGE_WIRE_I32_LE};
    const unsigned offsets[] = {0, 1, 2, 4, 6};
    const int32_t expected[] = {-128, 255, -32768, 65535, INT32_MIN};
    for (unsigned i = 0; i < 5; i++) {
        integers[i] = defs[0];
        integers[i].encoding = encodings[i];
        integers[i].offset = (uint8_t)offsets[i];
    }
    lge_inputs_t values;
    assert(lge_inputs_init(&values, integers, 5, sources, 2, NULL));
    const uint8_t report[] = {128, 255, 0, 128, 255, 255, 0, 0, 0, 128};
    assert(lge_inputs_report(&values, 0, report, sizeof(report)));
    lge_inputs_poll(&values, 1, 1);
    for (unsigned i = 0; i < 5; i++) {
        lge_input_value_t v;
        assert(lge_inputs_read(&values, i, LGE_VALUE_INT, &v));
        assert(v.integer == expected[i]);
    }
    assert(lge_inputs_init(&bank, defs, 4, sources, 2, NULL));
    const char *lines = "sensor=-.125e+1\nsensor=nan\nsensor=1e999\nsensor=0x10\nsensor=.\nsensor="
                        "1.2.3\nsensor=2e\n";
    lge_input_serial_t parser = {0};
    assert(lge_inputs_serial_feed(&bank, &parser, 1, lines, strlen(lines)) == 1);
    lge_inputs_poll(&bank, 2, 1);
    lge_input_value_t v;
    assert(lge_inputs_read(&bank, 2, LGE_VALUE_FLOAT, &v));
    near(v.real, -1.25f);
    const char *small = "sensor=0.000000125\n";
    assert(lge_inputs_serial_feed(&bank, &parser, 1, small, strlen(small)) == 1);
    lge_inputs_poll(&bank, 3, 1);
    assert(lge_inputs_read(&bank, 2, LGE_VALUE_FLOAT, &v));
    assert(fabsf(v.real - 1.25e-7f) < 1e-12f);
    const char *minint = "stick=-2147483648\n";
    assert(lge_inputs_serial_feed(&bank, &parser, 0, minint, strlen(minint)) == 1);
    lge_inputs_poll(&bank, 4, 1);
    assert(lge_inputs_read(&bank, 0, LGE_VALUE_INT, &v) && v.integer == INT32_MIN);
    lge_input_def_t smooth = defs[0];
    smooth.smoothing_ms = 100;
    smooth.invert = true;
    smooth.timeout_ms = 0;
    assert(lge_inputs_init(&values, &smooth, 1, sources, 2, NULL));
    assert(lge_inputs_set_int(&values, 0, 2048));
    lge_inputs_poll(&values, 10, 10);
    assert(lge_inputs_set_int(&values, 0, 4095));
    near(lge_inputs_poll(&values, 110, 100).x, -.5f);
    assert(lge_inputs_disconnect(&values, 0));
    near(lge_inputs_poll(&values, 111, 1).x, 0);
}
static const lge_physics_def_t physics = {.body = LGE_BODY_CHARACTER, .motion = LGE_MOTION_TOPDOWN};
static const lge_node_def_t nodes[] = {{.id = "hero",
                                        .kind = LGE_RECT,
                                        .visible = true,
                                        .player = true,
                                        .x = 32,
                                        .y = 32,
                                        .width = 8,
                                        .height = 8,
                                        .speed = 60,
                                        .physics = &physics}};
static const lge_scene_def_t scene = {
    .id = "test", .width = 256, .height = 256, .nodes = nodes, .count = 1};
static lge_engine_t game;
static void movement(void) {
    lge_init(&game, NULL, NULL, NULL);
    assert(lge_load(&game, &scene));
    lge_set_controller_input(&game, 0, 0, .5f, .25f);
    lge_update(&game, 17);
    near(game.nodes[0].x, 32.5f);
    near(game.nodes[0].y, 31.75f);
    lge_set_input(&game, LGE_INPUT_LEFT);
    lge_update(&game, 17);
    assert(game.nodes[0].x < 32.5f);
    lge_set_input(&game, 0);
    lge_pause(&game, true);
    lge_set_controller_input(&game, LGE_INPUT_ACTION, LGE_INPUT_ACTION, 0, 0);
    assert(!game.pressed_input);
    lge_pause(&game, false);
    lge_set_controller_input(&game, LGE_INPUT_ACTION, 0, 0, 0);
    assert(!game.pressed_input);
    lge_override_input(&game, true, LGE_INPUT_RIGHT);
    lge_set_controller_input(&game, LGE_INPUT_LEFT, LGE_INPUT_LEFT, -1, 0);
    float x, y;
    lge_move_input(&game, &x, &y);
    near(x, 1);
    near(y, 0);
    assert(!(lge_input(&game) & LGE_INPUT_LEFT));
    lge_override_input(&game, false, 0);
    lge_move_input(&game, &x, &y);
    near(x, -1);
    lge_destroy(&game);
}
int main(void) {
    core();
    codecs();
    wire_types_and_decimal();
    movement();
    puts("typed inputs, timeouts, codecs and analog movement passed");
    return 0;
}
