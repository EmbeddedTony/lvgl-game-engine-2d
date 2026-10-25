#ifndef LGE_LVGL_H
#define LGE_LVGL_H
#include "lge.h"
#include "lge_tile_cache.h"
#include "lvgl.h"
/* Set to 0 for a reference per-cell render. Optional strips need no runtime RAM. */
#ifndef LGE_TILE_BATCHES
#define LGE_TILE_BATCHES 1
#endif
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
    lge_engine_t engine;
    lge_event_cb event_callback; /* View lifecycle adapter forwards the original user/context. */
    lv_obj_t *root, *objects[LGE_MAX_NODES], *labels[LGE_MAX_NODES];
    lv_timer_t *timer;
    void (*before_update)(uint32_t now_ms,
                          uint32_t elapsed_ms); /* Owner thread; also runs paused. */
    uint32_t last_tick, last_animation_tick;
    const lge_scene_def_t *pending_scene;
    bool changing;               /* Blocks reentrant load/unload while EXIT is dispatched. */
    lge_tile_cache_t *terrain_cache; /* Optional bounded cache; no pixel heap allocation. */
    lv_display_t *sync_display; /* Optional presentation sync; simulation keeps its own timer. */
    bool debug_collisions;
    lv_obj_t *projectile_surface;
    lv_area_t projectile_area;
    bool projectile_area_valid;
} lge_view_t;
/* Keep the parent alive until lge_view_destroy; use static storage for the view. */
bool lge_view_create(lge_view_t *, lv_obj_t *parent, const lge_scene_def_t *,
                     const lge_audio_backend_t *, lge_event_cb, void *);
bool lge_view_open(lge_view_t *, const lge_scene_def_t *);
/* Safe from events/update callbacks. Applied by the next LVGL timer pass. */
bool lge_view_request_scene(lge_view_t *, const lge_scene_def_t *);
void lge_view_sync(lge_view_t *);
bool lge_view_set_terrain_cache(lge_view_t *, const lge_tile_cache_config_t *);
bool lge_view_set_refresh_sync(lge_view_t *, bool enabled);
void lge_view_set_collision_debug(lge_view_t *, bool enabled);
void lge_view_destroy(lge_view_t *);
#ifdef __cplusplus
}
#endif
#endif
