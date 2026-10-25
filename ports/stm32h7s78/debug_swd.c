#include "debug_swd.h"
#include "debug_mailbox.h"
#include "stm32h7rsxx_hal.h"
#include "ui.h"
#include <math.h>
#include <string.h>
volatile uint32_t lge_h7_swd_mailbox[LGE_SWD_WORDS]
    __attribute__((section("LgeTelemetry"), aligned(32)));
static lge_swd_t controller;
static bool owned, previous_pause;
static uint8_t input;
static void memory_barrier(void) {
    __DMB();
}
static uint32_t bits(float f) {
    uint32_t b;
    memcpy(&b, &f, 4);
    return b;
}
static float number(uint32_t b) {
    float f;
    memcpy(&f, &b, 4);
    return f;
}
static bool bounded(float f, float bound) {
    return isfinite(f) && fabsf(f) <= bound;
}
static void acquire(void) {
    if (!owned) {
        previous_pause = ui_is_paused();
        input = 0;
        owned = true;
    }
    lge_override_input(ui_game(), true, input);
}
static void release(void *context) {
    (void)context;
    if (owned) {
        lge_override_input(ui_game(), false, 0);
        ui_set_paused(previous_pause);
    }
    input = 0;
    owned = false;
}
static lge_node_t *player2d(void) {
    lge_engine_t *g = ui_game();
    if (g && g->scene)
        for (unsigned i = 0; i < g->scene->count; i++)
            if (g->nodes[i].definition->player)
                return &g->nodes[i];
    return NULL;
}
static uint32_t execute(void *context, uint32_t op, const uint32_t *args) {
    (void)context;
    if (!ui_game())
        return LGE_SWD_UNSUPPORTED;
    float x = number(args[0]), y = number(args[1]), z = number(args[2]);
    switch (op) {
    case LGE_SWD_INPUT:
        if (args[0] > 127)
            return LGE_SWD_INVALID;
        acquire();
        input = (uint8_t)args[0];
        lge_override_input(ui_game(), true, input);
        break;
    case LGE_SWD_PAUSE:
        acquire();
        ui_set_paused(true);
        break;
    case LGE_SWD_RESUME:
        acquire();
        previous_pause = false;
        ui_set_paused(false);
        break;
    case LGE_SWD_RELOAD:
        if (!ui_request_scene(ui_current_scene()))
            return LGE_SWD_UNSUPPORTED;
        acquire();
        input = 0;
        break;
    case LGE_SWD_WARP:
        if (!bounded(x, 1000) || !bounded(y, 1000) || !bounded(z, 1000))
            return LGE_SWD_INVALID;
        {
            lge_node_t *p = player2d();
            if (!p)
                return LGE_SWD_UNSUPPORTED;
            acquire();
            lge_node_set_position(p, x, y);
            p->velocity_x = p->velocity_y = 0;
        }
        break;
    default:
        return LGE_SWD_UNSUPPORTED;
    }
    return LGE_SWD_OK;
}
static void snapshot(void *context, uint32_t *r) {
    (void)context;
    lge_engine_t *g = ui_game();
    if (owned && g)
        lge_override_input(g, true, input); /* Survives scene changes. */
    r[7] = ui_is_paused();
    r[8] = g ? lge_input(g) : 0;
    r[9] = 2;
    r[10] = g ? g->ticks : 0;
    const char *scene = ui_current_scene();
    if (scene)
        memcpy(r + 24, scene, strlen(scene) < 63 ? strlen(scene) : 63);
    lge_node_t *p = player2d();
    if (p) {
        r[11] = bits(p->x);
        r[12] = bits(p->y);
        r[14] = bits(p->velocity_x);
        r[15] = bits(p->velocity_y);
    }
    r[40] = LTDC_Layer1->CFBAR;
    r[84] = LGE_SWD_TAG0;
    r[85] = LGE_SWD_TAG1;
    r[86] = LGE_SWD_TAG2;
    r[87] = LGE_SWD_TAG3;
}
static void poll(lv_timer_t *timer) {
    (void)timer;
    lge_swd_poll(&controller, lv_tick_get());
}
void lge_h7_swd_init(void) {
    const lge_swd_backend_t backend = {NULL, execute, release, snapshot, memory_barrier};
    lge_swd_init(&controller, lge_h7_swd_mailbox, &backend);
    owned = false;
    input = 0;
    lv_timer_create(poll, 10, NULL);
    poll(NULL);
}
