/** Fixed external PSRAM reservation on this verified board, never generic MCU RAM. */
export const H7_TERRAIN_CACHE_BYTES = 0;
export const h7Terrain = String.raw`
#ifndef LGE_H7_TERRAIN_CACHE_BYTES
#define LGE_H7_TERRAIN_CACHE_BYTES 0
#endif
#if LV_USE_NEMA_GFX && !LGE_H7_SOFTWARE_COMPARE && LGE_H7_TERRAIN_CACHE_BYTES
static uint8_t h7_terrain_pixels[LGE_H7_TERRAIN_CACHE_BYTES]
    __attribute__((section("LgeTerrainCache"),aligned(32)));
static void h7_terrain_begin(void *context) {
    (void)context;
    lv_draw_wait_for_finish();
}
static bool h7_terrain_publish(void *context, const void *pixels, size_t bytes) {
    (void)context;
    uintptr_t start = (uintptr_t)pixels & ~(uintptr_t)31;
    uintptr_t end = ((uintptr_t)pixels + bytes + 31) & ~(uintptr_t)31;
    if(SCB->CCR & SCB_CCR_DC_Msk)
        SCB_CleanDCache_by_Addr((uint32_t *)start, (int32_t)(end-start));
    __DSB();
    bool coherent = HAL_ICACHE_Invalidate() == HAL_OK;
    __DSB();
    return coherent;
}
static const lge_tile_cache_config_t *h7_terrain_cache(void) {
    static const lge_tile_cache_config_t config = {
        .pixels=h7_terrain_pixels,.bytes=sizeof(h7_terrain_pixels),
        .begin_write=h7_terrain_begin,.publish=h7_terrain_publish,
        .color_format=LV_COLOR_FORMAT_RGB565,.atlas=true};
    return &config;
}
#else
static const lge_tile_cache_config_t *h7_terrain_cache(void) { return NULL; }
#endif
#if LGE_H7_BENCHMARK
/* Engineering-only normal input, with a seqlock snapshot of actual camera
 * movement and cache use. No positions are teleported during measurement. */
volatile uint32_t lge_h7_benchmark_mode __attribute__((section("LgeTelemetry"),aligned(32)));
volatile uint32_t lge_h7_benchmark_state[16] __attribute__((section("LgeTelemetry"),aligned(32)));
static void h7_2d_benchmark(lv_timer_t *timer) {
    (void)timer;
    static uint32_t previous,started,sequence;
    uint32_t mode = lge_h7_benchmark_mode;
    if(mode != previous) {
        ui_set_input(0); ui_set_paused(mode == 3);
        ui_terrain_cache_set_enabled(mode != 4 && mode != 5);
        ui_set_refresh_sync(mode != 5);
        /* Isolate the engineering route from physical touch/latched buttons. */
        for(lv_indev_t *input=lv_indev_get_next(NULL);input;input=lv_indev_get_next(input)) {
            lv_indev_enable(input,mode == 0);
            lv_indev_reset(input,NULL);
        }
        if(ui_game()) for(unsigned i=0;i<ui_game()->scene->count;i++)
            lge_button_input(&ui_game()->nodes[i],false);
        if(mode == 1 || mode == 4 || mode == 5) ui_request_scene(ui_current_scene());
        previous=mode; started=lv_tick_get();
    }
    uint32_t elapsed=lv_tick_get()-started;
    if(mode == 1 || mode == 4 || mode == 5) ui_set_input(elapsed%6000 < 3000 ? UI_INPUT_RIGHT : UI_INPUT_LEFT);
    else if(mode != 0) ui_set_input(0);
    lge_node_t *player=ui_find_node("player");
    float cx=0,cy=0; ui_camera_position(&cx,&cy);
    const lge_tile_cache_stats_t *cache=ui_terrain_cache_stats();
    sequence+=2; lge_h7_benchmark_state[0]=sequence-1; __DMB();
    lge_h7_benchmark_state[1]=mode;
    lge_h7_benchmark_state[2]=elapsed;
    lge_h7_benchmark_state[3]=ui_game() ? lge_input(ui_game()) : 0;
    union {float f; uint32_t u;} x={.f=player?player->x:0},y={.f=player?player->y:0},
        camera_x={.f=cx},camera_y={.f=cy};
    lge_h7_benchmark_state[4]=x.u;lge_h7_benchmark_state[5]=y.u;
    lge_h7_benchmark_state[6]=camera_x.u;lge_h7_benchmark_state[7]=camera_y.u;
    lge_h7_benchmark_state[8]=cache?cache->builds:0;
    lge_h7_benchmark_state[9]=cache?cache->draws:0;
    lge_h7_benchmark_state[10]=cache?cache->failures:0;
    lge_h7_benchmark_state[11]=cache?(uint32_t)cache->pixel_bytes:0;
    lge_h7_benchmark_state[12]=cache?(uint32_t)cache->metadata_bytes:0;
    lge_h7_benchmark_state[13]=LTDC_Layer1->CFBAR;
    lge_h7_benchmark_state[14]=lv_tick_get();
    lge_h7_benchmark_state[15]=sequence; __DMB(); lge_h7_benchmark_state[0]=sequence;
}
static void h7_2d_benchmark_init(void) {
    lge_h7_benchmark_mode=0;
    for(unsigned i=0;i<16;i++) lge_h7_benchmark_state[i]=0;
    lv_timer_create(h7_2d_benchmark,10,NULL);
}
#endif
`;
