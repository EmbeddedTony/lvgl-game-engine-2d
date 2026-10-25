#include "lge_melee.h"
#include "lge_lvgl.h"
#include "lge_gameplay.h"
#include "lge_lvgl_compat.h"
#include "src/misc/cache/instance/lv_image_cache.h"
#include <stdio.h>
#include <string.h>
#include <math.h>
#if !defined(LGE_DESKTOP_PLAYTEST) && LGE_ACCELERATION_STRICT
#if defined(LGE_REQUIRE_DMA2D) && LGE_REQUIRE_DMA2D && !LV_USE_DRAW_DMA2D
#error "Include ui/lv_conf_acceleration.h in lv_conf.h and configure the STM32 DMA2D HAL header"
#endif
#if defined(LGE_REQUIRE_NEOCHROM) && LGE_REQUIRE_NEOCHROM && !LV_USE_NEMA_GFX
#error "Enable LV_USE_NEMA_GFX and configure the NeoChrom/NemaGFX SDK and HAL"
#endif
#endif
#if LVGL_VERSION_MAJOR != 9 || LVGL_VERSION_MINOR < 4
#error "LVGL Game Engine requires LVGL 9.4 or later within the 9.x series"
#endif



/* Intersect before decoding: work follows the dirty/visible window, not world area. */
static bool tile_window(const lge_tilemap_t *map, lv_area_t origin, lv_area_t clip, int *c0,
                        int *c1, int *r0, int *r1) {
    int32_t left = LV_MAX(origin.x1, clip.x1), top = LV_MAX(origin.y1, clip.y1);
    int32_t right = LV_MIN(origin.x2, clip.x2), bottom = LV_MIN(origin.y2, clip.y2);
    if (left > right || top > bottom)
        return false;
    *c0 = (left - origin.x1) / map->tile_size;
    *c1 = LV_MIN((right - origin.x1) / map->tile_size, map->columns - 1);
    *r0 = (top - origin.y1) / map->tile_size;
    *r1 = LV_MIN((bottom - origin.y1) / map->tile_size, map->rows - 1);
    return *c0 <= *c1 && *r0 <= *r1;
}
static void tilemap_draw_cells(const lge_node_t *node, lv_obj_t *object, lv_layer_t *layer,
                               lv_area_t origin, int c0, int c1, int r0, int r1) {
    const lge_tilemap_t *map = node->definition->tilemap;
    lge_tile_cursor_t cursor = {0};
    lv_draw_image_dsc_t dsc;
    lv_draw_image_dsc_init(&dsc);
    dsc.antialias = false;
    dsc.base.obj = object;
    for (int row = r0; row <= r1; ++row)
        for (int col = c0; col <= c1;) {
            uint16_t value = lge_tile_cursor_at(&cursor, map, col, row);
            if (!value || value > map->tile_count) {
                ++col;
                continue;
            }
            unsigned count = 1, image_cells = 1;
            dsc.src = lge_tile_image(map, value, node->owner->ticks);
#if LGE_TILE_BATCHES
            if (map->row_strips && map->row_strips[value - 1] &&
                (!map->animations || !map->animations[value - 1])) {
                const lv_image_dsc_t *strip = map->row_strips[value - 1];
                /* Hand-written/legacy maps retain the per-cell fallback. */
                if (strip->header.h == map->tile_size && strip->header.w % map->tile_size == 0 &&
                    strip->header.w > map->tile_size) {
                    unsigned capacity = strip->header.w / map->tile_size;
                    while (count < capacity && col + (int)count <= c1 &&
                           lge_tile_cursor_at(&cursor, map, col + (int)count, row) == value)
                        ++count;
                    if (count > 1) {
                        dsc.src = strip;
                        image_cells = capacity;
                    }
                }
            }
#endif
            int32_t x = origin.x1 + col * map->tile_size, y = origin.y1 + row * map->tile_size;
            lv_area_t area = {x, y, x + (int32_t)image_cells * map->tile_size - 1,
                              y + map->tile_size - 1};
            /* A short run uses the beginning of the strip. Clip task creation,
             * keeping source coordinates intact; adjacent tiles never bleed. */
            int32_t clip_right = layer->_clip_area.x2;
            layer->_clip_area.x2 = LV_MIN(clip_right, x + (int32_t)count * map->tile_size - 1);
            lv_draw_image(layer, &dsc, &area);
            layer->_clip_area.x2 = clip_right;
            col += (int)count;
        }
}
/* Ring-atlas coordinates repeat in map space. Draw only proven-ready opaque
 * rectangles, split at the texture wrap. No stale/transparent/animated chunk
 * is sampled, including on partial-buffer and dirty-rectangle renders. */
static void draw_terrain_atlas(lv_layer_t *layer, lv_obj_t *object, lv_area_t origin,
                               const lv_image_dsc_t *image, lv_area_t region) {
    int edge = (int)image->header.w;
    lv_area_t original_clip = layer->_clip_area;
    lv_draw_image_dsc_t dsc;
    lv_draw_image_dsc_init(&dsc);
    dsc.src = image;
    dsc.antialias = false;
    dsc.base.obj = object;
    for (int y = region.y1 / edge * edge; y <= region.y2; y += edge)
        for (int x = region.x1 / edge * edge; x <= region.x2; x += edge) {
            lv_area_t image_area = {origin.x1 + x, origin.y1 + y, origin.x1 + x + edge - 1,
                                    origin.y1 + y + edge - 1};
            lv_area_t clip = {
                LV_MAX(original_clip.x1, origin.x1 + LV_MAX(region.x1, x)),
                LV_MAX(original_clip.y1, origin.y1 + LV_MAX(region.y1, y)),
                LV_MIN(original_clip.x2, origin.x1 + LV_MIN(region.x2, x + edge - 1)),
                LV_MIN(original_clip.y2, origin.y1 + LV_MIN(region.y2, y + edge - 1))};
            if (clip.x1 > clip.x2 || clip.y1 > clip.y2)
                continue;
            layer->_clip_area = clip;
            lv_draw_image(layer, &dsc, &image_area);
            layer->_clip_area = original_clip;
        }
}
static void append_terrain_rect(lv_area_t *areas, unsigned *count, lv_area_t area) {
    for (unsigned i = 0; i < *count; ++i)
        if (areas[i].x1 == area.x1 && areas[i].x2 == area.x2 && areas[i].y2 + 1 == area.y1) {
            areas[i].y2 = area.y2;
            return;
        }
    /* Each new rectangle consumes at least one distinct ready chunk. */
    if (*count < LGE_TILE_CACHE_MAX_SLOTS)
        areas[(*count)++] = area;
}
static void tilemap_draw(lv_event_t *event) {
    const lge_node_t *node = lv_event_get_user_data(event);
    const lge_tilemap_t *map = node->definition->tilemap;
    lge_tile_cache_t *cache = ((lge_view_t *)node->owner)->terrain_cache;
    lv_obj_t *object = lv_event_get_target_obj(event);
    lv_layer_t *layer = lv_event_get_layer(event);
    lv_area_t origin;
    lv_obj_get_coords(object, &origin);
    int c0, c1, r0, r1;
    if (!tile_window(map, origin, layer->_clip_area, &c0, &c1, &r0, &r1))
        return;
    const lge_tile_cache_stats_t *stats = lge_tile_cache_stats(cache);
    bool native565 = stats && stats->color_format == LV_COLOR_FORMAT_RGB565;
    if (!lge_tile_cache_enabled(cache) ||
        node->definition->width != map->columns * map->tile_size ||
        node->definition->height != map->rows * map->tile_size ||
        map->tile_size > LGE_TILE_CACHE_EDGE / 2 || LGE_TILE_CACHE_EDGE % map->tile_size != 0 ||
        (native565 &&
         (layer->color_format != LV_COLOR_FORMAT_RGB565 ||
          lv_obj_get_style_opa_recursive(object, LV_PART_MAIN) != LV_OPA_COVER ||
          lv_obj_get_style_blend_mode(object, LV_PART_MAIN) != LV_BLEND_MODE_NORMAL))) {
        tilemap_draw_cells(node, object, layer, origin, c0, c1, r0, r1);
        return;
    }
    int cells = LGE_TILE_CACHE_EDGE / map->tile_size;
    lv_area_t cached_areas[LGE_TILE_CACHE_MAX_SLOTS];
    unsigned cached_count = 0;
    const lv_image_dsc_t *atlas = NULL;
    for (int row = r0; row <= r1;) {
        int row_end = LV_MIN(r1, (row / cells + 1) * cells - 1);
        for (int col = c0; col <= c1;) {
            int col_end = LV_MIN(c1, (col / cells + 1) * cells - 1);
            const lv_image_dsc_t *image = lge_tile_cache_image(cache, map, col, row);
            if (image) {
                if (stats->atlas_edge) {
                    atlas = image;
                    while (col_end < c1 && lge_tile_cache_image(cache, map, col_end + 1, row))
                        col_end = LV_MIN(c1, (col_end / cells + 2) * cells - 1);
                    lv_area_t area = {col / cells * (int)LGE_TILE_CACHE_EDGE,
                                      row / cells * (int)LGE_TILE_CACHE_EDGE,
                                      LV_MIN((col_end / cells + 1) * (int)LGE_TILE_CACHE_EDGE,
                                             map->columns * map->tile_size) -
                                          1,
                                      LV_MIN((row_end / cells + 1) * (int)LGE_TILE_CACHE_EDGE,
                                             map->rows * map->tile_size) -
                                          1};
                    append_terrain_rect(cached_areas, &cached_count, area);
                    col = col_end + 1;
                    continue;
                }
                int x = origin.x1 + col / cells * (int)LGE_TILE_CACHE_EDGE;
                int y = origin.y1 + row / cells * (int)LGE_TILE_CACHE_EDGE;
                lv_area_t area = {x, y, x + (int)image->header.w - 1, y + (int)image->header.h - 1};
                lv_draw_image_dsc_t dsc;
                lv_draw_image_dsc_init(&dsc);
                dsc.src = image;
                dsc.antialias = false;
                dsc.base.obj = object;
                lv_draw_image(layer, &dsc, &area);
            } else {
                /* Keep existing strip batches across adjacent uncached chunks.
                 * A tiny cache must not fragment an otherwise efficient row. */
                while (col_end < c1 && !lge_tile_cache_image(cache, map, col_end + 1, row))
                    col_end = LV_MIN(c1, (col_end / cells + 2) * cells - 1);
                tilemap_draw_cells(node, object, layer, origin, col, col_end, row, row_end);
            }
            col = col_end + 1;
        }
        row = row_end + 1;
    }
    for (unsigned i = 0; i < cached_count; ++i)
        draw_terrain_atlas(layer, object, origin, atlas, cached_areas[i]);
}
static void tilemap_cover(lv_event_t *event) {
    const lge_node_t *node = lv_event_get_user_data(event);
    const lge_tilemap_t *map = node->definition->tilemap;
    lv_obj_t *object = lv_event_get_target_obj(event);
    const lv_area_t *cover = lv_event_get_cover_area(event);
    if (!map->opaque || !cover || lv_obj_get_style_opa(object, 0) != LV_OPA_COVER ||
        lv_obj_get_style_clip_corner(object, 0))
        return;
    lv_area_t area;
    lv_obj_get_coords(object, &area);
    area.x2 = LV_MIN(area.x2, area.x1 + (int32_t)map->columns * map->tile_size - 1);
    area.y2 = LV_MIN(area.y2, area.y1 + (int32_t)map->rows * map->tile_size - 1);
    if (cover->x1 >= area.x1 && cover->y1 >= area.y1 && cover->x2 <= area.x2 &&
        cover->y2 <= area.y2)
        lv_event_set_cover_res(event, LV_COVER_RES_COVER);
}
static void prepare_terrain(lge_view_t *view) {
    if (!lge_tile_cache_enabled(view->terrain_cache))
        return;
    lv_obj_update_layout(view->root); /* Camera positions must precede cache-window selection. */
    lv_area_t viewport;
    lv_obj_get_coords(view->root, &viewport);
    lge_tile_cache_begin(view->terrain_cache);
    /* Pin all maps before admitting misses. A multi-layer scene shares one budget. */
    for (unsigned pass = 0; pass < 2; ++pass)
        for (unsigned i = 0; i < view->engine.scene->count; ++i) {
            lge_node_t *n = &view->engine.nodes[i];
            const lge_tilemap_t *map = n->definition->tilemap;
            if (!map || !view->objects[i] || !n->effective_visible)
                continue;
            if (n->definition->width != map->columns * map->tile_size ||
                n->definition->height != map->rows * map->tile_size)
                continue;
            lv_area_t origin;
            lv_obj_get_coords(view->objects[i], &origin);
            int c0, c1, r0, r1;
            if (!tile_window(map, origin, viewport, &c0, &c1, &r0, &r1))
                continue;
            if (!pass)
                lge_tile_cache_pin(view->terrain_cache, map, c0, c1, r0, r1);
            else
                lge_tile_cache_prepare(view->terrain_cache, map, c0, c1, r0, r1);
        }
}
bool lge_view_set_terrain_cache(lge_view_t *view, const lge_tile_cache_config_t *config) {
    if (!view || view->changing || !lge_tile_cache_config_valid(config))
        return false;
    lge_tile_cache_t *next = config ? lge_tile_cache_create(config) : NULL;
    if (config && !next)
        return false;
    lge_tile_cache_destroy(view->terrain_cache);
    view->terrain_cache = next;
    if (view->root && view->engine.scene)
        prepare_terrain(view);
    return true;
}
static void controller_cb(lv_event_t *event) {
    lge_node_t *n = lv_event_get_user_data(event);
    lv_event_code_t code = lv_event_get_code(event);
    lge_button_input(n, code == LV_EVENT_PRESSED || code == LV_EVENT_PRESSING);
}
static void click_cb(lv_event_t *event) {
    lge_click(lv_event_get_user_data(event));
}
static void debug_box(lv_layer_t *layer, lv_area_t origin, lge_box_t box, uint32_t color) {
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_opa = LV_OPA_TRANSP;
    dsc.border_opa = LV_OPA_COVER;
    dsc.border_width = 1;
    dsc.border_color = lv_color_hex(color);
    lv_area_t area = {origin.x1 + (int32_t)roundf(box.x), origin.y1 + (int32_t)roundf(box.y),
                      origin.x1 + (int32_t)roundf(box.x + box.width) - 1,
                      origin.y1 + (int32_t)roundf(box.y + box.height) - 1};
    lv_draw_rect(layer, &dsc, &area);
}
static void debug_shape(lv_layer_t *layer, lv_area_t origin, lge_box_t box, uint32_t color,
                        unsigned slope) {
    if (!slope) {
        debug_box(layer, origin, box, color);
        return;
    }
    lv_draw_line_dsc_t d;
    lv_draw_line_dsc_init(&d);
    d.color = lv_color_hex(color);
    d.width = 1;
    d.opa = LV_OPA_COVER;
    float x = origin.x1 + roundf(box.x), y = origin.y1 + roundf(box.y), w = box.width - 1,
          h = box.height - 1;
    lv_point_precise_t points[3] = {{x, y + (slope == 1 ? h : 0)},
                                    {x + w, y + (slope == 1 ? 0 : h)},
                                    {x + (slope == 1 ? w : 0), y + h}};
    for (unsigned i = 0; i < 3; ++i) {
        d.p1 = points[i];
        d.p2 = points[(i + 1) % 3];
        lv_draw_line(layer, &d);
    }
}
static void collision_draw(lv_event_t *event) {
    lge_view_t *v = lv_event_get_user_data(event);
    if (!v->debug_collisions || !v->engine.scene)
        return;
    lv_area_t origin;
    lv_obj_get_coords(v->root, &origin);
    lv_layer_t *layer = lv_event_get_layer(event);
    float camera_x = 0, camera_y = 0;
    lge_camera_position(&v->engine, &camera_x, &camera_y);
    for (unsigned i = 0; i < v->engine.scene->count; ++i) {
        const lge_node_t *n = &v->engine.nodes[i];
        lge_body_type_t type = lge_body_type(n);
        if (!n->effective_visible || type == LGE_BODY_NONE)
            continue;
        uint32_t color = type == LGE_BODY_CHARACTER ? 0x63b6ff
                         : type == LGE_BODY_AREA    ? 0xe8ba65
                                                    : 0x69d6a4;
        const lge_tilemap_t *map = n->definition->tilemap;
        lv_area_t node_origin = origin;
        if (!n->definition->ui_layer) {
            node_origin.x1 -= (int32_t)camera_x;
            node_origin.y1 -= (int32_t)camera_y;
        }
        if (!map)
            debug_shape(layer, node_origin, lge_node_bounds(n), color,
                        n->definition->physics ? n->definition->physics->slope : 0);
        else {
            /* Walk RLE once instead of performing a linear lookup per cell. */
            uint32_t cell = 0, cells = (uint32_t)map->columns * map->rows;
            uint32_t runs = map->cells ? cells : map->run_count;
            for (uint32_t run = 0; run < runs && cell < cells; ++run) {
                unsigned count = map->cells ? 1 : map->runs[run * 2];
                unsigned tile = map->cells ? map->cells[run] : map->runs[run * 2 + 1];
                if (!lge_tile_is_solid(map, (uint16_t)tile)) {
                    cell += count;
                    continue;
                }
                for (unsigned j = 0; j < count && cell < cells; ++j, ++cell) {
                    lge_box_t box = {roundf(n->x) + (cell % map->columns) * map->tile_size,
                                     roundf(n->y) + (cell / map->columns) * map->tile_size,
                                     map->tile_size, map->tile_size};
                    float cx = n->definition->ui_layer ? 0 : camera_x,
                          cy = n->definition->ui_layer ? 0 : camera_y;
                    if (box.x + box.width < cx || box.y + box.height < cy ||
                        box.x >= cx + v->engine.scene->width ||
                        box.y >= cy + v->engine.scene->height)
                        continue;
                    debug_shape(layer, node_origin, box, color,
                                map->slopes ? map->slopes[tile - 1] : 0);
                }
            }
        }
    }
}
void lge_view_set_collision_debug(lge_view_t *v, bool enabled) {
    if (!v || !v->root)
        return;
    v->debug_collisions = enabled;
    lv_obj_invalidate(v->root);
}
/* Stable insertion order at the 128-node cap; touch LVGL order only when it changes. */
static void projectiles_draw(lv_event_t *event) {
    lge_view_t *v = lv_event_get_user_data(event);
    const lge_projectiles_t *pool = v->engine.projectiles;
    if (!pool)
        return;
    lv_area_t origin;
    lv_obj_get_coords(lv_event_get_target_obj(event), &origin);
    float cx = 0, cy = 0;
    lge_camera_position(&v->engine, &cx, &cy);
    lv_draw_rect_dsc_t d;
    lv_draw_rect_dsc_init(&d);
    d.bg_opa = LV_OPA_COVER;
    d.radius = LV_RADIUS_CIRCLE;
    for (unsigned i = 0; i < pool->capacity; ++i) {
        const lge_projectile_t *b = &pool->slots[i];
        if (b->remaining <= 0)
            continue;
        int x = (int)roundf(b->x - cx) + origin.x1, y = (int)roundf(b->y - cy) + origin.y1,
            r = b->pattern->radius;
        lv_area_t a = {x - r, y - r, x + r - 1, y + r - 1};
        d.bg_color = lv_color_hex(b->pattern->color);
        lv_draw_rect(lv_event_get_layer(event), &d, &a);
    }
}
/* Invalidate old/new occupied bounds, rather than forcing a full-screen repaint
 * for a single shot. Dense patterns may naturally cover the whole viewport. */
static void invalidate_projectiles(lge_view_t *v) {
    if (!v->projectile_surface)
        return;
    if (v->projectile_area_valid)
        lv_obj_invalidate_area(v->projectile_surface, &v->projectile_area);
    v->projectile_area_valid = false;
    lv_area_t origin;
    lv_obj_get_coords(v->projectile_surface, &origin);
    float cx = 0, cy = 0;
    lge_camera_position(&v->engine, &cx, &cy);
    const lge_projectiles_t *pool = v->engine.projectiles;
    for (unsigned i = 0; i < pool->capacity; ++i) {
        const lge_projectile_t *b = &pool->slots[i];
        if (b->remaining <= 0)
            continue;
        int x = (int)roundf(b->x - cx) + origin.x1, y = (int)roundf(b->y - cy) + origin.y1,
            r = b->pattern->radius;
        lv_area_t a = {x - r, y - r, x + r - 1, y + r - 1};
        if (!v->projectile_area_valid) {
            v->projectile_area = a;
            v->projectile_area_valid = true;
        } else {
            v->projectile_area.x1 = LV_MIN(v->projectile_area.x1, a.x1);
            v->projectile_area.y1 = LV_MIN(v->projectile_area.y1, a.y1);
            v->projectile_area.x2 = LV_MAX(v->projectile_area.x2, a.x2);
            v->projectile_area.y2 = LV_MAX(v->projectile_area.y2, a.y2);
        }
    }
    if (v->projectile_area_valid)
        lv_obj_invalidate_area(v->projectile_surface, &v->projectile_area);
}
static void sync_draw_order(lge_view_t *v) {
    uint16_t order[LGE_MAX_NODES];
    float feet_y[LGE_MAX_NODES];
    unsigned count = 0;
    for (unsigned i = 0; i < v->engine.scene->count; ++i)
        if (v->objects[i]) {
            lge_node_t *n = &v->engine.nodes[i];
            const lge_node_def_t *d = n->definition;
            float y = 0;
            if (d->sort_y) {
                lge_box_t feet = lge_node_bounds(n);
                y = feet.y + feet.height;
            }
            feet_y[i] = y;
            unsigned pos = count;
            while (pos > 0) {
                lge_node_t *b = &v->engine.nodes[order[pos - 1]];
                const lge_node_def_t *bd = b->definition;
                float by = feet_y[order[pos - 1]];
                bool before = d->ui_layer != bd->ui_layer ? !d->ui_layer
                              : d->z_index != bd->z_index ? d->z_index < bd->z_index
                                                          : y < by;
                if (!before)
                    break;
                order[pos] = order[pos - 1];
                --pos;
            }
            order[pos] = (uint16_t)i;
            ++count;
        }
    int32_t offset = 0;
    unsigned world = 0;
    for (unsigned i = 0; i < count; ++i) {
        bool ui = v->engine.nodes[order[i]].definition->ui_layer;
        if (!ui)
            ++world;
        int32_t index = (int32_t)i + offset + (ui && v->projectile_surface ? 1 : 0);
        /* Children have a public O(1) indexed lookup; get_index scans siblings. */
        if (lv_obj_get_child(v->root, index) != v->objects[order[i]])
            lv_obj_move_to_index(v->objects[order[i]], index);
    }
    if (v->projectile_surface &&
        lv_obj_get_child(v->root, (int32_t)world + offset) != v->projectile_surface)
        lv_obj_move_to_index(v->projectile_surface, (int32_t)world + offset);
}
static void invalidate_tiles(lge_view_t *v, const lge_node_t *n, lv_obj_t *object) {
    const lge_tilemap_t *m = n->definition->tilemap;
    if (!m || !m->animations || !n->effective_visible || v->last_animation_tick == v->engine.ticks)
        return;
    bool changed[256] = {false}, any = false;
    for (unsigned value = 1; value <= m->tile_count; ++value) {
        changed[value] = lge_tile_image(m, (uint16_t)value, v->last_animation_tick) !=
                         lge_tile_image(m, (uint16_t)value, v->engine.ticks);
        any |= changed[value];
    }
    if (!any)
        return;
    lv_area_t origin, viewport;
    lv_obj_get_coords(object, &origin);
    lv_obj_get_coords(v->root, &viewport);
    int c0, c1, r0, r1;
    if (!tile_window(m, origin, viewport, &c0, &c1, &r0, &r1))
        return;
    lge_tile_cursor_t cursor = {0};
    for (int row = r0; row <= r1; ++row) {
        int first = -1;
        for (int col = c0; col <= c1 + 1; ++col) {
            uint16_t value = col <= c1 ? lge_tile_cursor_at(&cursor, m, col, row) : 0;
            if (value <= m->tile_count && changed[value]) {
                if (first < 0)
                    first = col;
            } else if (first >= 0) {
                /* Adjacent water cells share one dirty span, not one LVGL invalidation each. */
                int y = origin.y1 + row * m->tile_size;
                lv_area_t area = {origin.x1 + first * m->tile_size, y,
                                  origin.x1 + col * m->tile_size - 1, y + m->tile_size - 1};
                lv_obj_invalidate_area(object, &area);
                first = -1;
            }
        }
    }
}
void lge_view_sync(lge_view_t *v) {
    lge_engine_t *g = &v->engine;
    if (!g->scene)
        return;
    lge_sync_hierarchy(g);
    if (v->debug_collisions)
        lv_obj_invalidate(v->root);
    invalidate_projectiles(v);
    sync_draw_order(v);
    float camera_x = 0, camera_y = 0;
    lge_camera_position(g, &camera_x, &camera_y);
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        const lge_node_def_t *d = n->definition;
        if (!v->objects[i])
            continue; /* Groups/instance roots consume no LVGL widget. */
        lge_lvgl_set_hidden(v->objects[i], !n->effective_visible);
        lv_obj_set_pos(v->objects[i], (int32_t)roundf(n->x - (d->ui_layer ? 0 : camera_x)),
                       (int32_t)roundf(n->y - (d->ui_layer ? 0 : camera_y)));
        invalidate_tiles(v, n, v->objects[i]);
        if (d->kind == LGE_SPRITE && n->image && lv_image_get_src(v->objects[i]) != n->image)
            lv_image_set_src(v->objects[i], n->image);
        if (d->binding == LGE_BIND_SCORE && v->labels[i]) {
            char text[192];
            snprintf(text, sizeof(text), "%s %u / %u", d->text ? d->text : "", g->score, g->total);
            if (strcmp(lv_label_get_text(v->labels[i]), text))
                lv_label_set_text(v->labels[i], text);
        } else if (d->binding == LGE_BIND_STATUS && v->labels[i]) {
            const char *text = g->complete ? g->scene->completion : g->scene->objective;
            if (strcmp(lv_label_get_text(v->labels[i]), text))
                lv_label_set_text(v->labels[i], text);
        }
    }
    v->last_animation_tick = g->ticks;
    prepare_terrain(v);
}
static void refresh_sync(lv_event_t *event) {
    lge_view_t *v = lv_event_get_user_data(event);
    if (v->sync_display && !v->changing && v->engine.scene)
        lge_view_sync(v);
}
bool lge_view_set_refresh_sync(lge_view_t *v, bool enabled) {
    if (!v || !v->root || v->changing)
        return false;
    lv_display_t *display = enabled ? lv_obj_get_display(v->root) : NULL;
    if (enabled && !display)
        return false;
    if (display == v->sync_display)
        return true;
    if (v->sync_display)
        lv_display_remove_event_cb_with_user_data(v->sync_display, refresh_sync, v);
    v->sync_display = display;
    if (display) {
        lv_display_add_event_cb(display, refresh_sync, LV_EVENT_REFR_START, v);
        lv_timer_resume(lv_display_get_refr_timer(display));
    } else
        lge_view_sync(v);
    return true;
}
static void update_cb(lv_timer_t *timer) {
    lge_view_t *v = lv_timer_get_user_data(timer);
    uint32_t now = lv_tick_get(), elapsed = now - v->last_tick;
    v->last_tick = now;
    if (v->before_update)
        v->before_update(now, elapsed);
    lge_update(&v->engine, elapsed);
    if (v->pending_scene) {
        const lge_scene_def_t *next = v->pending_scene;
        v->pending_scene = NULL;
        lge_view_open(v, next);
    }
    if (v->sync_display)
        /* A refresh may pause itself when nothing is dirty. Wake it so the
         * next presentation can discover motion without syncing widgets twice. */
        lv_timer_resume(lv_display_get_refr_timer(v->sync_display));
    else
        lge_view_sync(v);
}
/* engine is the first member of lge_view_t. Reset view-owned mutable values
 * before user SPAWN hooks/Start scripts, while keeping engine.user unchanged. */
static void view_event(lge_engine_t *engine, lge_event_t event, lge_node_t *node, void *user) {
    lge_view_t *v = (lge_view_t *)engine;
    if (event == LGE_EVENT_SPAWN && node) {
        unsigned index = (unsigned)(node - engine->nodes);
        const lge_node_def_t *d = node->definition;
        if (v->labels[index]) {
            const char *text = d->text ? d->text : "";
            if (strcmp(lv_label_get_text(v->labels[index]), text))
                lv_label_set_text_static(v->labels[index], text);
        }
        if (v->objects[index] && d->kind == LGE_SPRITE && node->image)
            lv_image_set_src(v->objects[index], node->image);
        if (v->objects[index] && d->kind == LGE_BUTTON)
            lv_obj_remove_state(v->objects[index], LV_STATE_PRESSED | LV_STATE_CHECKED);
    }
    if (v->event_callback)
        v->event_callback(engine, event, node, user);
}
bool lge_view_request_scene(lge_view_t *v, const lge_scene_def_t *scene) {
    if (!v || !v->root || v->changing || v->pending_scene || !lge_scene_valid(scene))
        return false;
    v->pending_scene = scene;
    return true;
}
bool lge_view_open(lge_view_t *v, const lge_scene_def_t *scene) {
    if (!v || !v->root || v->changing || v->engine.prefab_mutating || !lge_scene_valid(scene))
        return false;
    bool needs_pool = false;
    for (unsigned i = 0; i < scene->count; ++i)
        if (scene->nodes[i].pattern)
            needs_pool = true;
    lge_projectiles_t *pool = needs_pool ? v->engine.projectiles : NULL;
    if (needs_pool && !pool)
        pool = lv_malloc(sizeof(*pool));
    if (needs_pool && !pool) {
        return false;
    }
    bool needs_melee = false;
    for (unsigned i = 0; i < scene->count; ++i)
        if (scene->nodes[i].melee)
            needs_melee = true;
    lge_melee_t *melee = needs_melee ? v->engine.melee : NULL;
    if (needs_melee && !melee)
        melee = lv_malloc(sizeof(*melee));
    if (needs_melee && !melee) {
        if (pool && pool != v->engine.projectiles)
            lv_free(pool);
        return false;
    }
    v->changing = true;
    lge_event_cb callback = v->engine.on_event;
    if (v->engine.scene && callback)
        callback(&v->engine, LGE_EVENT_EXIT, NULL, v->engine.user);
    v->engine.on_event = NULL;
    if (v->engine.melee && v->engine.melee != melee)
        lv_free(v->engine.melee);
    v->engine.melee = melee;
    if (v->engine.projectiles && v->engine.projectiles != pool)
        lv_free(v->engine.projectiles);
    lge_projectiles_init(&v->engine, pool,
                         scene->projectile_capacity ? scene->projectile_capacity : 64);
    v->pending_scene = NULL;
    bool loaded = lge_load(&v->engine, scene);
    v->engine.on_event = callback;
    if (!loaded) {
        v->changing = false;
        return false;
    }
    lge_tile_cache_clear(v->terrain_cache);
    lv_obj_clean(v->root);
    v->last_animation_tick = 0;
    v->projectile_surface = NULL;
    v->projectile_area_valid = false;
    memset(v->objects, 0, sizeof(v->objects));
    memset(v->labels, 0, sizeof(v->labels));
    lv_obj_set_size(v->root, scene->width, scene->height);
    lv_obj_set_style_bg_color(v->root, lv_color_hex(scene->background), 0);
    for (unsigned i = 0; i < scene->count; ++i) {
        const lge_node_def_t *d = &scene->nodes[i];
        if (d->kind == LGE_GROUP || d->kind == LGE_INSTANCE || d->kind == LGE_AREA)
            continue;
        lv_obj_t *o = d->kind == LGE_LABEL    ? lv_label_create(v->root)
                      : d->kind == LGE_BUTTON ? lv_button_create(v->root)
                      : d->kind == LGE_SPRITE ? lv_image_create(v->root)
                                              : lv_obj_create(v->root);
        v->objects[i] = o;
        lv_obj_remove_style_all(o);
        lge_lvgl_set_scrollable(o, false);
        lge_lvgl_set_clickable(o, false);
        lv_obj_set_size(o, d->width, d->height);
        lv_obj_set_style_radius(o, d->radius, 0);
        if (d->kind == LGE_TILEMAP && d->tilemap) {
            lv_obj_add_event_cb(o, tilemap_draw, LV_EVENT_DRAW_MAIN, &v->engine.nodes[i]);
            lv_obj_add_event_cb(o, tilemap_cover, LV_EVENT_COVER_CHECK, &v->engine.nodes[i]);
        } else if (d->kind == LGE_SPRITE && d->image) {
            lv_image_set_src(o, d->image);
            lv_image_set_inner_align(o, LV_IMAGE_ALIGN_STRETCH);
            lv_image_set_antialias(o, false);
        } else if (d->kind != LGE_LABEL) {
            lv_obj_set_style_bg_color(o, lv_color_hex(d->color), 0);
            lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
        }
        if (d->kind == LGE_LABEL || d->kind == LGE_BUTTON) {
            lv_obj_t *label = d->kind == LGE_LABEL ? o : lv_label_create(o);
            v->labels[i] = label;
            lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
            lv_obj_set_style_text_color(
                label,
                lv_color_hex(d->kind == LGE_LABEL
                                 ? d->color
                                 : (((d->color >> 16) & 255) * 299 + ((d->color >> 8) & 255) * 587 +
                                                (d->color & 255) * 114 <
                                            128000
                                        ? 0xdce7ee
                                        : 0x10271f)),
                0);
            lv_label_set_text(label, d->text ? d->text : "");
            if (d->kind == LGE_BUTTON) {
                lv_obj_center(label);
                lge_lvgl_set_clickable(o, true);
                lv_obj_add_event_cb(o, click_cb, LV_EVENT_CLICKED, &v->engine.nodes[i]);
                if (d->input_action) {
                    /* Allow a held finger to slide between directions. LVGL sends
                     * PRESS_LOST to the old button and PRESSING on the new one. */
                    lge_lvgl_set_press_lock(o, false);
                    lv_obj_add_event_cb(o, controller_cb, LV_EVENT_PRESSED, &v->engine.nodes[i]);
                    lv_obj_add_event_cb(o, controller_cb, LV_EVENT_PRESSING, &v->engine.nodes[i]);
                    lv_obj_add_event_cb(o, controller_cb, LV_EVENT_RELEASED, &v->engine.nodes[i]);
                    lv_obj_add_event_cb(o, controller_cb, LV_EVENT_PRESS_LOST, &v->engine.nodes[i]);
                }
            } else
                lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
        }
    }
    /* Logical ownership is independent of LVGL clipping/layout. World nodes draw
     * first; UI nodes draw above them, with stable tree order inside each layer. */
    for (unsigned i = 0; i < scene->count; ++i)
        if (scene->nodes[i].ui_layer && v->objects[i])
            lv_obj_move_to_index(v->objects[i], -1);
    if (pool) {
        v->projectile_surface = lv_obj_create(v->root);
        lv_obj_remove_style_all(v->projectile_surface);
        lv_obj_set_size(v->projectile_surface, scene->width, scene->height);
        lge_lvgl_set_scrollable(v->projectile_surface, false);
        lge_lvgl_set_clickable(v->projectile_surface, false);
        lv_obj_add_event_cb(v->projectile_surface, projectiles_draw, LV_EVENT_DRAW_MAIN, v);
    }
    v->last_tick = lv_tick_get();
    lge_view_sync(v);
    v->changing = false;
    if (callback)
        callback(&v->engine, LGE_EVENT_START, NULL, v->engine.user);
    return true;
}


bool lge_view_create(lge_view_t *v, lv_obj_t *parent, const lge_scene_def_t *scene,
                                    const lge_audio_backend_t *audio, lge_event_cb cb, void *user) {
    if (!v || !parent || !lge_scene_valid(scene))
        return false;
    memset(v, 0, sizeof(*v));
    v->event_callback = cb;
    lge_init(&v->engine, audio, view_event, user);
    v->root = lv_obj_create(parent);
    lv_obj_remove_style_all(v->root);
    lv_obj_add_event_cb(v->root, collision_draw, LV_EVENT_DRAW_POST, v);
    lv_obj_set_style_bg_opa(v->root, LV_OPA_COVER, 0);
    lge_lvgl_set_scrollable(v->root, false);
    lge_lvgl_set_press_lock(v->root, false); /* Direction changes can cross empty UI space. */
    if (!lge_view_open(v, scene)) {
        lge_view_destroy(v);
        return false;
    }
    v->timer = lv_timer_create(update_cb, 16, v);
    return true;
}
void lge_view_destroy(lge_view_t *v) {
    if (!v || v->changing || v->engine.prefab_mutating)
        return;
    v->changing = true;
    v->pending_scene = NULL;
    if (v->sync_display) {
        lv_display_remove_event_cb_with_user_data(v->sync_display, refresh_sync, v);
        v->sync_display = NULL;
    }
    lge_tile_cache_destroy(v->terrain_cache);
    v->terrain_cache = NULL;
    if (v->timer) {
        lv_timer_delete(v->timer);
        v->timer = NULL;
    }
    lge_destroy(&v->engine);
    if (v->engine.projectiles)
        lv_free(v->engine.projectiles);
    v->engine.projectiles = NULL;
    if (v->engine.melee)
        lv_free(v->engine.melee);
    v->engine.melee = NULL;
    v->projectile_surface = NULL;
    if (v->root) {
        lv_obj_delete(v->root);
        v->root = NULL;
    }
    v->changing = false;
}
