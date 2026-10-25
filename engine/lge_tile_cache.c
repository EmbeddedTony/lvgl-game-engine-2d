#include "lge_tile_cache.h"
#include "src/misc/cache/instance/lv_image_cache.h"
#include <string.h>

typedef struct {
    const lge_tilemap_t *map;
    lv_image_dsc_t image;
    uint32_t used;
    uint16_t column, row;
    bool pinned;
} cache_slot_t;
struct lge_tile_cache {
    lge_tile_cache_config_t config;
    lge_tile_cache_stats_t stats;
    uint32_t clock;
    size_t slot_bytes;
    bool enabled;
    const lge_tilemap_t *atlas_owner;
    lv_image_dsc_t atlas_image;
    cache_slot_t slots[];
};
bool lge_tile_cache_config_valid(const lge_tile_cache_config_t *c) {
    return !c || (c->pixels && (uintptr_t)c->pixels % 32 == 0 &&
                  (c->color_format == 0 || c->color_format == LV_COLOR_FORMAT_XRGB8888 ||
                   c->color_format == LV_COLOR_FORMAT_RGB565) &&
                  c->bytes >= (c->color_format == LV_COLOR_FORMAT_RGB565 ?
                     LGE_TILE_CACHE_RGB565_SLOT_BYTES : LGE_TILE_CACHE_SLOT_BYTES) &&
                  (!c->atlas || c->color_format == LV_COLOR_FORMAT_RGB565) &&
                  ((c->begin_write != NULL) == (c->publish != NULL)));
}
lge_tile_cache_t *lge_tile_cache_create(const lge_tile_cache_config_t *c) {
    if (!c || !lge_tile_cache_config_valid(c)) return NULL;
    size_t slot_bytes = c->color_format == LV_COLOR_FORMAT_RGB565 ?
        LGE_TILE_CACHE_RGB565_SLOT_BYTES : LGE_TILE_CACHE_SLOT_BYTES;
    unsigned count = (unsigned)LV_MIN(c->bytes / slot_bytes,
                                     LGE_TILE_CACHE_MAX_SLOTS);
    unsigned side = 0;
    if (c->atlas) {
        side = 1;
        while (side * side * 4 <= count) side *= 2;
        count = side * side;
    }
    size_t bytes = sizeof(lge_tile_cache_t) + count * sizeof(cache_slot_t);
    lge_tile_cache_t *cache = lv_malloc_zeroed(bytes);
    if (!cache) return NULL;
    cache->config = *c;
    if (!cache->config.color_format) cache->config.color_format = LV_COLOR_FORMAT_XRGB8888;
    cache->enabled = true;
    cache->slot_bytes = slot_bytes;
    cache->stats.slots = count;
    cache->stats.color_format = cache->config.color_format;
    cache->stats.pixel_bytes = count * slot_bytes;
    cache->stats.metadata_bytes = bytes;
    cache->stats.atlas_edge = side * LGE_TILE_CACHE_EDGE;
    if (side) cache->atlas_image = (lv_image_dsc_t){
        .header = {.magic=LV_IMAGE_HEADER_MAGIC,.cf=LV_COLOR_FORMAT_RGB565,
                   .w=cache->stats.atlas_edge,.h=cache->stats.atlas_edge,
                   .stride=cache->stats.atlas_edge*2},
        .data=c->pixels,.data_size=(uint32_t)cache->stats.pixel_bytes};
    return cache;
}
void lge_tile_cache_clear(lge_tile_cache_t *cache) {
    if (!cache) return;
    if (cache->config.begin_write) cache->config.begin_write(cache->config.context);
    else lv_draw_wait_for_finish();
    lv_image_cache_drop(&cache->atlas_image);
    cache->atlas_owner = NULL;
    for (unsigned i = 0; i < cache->stats.slots; ++i) {
        lv_image_cache_drop(&cache->slots[i].image);
        memset(&cache->slots[i], 0, sizeof(cache->slots[i]));
    }
}
void lge_tile_cache_destroy(lge_tile_cache_t *cache) {
    if (cache) { lge_tile_cache_clear(cache); lv_free(cache); }
}
/* Fixed chunk origin in map cells, independent of camera rounding or clipping. */
static unsigned cells_per_chunk(const lge_tilemap_t *map) {
    return map && map->tile_size && map->tile_size <= LGE_TILE_CACHE_EDGE / 2 &&
                   LGE_TILE_CACHE_EDGE % map->tile_size == 0
               ? LGE_TILE_CACHE_EDGE / map->tile_size : 0;
}
static cache_slot_t *find(lge_tile_cache_t *cache, const lge_tilemap_t *map, int col, int row) {
    unsigned cells = cells_per_chunk(map);
    if (!cells || col < 0 || row < 0) return NULL;
    col = col / (int)cells * (int)cells; row = row / (int)cells * (int)cells;
    if (cache->config.atlas) {
        if (cache->atlas_owner != map) return NULL;
        unsigned side = cache->stats.atlas_edge / LGE_TILE_CACHE_EDGE;
        cache_slot_t *slot = &cache->slots[(unsigned)row / cells % side * side +
                                          (unsigned)col / cells % side];
        return slot->map == map && slot->column == col && slot->row == row ? slot : NULL;
    }
    for (unsigned i = 0; i < cache->stats.slots; ++i) {
        cache_slot_t *slot = &cache->slots[i];
        if (slot->map == map && slot->column == col && slot->row == row) return slot;
    }
    return NULL;
}
void lge_tile_cache_begin(lge_tile_cache_t *cache) {
    if (!cache) return;
    /* Avoid ambiguous LRU order on counter wrap. No chunk becomes invalid. */
    if (++cache->clock == 0) {
        for (unsigned i = 0; i < cache->stats.slots; ++i) cache->slots[i].used = 0;
        cache->clock = 1;
    }
    for (unsigned i = 0; i < cache->stats.slots; ++i) cache->slots[i].pinned = false;
}
void lge_tile_cache_pin(lge_tile_cache_t *cache, const lge_tilemap_t *map,
                         int c0, int c1, int r0, int r1) {
    if (!cache || !cells_per_chunk(map)) return;
    unsigned cells = cells_per_chunk(map);
    for (unsigned i = 0; i < cache->stats.slots; ++i) {
        cache_slot_t *s = &cache->slots[i];
        if (s->map == map && s->column <= c1 && (int)(s->column + cells) > c0 &&
            s->row <= r1 && (int)(s->row + cells) > r0) {
            s->pinned = true; s->used = cache->clock;
        }
    }
}
static bool compose(const lge_tilemap_t *map, int col, int row, uint8_t *pixels,
                    unsigned width, unsigned height, bool rgb565, unsigned stride) {
    lge_tile_cursor_t cursor = {0};
    for (unsigned y = 0; y < height; y += map->tile_size)
        for (unsigned x = 0; x < width; x += map->tile_size) {
            unsigned value = lge_tile_cursor_at(&cursor, map, col + (int)(x / map->tile_size),
                                               row + (int)(y / map->tile_size));
            if (!value || value > map->tile_count ||
                (map->animations && map->animations[value - 1])) return false;
            const lv_image_dsc_t *image = map->tiles[value - 1];
            if (!image || image->header.magic != LV_IMAGE_HEADER_MAGIC ||
                image->header.cf != LV_COLOR_FORMAT_XRGB8888 ||
                image->header.flags || image->header.w != map->tile_size ||
                image->header.h != map->tile_size || image->header.stride < map->tile_size * 4u ||
                image->data_size < (uint32_t)image->header.stride * map->tile_size) return false;
            if (pixels)
                for (unsigned py = 0; py < map->tile_size; ++py) {
                    const uint8_t *source = image->data + py * image->header.stride;
                    if (!rgb565) memcpy(pixels + (y + py) * stride + x * 4,
                                        source, map->tile_size * 4u);
                    else for (unsigned px = 0; px < map->tile_size; ++px) {
                        const uint8_t *color = source + px * 4;
                        uint16_t packed = (uint16_t)(((color[2] >> 3) << 11) |
                                          ((color[1] >> 2) << 5) | (color[0] >> 3));
                        memcpy(pixels + (y + py) * stride + (x + px) * 2, &packed, sizeof(packed));
                    }
                }
        }
    return true;
}
void lge_tile_cache_prepare(lge_tile_cache_t *cache, const lge_tilemap_t *map,
                             int c0, int c1, int r0, int r1) {
    unsigned cells = cells_per_chunk(map);
    if (!cache || !cache->enabled || !cells || c0 < 0 || r0 < 0 || c0 >= map->columns || r0 >= map->rows) return;
    bool rgb565 = cache->config.color_format == LV_COLOR_FORMAT_RGB565;
    if (cache->config.atlas && cache->atlas_owner && cache->atlas_owner != map) return;
    c1 = LV_MIN(c1, map->columns - 1); r1 = LV_MIN(r1, map->rows - 1);
    bool writing = false;
    for (int row = r0 / (int)cells * (int)cells; row <= r1; row += (int)cells)
        for (int col = c0 / (int)cells * (int)cells; col <= c1; col += (int)cells) {
            if (find(cache, map, col, row)) continue;
            unsigned width = LV_MIN(cells, map->columns - (unsigned)col) * map->tile_size;
            unsigned height = LV_MIN(cells, map->rows - (unsigned)row) * map->tile_size;
            unsigned bpp = rgb565 ? 2u : 4u;
            unsigned stride = cache->config.atlas ? cache->stats.atlas_edge * 2u : width * bpp;
            if (!compose(map, col, row, NULL, width, height, rgb565, stride)) continue;
            cache_slot_t *slot = NULL;
            unsigned index = 0;
            if (cache->config.atlas) {
                unsigned side = cache->stats.atlas_edge / LGE_TILE_CACHE_EDGE;
                index = (unsigned)row / cells % side * side + (unsigned)col / cells % side;
                if (!cache->slots[index].pinned) slot = &cache->slots[index];
            } else for (unsigned i = 0; i < cache->stats.slots; ++i) {
                cache_slot_t *s = &cache->slots[i];
                if (!s->pinned && (!slot || !s->map || (slot->map && s->used < slot->used))) {
                    slot = s; index = i;
                    if (!s->map) break;
                }
            }
            if (!slot) continue; /* Budget full of visible entries: per-cell fallback. */
            if (!writing) {
                if (cache->config.begin_write) cache->config.begin_write(cache->config.context);
                else lv_draw_wait_for_finish();
                if (cache->config.atlas) lv_image_cache_drop(&cache->atlas_image);
            }
            writing = true;
            lv_image_cache_drop(&slot->image);
            slot->map = NULL;
            size_t offset = index * cache->slot_bytes;
            if (cache->config.atlas) {
                unsigned side = cache->stats.atlas_edge / LGE_TILE_CACHE_EDGE;
                offset = ((index / side) * LGE_TILE_CACHE_EDGE * cache->stats.atlas_edge +
                           (index % side) * LGE_TILE_CACHE_EDGE) * 2u;
            }
            uint8_t *data = (uint8_t *)cache->config.pixels + offset;
            if (!compose(map, col, row, data, width, height, rgb565, stride)) continue;
            size_t bytes = (height - 1) * stride + width * bpp;
            if (cache->config.publish && !cache->config.publish(cache->config.context, data, bytes)) {
                ++cache->stats.failures; continue;
            }
            slot->image = (lv_image_dsc_t){
                .header = {.magic = LV_IMAGE_HEADER_MAGIC, .cf = cache->config.color_format,
                           .w = width, .h = height, .stride = stride},
                .data = data, .data_size = (uint32_t)bytes};
            slot->column = (uint16_t)col; slot->row = (uint16_t)row;
            slot->map = map; slot->pinned = true; slot->used = cache->clock;
            if (cache->config.atlas) cache->atlas_owner = map;
            ++cache->stats.builds;
        }
}
const lv_image_dsc_t *lge_tile_cache_image(lge_tile_cache_t *cache, const lge_tilemap_t *map,
                                           int col, int row) {
    if (!cache || !cache->enabled) return NULL;
    cache_slot_t *slot = find(cache, map, col, row);
    if (!slot) return NULL;
    ++cache->stats.draws;
    return cache->config.atlas ? &cache->atlas_image : &slot->image;
}
const lge_tile_cache_stats_t *lge_tile_cache_stats(const lge_tile_cache_t *cache) {
    return cache ? &cache->stats : NULL;
}
void lge_tile_cache_set_enabled(lge_tile_cache_t *cache, bool enabled) {
    if (cache) cache->enabled = enabled;
}
bool lge_tile_cache_enabled(const lge_tile_cache_t *cache) { return cache && cache->enabled; }
