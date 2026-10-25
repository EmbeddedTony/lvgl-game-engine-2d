#ifndef LGE_TILE_CACHE_H
#define LGE_TILE_CACHE_H
#include "lge.h"
#include "lvgl.h"
#ifdef __cplusplus
extern "C" {
#endif

/* Optional, caller-owned storage. No pixel heap allocation, no asset mutation.
 * XRGB8888 retains original channels; optional RGB565 is only used on opaque
 * RGB565 output layers, preserving their final pixels. Only static, opaque,
 * unscaled XRGB8888 cells are cached; everything else draws normally.
 * GPU ports must supply both ownership callbacks. Software may omit both.
 * Callbacks and memory remain valid until the cache is detached/destroyed. */
#define LGE_TILE_CACHE_EDGE 128u
#define LGE_TILE_CACHE_SLOT_BYTES (LGE_TILE_CACHE_EDGE * LGE_TILE_CACHE_EDGE * 4u)
#define LGE_TILE_CACHE_RGB565_SLOT_BYTES (LGE_TILE_CACHE_EDGE * LGE_TILE_CACHE_EDGE * 2u)
#define LGE_TILE_CACHE_MAX_SLOTS 64u
typedef struct {
    void *pixels;
    size_t bytes;
    void *context;
    void (*begin_write)(void *context); /* Finish all outstanding source reads. */
    bool (*publish)(void *context, const void *pixels, size_t bytes);
    lv_color_format_t color_format; /* 0/XRGB8888: full channels; RGB565: only drawn to RGB565. */
    bool atlas; /* RGB565 ring atlas: merge ready chunks without another pixel buffer. */
} lge_tile_cache_config_t;
typedef struct {
    uint32_t builds, draws, failures;
    size_t pixel_bytes, metadata_bytes;
    unsigned slots;
    lv_color_format_t color_format;
    unsigned atlas_edge; /* 0 for independent chunks. */
} lge_tile_cache_stats_t;
typedef struct lge_tile_cache lge_tile_cache_t;
bool lge_tile_cache_config_valid(const lge_tile_cache_config_t *);
lge_tile_cache_t *lge_tile_cache_create(const lge_tile_cache_config_t *);
void lge_tile_cache_destroy(lge_tile_cache_t *);
void lge_tile_cache_clear(lge_tile_cache_t *);
/* Prepare outside LVGL draw callbacks. Pin every visible map first, then fill:
 * a small cache never evicts another visible chunk, preventing scan thrashing. */
void lge_tile_cache_begin(lge_tile_cache_t *);
void lge_tile_cache_pin(lge_tile_cache_t *, const lge_tilemap_t *, int, int, int, int);
void lge_tile_cache_prepare(lge_tile_cache_t *, const lge_tilemap_t *, int, int, int, int);
const lv_image_dsc_t *lge_tile_cache_image(lge_tile_cache_t *, const lge_tilemap_t *, int, int);
const lge_tile_cache_stats_t *lge_tile_cache_stats(const lge_tile_cache_t *);
void lge_tile_cache_set_enabled(lge_tile_cache_t *, bool);
bool lge_tile_cache_enabled(const lge_tile_cache_t *);
#ifdef __cplusplus
}
#endif
#endif
