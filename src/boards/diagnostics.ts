import { h7Terrain } from './terrain';
/** Board-only diagnostics. The stable uncached block is read over ST-LINK/SWD. */
export const h7Adapter =
  String.raw`#include "stm32h7s78_dk.h"
#include "stm32h7rsxx_hal.h"
#include "ui.h"
#include "checkpoint_flash.h"
#if LGE_H7_HARDWARE_INPUTS
#include "hardware_inputs.h"
#endif
#if LGE_H7_INPUT_MONITOR
#include "input_monitor.h"
#endif
#if LGE_H7_DEBUG_SWD
#include "debug_swd.h"
#endif
#ifndef LGE_H7_SOFTWARE_COMPARE
#define LGE_H7_SOFTWARE_COMPARE 0
#endif
#ifndef LGE_H7_BENCHMARK
#define LGE_H7_BENCHMARK 0
#endif
#if !defined(STM32H7S7xx) || LV_COLOR_DEPTH != 16
#error "This adapter requires STM32H7S7 and RGB565."
#endif
#if !LGE_H7_SOFTWARE_COMPARE && (!LV_USE_NEMA_GFX || LV_USE_NEMA_LIB != LV_NEMA_LIB_M7 || LV_USE_NEMA_HAL != LV_NEMA_HAL_STM32)
#error "Build LVGL with NemaGFX M7 and the STM32 HAL."
#endif
#if LV_USE_DRAW_DMA2D
#error "DMA2D belongs to LTDC flush; disable the DMA2D draw unit."
#endif
/* All 12 words are a versioned wire protocol. RAM_CMD is uncached in the port.
 * Reader accepts a sample only when word 2 is even and equals word 11. */
volatile uint32_t lge_h7_telemetry[12] __attribute__((section("LgeTelemetry"),aligned(32)));
#if GAME_INPUT_COUNT > 0
/* The pinned DK port is single-core bare metal. Preserve the caller's IRQ mask;
 * no HAL/LVGL work is performed inside a channel publication critical section. */
static uintptr_t h7_input_enter(void *context) { (void)context;uint32_t key=__get_PRIMASK();__disable_irq();__DMB();return key; }
static void h7_input_leave(void *context,uintptr_t key) { (void)context;__DMB();__set_PRIMASK((uint32_t)key); }
static const lge_input_lock_t h7_input_lock={NULL,h7_input_enter,h7_input_leave};
#endif
static volatile uint32_t gpu_irqs;
static uint32_t frames,total_frames,render_cycles,flush_cycles,last_ms,render_start,flush_start,wait_start;
static bool rendered;
static lv_obj_t *metrics;
static bool input_hardware_failed;
static const lge_tile_cache_config_t *h7_terrain_cache(void);
#if LGE_H7_BENCHMARK && 1
static void h7_2d_benchmark_init(void);
#endif
void lge_h7_gpu_interrupt(void) { ++gpu_irqs; }
static uint32_t micros(uint32_t cycles) {
    return (uint32_t)(((uint64_t)cycles * 1000000u) / SystemCoreClock);
}
static void display_event(lv_event_t *e) {
    switch (lv_event_get_code(e)) {
    case LV_EVENT_REFR_START: rendered=false; break;
    case LV_EVENT_RENDER_START: render_start=DWT->CYCCNT; rendered=true; break;
    case LV_EVENT_RENDER_READY: render_cycles += DWT->CYCCNT-render_start; break;
    case LV_EVENT_FLUSH_START: flush_start=DWT->CYCCNT; break;
    case LV_EVENT_FLUSH_FINISH: flush_cycles += DWT->CYCCNT-flush_start; break;
    case LV_EVENT_FLUSH_WAIT_START: wait_start=DWT->CYCCNT; break;
    case LV_EVENT_FLUSH_WAIT_FINISH: flush_cycles += DWT->CYCCNT-wait_start; break;
    case LV_EVENT_REFR_READY: if(rendered) {++frames; ++total_frames;} break;
    default: break;
    }
}
static void sample(lv_timer_t *timer) {
    (void)timer;
    uint32_t now=lv_tick_get(),elapsed=now-last_ms;
    if(!elapsed) return;
    lv_mem_monitor_t memory;
    lv_mem_monitor(&memory);
    uint32_t fps=(uint32_t)(((uint64_t)frames*1000000u)/elapsed);
    uint32_t render=frames?micros(render_cycles)/frames:0;
    uint32_t flush=frames?micros(flush_cycles)/frames:0;
    uint32_t sequence=lge_h7_telemetry[2]+1;
    lge_h7_telemetry[2]=sequence; __DMB();
    lge_h7_telemetry[0]=0x4c47454d;
    lge_h7_telemetry[1]=1;
    lge_h7_telemetry[3]=now;
    lge_h7_telemetry[4]=total_frames;
    lge_h7_telemetry[5]=fps;
    lge_h7_telemetry[6]=render;
    lge_h7_telemetry[7]=flush;
    lge_h7_telemetry[8]=gpu_irqs;
    lge_h7_telemetry[9]=LV_USE_NEMA_GFX?1:0;
    lge_h7_telemetry[10]=(uint32_t)memory.free_size;
    lge_h7_telemetry[11]=sequence+1; __DMB();
    lge_h7_telemetry[2]=sequence+1;
    lv_label_set_text_fmt(metrics,"%u.%u FPS  |  render %u us  flush/wait %u us\n%s  |  GPU IRQ %u  |  heap %u KiB free%s",
        (unsigned)(fps/1000),(unsigned)(fps%1000/100),(unsigned)render,(unsigned)flush,
        LV_USE_NEMA_GFX?"NeoChrom":"Software compare",(unsigned)gpu_irqs,(unsigned)(memory.free_size/1024),
        input_hardware_failed?"\nController hardware unavailable; touch still works":"");
    frames=render_cycles=flush_cycles=0; last_ms=now;
}
bool lge_h7s78_start(void) {
    lv_display_t *d=lv_display_get_default();
    if(!d || lv_display_get_horizontal_resolution(d)!=800 || lv_display_get_vertical_resolution(d)!=480) return false;
    for(unsigned i=0;i<12;i++) lge_h7_telemetry[i]=0;
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->LAR=0xc5acce55u; /* Unlock the Cortex-M7 cycle counter. */
    DWT->CYCCNT=0; DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
    bool checkpoints=lge_h7_checkpoint_init();
    ui_config_t config = {.terrain_cache=h7_terrain_cache(),
                          .sync_to_refresh=false,
                          .storage_read=checkpoints?lge_h7_checkpoint_read:NULL,
                          .storage_write=checkpoints?lge_h7_checkpoint_write:NULL};
#if GAME_INPUT_COUNT > 0
    config.input_lock=&h7_input_lock;
#endif
    if(!ui_init_with_config(&config)) return false;
#if LGE_H7_HARDWARE_INPUTS
    input_hardware_failed=!lge_h7_inputs_init();
#endif
#if LGE_H7_INPUT_MONITOR
    if(!lge_h7_input_monitor_init()) return false;
#endif
    metrics=lv_label_create(lv_layer_top());
    lv_obj_set_style_text_font(metrics,&lv_font_montserrat_14,0);
    lv_obj_set_style_text_color(metrics,lv_color_hex(0xe1f0db),0);
    lv_obj_set_style_bg_color(metrics,lv_color_hex(0x132c32),0);
    lv_obj_set_style_bg_opa(metrics,230,0);
    lv_obj_set_style_pad_all(metrics,6,0);
    lv_obj_align(metrics,LV_ALIGN_TOP_RIGHT,-8,40);
    lv_label_set_text(metrics,"Measuring display frames...");
    lv_display_add_event_cb(d,display_event,LV_EVENT_ALL,NULL);
    last_ms=lv_tick_get(); lv_timer_create(sample,1000,NULL);
#if LGE_H7_BENCHMARK && 1
    h7_2d_benchmark_init();
#endif
#if LGE_H7_DEBUG_SWD
    lge_h7_swd_init();
#endif
    return true;
}
` + h7Terrain;
