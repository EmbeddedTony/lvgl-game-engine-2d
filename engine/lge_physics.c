#include "lge_melee.h"
#include "lge.h"
#include <math.h>
#include <string.h>

/* A deliberately small character solver: rectangles, axis sliding and directed
 * sensors. Static geometry never moves in response to a collision. All storage
 * belongs to the engine; scene data remains const in flash. */
static float limit(float v, float lo, float hi) {
    return fminf(hi, fmaxf(lo, v));
}
lge_body_type_t lge_body_type(const lge_node_t *n) {
    if (!n)
        return LGE_BODY_NONE;
    const lge_node_def_t *d = n->definition;
    if (d->physics)
        return d->physics->body;
    if (d->kind == LGE_AREA || d->collectible)
        return LGE_BODY_AREA;
    if (d->player)
        return LGE_BODY_CHARACTER;
    return d->solid || d->tilemap ? LGE_BODY_STATIC : LGE_BODY_NONE;
}
static uint8_t layer(const lge_node_t *n) {
    if (n->definition->physics)
        return n->definition->physics->layer;
    return n->definition->player        ? LGE_LAYER_PLAYER
           : n->definition->collectible ? LGE_LAYER_PICKUP
                                        : LGE_LAYER_WORLD;
}
static uint8_t mask(const lge_node_t *n) {
    return n->definition->physics       ? n->definition->physics->mask
           : n->definition->collectible ? LGE_LAYER_PLAYER
                                        : 255;
}
bool lge_physics_valid(const lge_node_def_t *d) {
    if ((d->kind == LGE_GROUP || d->kind == LGE_INSTANCE) &&
        (d->physics || d->player || d->solid || d->collectible || d->tilemap))
        return false;
    if (d->kind == LGE_AREA && (d->player || d->solid || d->tilemap))
        return false;
    const lge_physics_def_t *p = d->physics;
    if (!p)
        return true;
    if ((unsigned)p->body > LGE_BODY_PLATFORM || (unsigned)p->motion > LGE_MOTION_GRID ||
        d->kind == LGE_GROUP || d->kind == LGE_INSTANCE ||
        (d->kind == LGE_AREA && p->body != LGE_BODY_AREA && p->body != LGE_BODY_NONE) ||
        (d->tilemap && ((p->body != LGE_BODY_STATIC && p->body != LGE_BODY_NONE) || p->box.width ||
                        p->box.height)) ||
        (d->player && p->body != LGE_BODY_CHARACTER) ||
        (d->solid && p->body != LGE_BODY_STATIC && p->body != LGE_BODY_PLATFORM) ||
        (d->collectible && p->body != LGE_BODY_AREA))
        return false;
    if ((p->grid_size && (p->grid_size < 8 || p->grid_size > 64)) ||
        (p->one_way && p->body != LGE_BODY_STATIC && p->body != LGE_BODY_PLATFORM) ||
        !isfinite(p->coyote_ms) || p->coyote_ms < 0 || p->coyote_ms > 250 ||
        !isfinite(p->buffer_ms) || p->buffer_ms < 0 || p->buffer_ms > 250)
        return false;
    if ((unsigned)p->slope > 2 || (p->slope && (p->body != LGE_BODY_STATIC || d->tilemap)) ||
        !isfinite(p->travel_x) || !isfinite(p->travel_y) || !isfinite(p->travel_seconds) ||
        fabsf(p->travel_x) > 2048 || fabsf(p->travel_y) > 2048 || p->travel_seconds < 0 ||
        (p->travel_seconds > 0 &&
         (p->body != LGE_BODY_PLATFORM || p->travel_seconds < .1f || p->travel_seconds > 600 ||
          fmaxf(fabsf(p->travel_x), fabsf(p->travel_y)) / p->travel_seconds > 1200)))
        return false;
    return isfinite(p->box.x) && isfinite(p->box.y) && fabsf(p->box.x) <= 2048 &&
           fabsf(p->box.y) <= 2048 && isfinite(p->box.width) && isfinite(p->box.height) &&
           ((p->box.width == 0 && p->box.height == 0) ||
            (p->box.width >= 1 && p->box.width <= 2048 && p->box.height >= 1 &&
             p->box.height <= 2048)) &&
           isfinite(p->gravity) && p->gravity >= 0 && p->gravity <= 4000 &&
           isfinite(p->jump_speed) && p->jump_speed >= 0 && p->jump_speed <= 1200 &&
           isfinite(p->velocity_x) && fabsf(p->velocity_x) <= 1200 && isfinite(p->velocity_y) &&
           fabsf(p->velocity_y) <= 1200;
}
lge_box_t lge_node_bounds(const lge_node_t *n) {
    if (!n)
        return (lge_box_t){0};
    const lge_physics_def_t *p = n->definition->physics;
    if (p && p->box.width > 0)
        return (lge_box_t){n->x + p->box.x, n->y + p->box.y, p->box.width, p->box.height};
    return (lge_box_t){n->x, n->y, n->definition->width, n->definition->height};
}
static bool overlap(lge_box_t a, lge_box_t b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
           a.y + a.height > b.y;
}
static bool solid_tile(const lge_tilemap_t *map, int c, int r) {
    unsigned value = lge_tile_at(map, c, r);
    return lge_tile_is_solid(map, (uint16_t)value);
}
static bool overlap_map(lge_box_t a, const lge_node_t *b) {
    const lge_tilemap_t *map = b->definition->tilemap;
    int c0 = (int)fmaxf(0, floorf((a.x - b->x) / map->tile_size));
    int c1 =
        (int)fminf(map->columns - 1, floorf((a.x + a.width - 0.0001f - b->x) / map->tile_size));
    int r0 = (int)fmaxf(0, floorf((a.y - b->y) / map->tile_size));
    int r1 = (int)fminf(map->rows - 1, floorf((a.y + a.height - 0.0001f - b->y) / map->tile_size));
    lge_tile_cursor_t cursor = {0};
    for (int r = r0; r <= r1; ++r)
        for (int c = c0; c <= c1; ++c)
            if (lge_tile_is_solid(map, lge_tile_cursor_at(&cursor, map, c, r)))
                return true;
    return false;
}
bool lge_nodes_overlap(const lge_node_t *a, const lge_node_t *b) {
    if (!a || !b || !a->effective_visible || !b->effective_visible)
        return false;
    if (a->definition->tilemap && b->definition->tilemap) {
        const lge_tilemap_t *map = a->definition->tilemap;
        if (!overlap(lge_node_bounds(a), lge_node_bounds(b)))
            return false;
        for (int r = 0; r < map->rows; ++r)
            for (int c = 0; c < map->columns; ++c)
                if (solid_tile(map, c, r)) {
                    unsigned value = lge_tile_at(map, c, r);
                    if (map->slopes && map->slopes[value - 1])
                        continue;
                    lge_box_t tile = {a->x + c * map->tile_size, a->y + r * map->tile_size,
                                      map->tile_size, map->tile_size};
                    if (overlap_map(tile, b))
                        return true;
                }
        return false;
    }
    if (b->definition->tilemap)
        return overlap_map(lge_node_bounds(a), b);
    if (a->definition->tilemap)
        return overlap_map(lge_node_bounds(b), a);
    return overlap(lge_node_bounds(a), lge_node_bounds(b));
}
bool lge_body_set_velocity(lge_node_t *n, float x, float y) {
    if ((lge_body_type(n) != LGE_BODY_CHARACTER && lge_body_type(n) != LGE_BODY_PLATFORM) ||
        !isfinite(x) || !isfinite(y) || fabsf(x) > 1200 || fabsf(y) > 1200)
        return false;
    n->velocity_x = x;
    n->velocity_y = y;
    return true;
}
bool lge_body_jump(lge_node_t *n, float speed) {
    if (lge_body_type(n) != LGE_BODY_CHARACTER || !n->on_floor || !isfinite(speed) || speed <= 0 ||
        speed > 1200)
        return false;
    n->velocity_y = -speed;
    n->on_floor = false;
    return true;
}
bool lge_area_contains(const lge_node_t *a, const lge_node_t *b) {
    if (!a || !b || a->owner != b->owner || lge_body_type(a) != LGE_BODY_AREA)
        return false;
    unsigned i = (unsigned)(a - a->owner->nodes), j = (unsigned)(b - b->owner->nodes);
    return (a->owner->area_contacts[i][j / 8] & (1u << (j % 8))) != 0;
}
static const lge_node_t *character_owner(const lge_node_t *n) {
    for (const lge_node_t *p = n; p; p = lge_node_parent((lge_node_t *)p))
        if (lge_body_type(p) == LGE_BODY_CHARACTER)
            return p;
    return NULL;
}
static bool related(const lge_node_t *a, const lge_node_t *b) {
    for (const lge_node_t *p = a; p; p = lge_node_parent((lge_node_t *)p))
        if (p == b)
            return true;
    for (const lge_node_t *p = b; p; p = lge_node_parent((lge_node_t *)p))
        if (p == a)
            return true;
    const lge_node_t *owner = character_owner(a);
    return owner && owner == character_owner(b);
}
/* The mover's mask is directional, like an area's mask. Child sensors never
 * block their own character. Masks describe detection, layers membership. */
static bool blocks(const lge_node_t *a, const lge_node_t *b) {
    lge_body_type_t type = lge_body_type(b);
    return b->effective_visible &&
           (type == LGE_BODY_STATIC || type == LGE_BODY_CHARACTER || type == LGE_BODY_PLATFORM) &&
           (mask(a) & layer(b)) && !related(a, b);
}
static float stop_at(float next, float origin, float delta, lge_box_t a, lge_box_t b,
                     bool horizontal) {
    /* Swept leading face, with an orthogonal interval test. Never tunnel through
     * a thin wall; overlapping spawn positions are intentionally not depenetrated. */
    float near = horizontal ? b.x : b.y, far = near + (horizontal ? b.width : b.height);
    float start = horizontal ? a.x : a.y, size = horizontal ? a.width : a.height;
    bool cross = horizontal ? a.y < b.y + b.height && a.y + a.height > b.y
                            : a.x < b.x + b.width && a.x + a.width > b.x;
    if (!cross)
        return next;
    if (delta > 0 && start + size <= near + 0.0001f && start + size + delta > near)
        return fminf(next, near - size - (start - origin));
    if (delta < 0 && start >= far - 0.0001f && start + delta < far)
        return fmaxf(next, far - (start - origin));
    return next;
}
static void move_axis(lge_engine_t *g, lge_node_t *n, float delta, bool horizontal,
                      const lge_node_t *ignore) {
    if (delta == 0)
        return;
    lge_box_t a = lge_node_bounds(n);
    float origin = horizontal ? n->x : n->y, requested = origin + delta, next = requested;
    const lge_physics_def_t *p = n->definition->physics;
    if (!p || p->world_bounds) {
        float offset = (horizontal ? a.x : a.y) - origin;
        const lge_camera2d_def_t *camera = g->scene->camera2d;
        float width = camera ? camera->world_width : g->scene->width;
        float height = camera ? camera->world_height : g->scene->height;
        float maximum = (horizontal ? width - a.width : height - a.height) - offset;
        next = limit(next, -offset, fmaxf(-offset, maximum));
    }
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *b = &g->nodes[i];
        if (b == ignore || !blocks(n, b))
            continue;
        bool one_way = b->definition->physics && b->definition->physics->one_way;
        if (one_way && (horizontal || delta <= 0))
            continue;
        const lge_tilemap_t *map = b->definition->tilemap;
        if (!map) {
            if (b->definition->physics && b->definition->physics->slope)
                continue;
            lge_box_t box = lge_node_bounds(b);
            if (!one_way || a.y + a.height <= box.y + .0001f)
                next = stop_at(next, origin, delta, a, box, horizontal);
            continue;
        }
        float x = fminf(a.x, a.x + (horizontal ? delta : 0)),
              y = fminf(a.y, a.y + (horizontal ? 0 : delta));
        int c0 = (int)fmaxf(0, floorf((x - b->x) / map->tile_size));
        int c1 = (int)fminf(
            map->columns - 1,
            floorf((x + a.width + fabsf(horizontal ? delta : 0) - b->x) / map->tile_size));
        int r0 = (int)fmaxf(0, floorf((y - b->y) / map->tile_size));
        int r1 =
            (int)fminf(map->rows - 1, floorf((y + a.height + fabsf(horizontal ? 0 : delta) - b->y) /
                                             map->tile_size));
        lge_tile_cursor_t cursor = {0};
        for (int r = r0; r <= r1; ++r)
            for (int c = c0; c <= c1; ++c) {
                unsigned value = lge_tile_cursor_at(&cursor, map, c, r);
                if (lge_tile_is_solid(map, (uint16_t)value)) {
                    if (map->slopes && map->slopes[value - 1])
                        continue;
                    lge_box_t tile = {b->x + c * map->tile_size, b->y + r * map->tile_size,
                                      map->tile_size, map->tile_size};
                    if (!one_way || a.y + a.height <= tile.y + .0001f)
                        next = stop_at(next, origin, delta, a, tile, horizontal);
                }
            }
    }
    /* Compare against the already-rounded destination. Subtracting origin
     * and delta again can report a false collision at larger world positions. */
    if (fabsf(next - requested) > 0.00001f) {
        if (horizontal) {
            n->on_wall = true;
            n->velocity_x = 0;
        } else {
            if (delta > 0)
                n->on_floor = true;
            else
                n->on_ceiling = true;
            n->velocity_y = 0;
        }
    }
    if (horizontal)
        n->x = next;
    else
        n->y = next;
}
/* Floor ramps use one center-foot height sample, no polygon solver or mesh.
 * Grounded descent snaps by at most the horizontal step projected on the ramp. */
static void ramp(lge_node_t *n, lge_box_t b, uint8_t shape, float old_x, float dy, bool grounded) {
    lge_box_t a = lge_node_bounds(n);
    float center = shape == 1 ? a.x + a.width : a.x;
    if (a.x >= b.x + b.width || a.x + a.width <= b.x || n->velocity_y < 0)
        return;
    float t = limit((center - b.x) / b.width, 0, 1);
    float surface = b.y + b.height * (shape == 1 ? 1 - t : t);
    float feet = a.y + a.height,
          snap = grounded ? fabsf(n->x - old_x) * b.height / b.width + .01f : .0001f;
    if (feet <= surface + snap && feet + dy >= surface - snap) {
        n->y += surface - feet;
        n->velocity_y = 0;
        n->on_floor = true;
    }
}
static void slope_floor(lge_engine_t *g, lge_node_t *n, float old_x, float dy, bool grounded) {
    float old_y = n->y;
    for (unsigned i = 0; i < g->scene->count; ++i) {
        const lge_node_t *b = &g->nodes[i];
        if (!blocks(n, b))
            continue;
        const lge_physics_def_t *p = b->definition->physics;
        if (p && p->slope)
            ramp(n, lge_node_bounds(b), p->slope, old_x, dy, grounded);
        const lge_tilemap_t *m = b->definition->tilemap;
        if (!m || !m->slopes)
            continue;
        lge_box_t a = lge_node_bounds(n);
        int c0 = (int)fmaxf(0, floorf((a.x - b->x) / m->tile_size));
        int c1 = (int)fminf(m->columns - 1, floorf((a.x + a.width - .0001f - b->x) / m->tile_size));
        int row = (int)floorf((a.y + a.height - b->y) / m->tile_size);
        for (int r = row - 1; r <= row + 1; ++r)
            for (int c = c0; c <= c1; ++c) {
                unsigned v = lge_tile_at(m, c, r);
                if (v && v <= m->tile_count && m->slopes[v - 1] && solid_tile(m, c, r)) {
                    lge_box_t tile = {b->x + c * m->tile_size, b->y + r * m->tile_size,
                                      m->tile_size, m->tile_size};
                    ramp(n, tile, m->slopes[v - 1], old_x, dy, grounded);
                }
            }
    }
    float target = n->y;
    n->y = old_y;
    if (target != old_y) {
        move_axis(g, n, target - old_y, false, NULL);
        if (target < old_y && fabsf(n->y - target) > .0001f) {
            n->x = old_x;
            n->y = old_y;
            n->velocity_x = 0;
            n->on_wall = true;
            n->on_floor = grounded;
        }
    }
}
/* A platform is prescribed motion, not a rigid body. Preflight passenger sweeps
 * and stop this axis if a wall/ceiling would crush one; no iterative impulses. */
static bool platform_axis(lge_node_t *platform, float delta, bool horizontal) {
    if (delta == 0)
        return true;
    lge_engine_t *g = platform->owner;
    lge_box_t b = lge_node_bounds(platform);
    float pushes[LGE_MAX_NODES] = {0};
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        if (!n->effective_visible || lge_body_type(n) != LGE_BODY_CHARACTER || !blocks(n, platform))
            continue;
        lge_box_t a = lge_node_bounds(n);
        bool rider = fabsf(a.y + a.height - b.y) < .02f && a.x < b.x + b.width &&
                     a.x + a.width > b.x && n->velocity_y >= 0;
        float push = rider ? delta : 0;
        bool cross = horizontal ? a.y < b.y + b.height && a.y + a.height > b.y
                                : a.x < b.x + b.width && a.x + a.width > b.x;
        bool one_way = platform->definition->physics && platform->definition->physics->one_way;
        if (!one_way && cross) {
            float near = horizontal ? a.x : a.y, far = near + (horizontal ? a.width : a.height);
            float p0 = horizontal ? b.x : b.y, p1 = p0 + (horizontal ? b.width : b.height);
            if (delta > 0 && near >= p1 - .0001f && near < p1 + delta)
                push = p1 + delta - near;
            if (delta < 0 && far <= p0 + .0001f && far > p0 + delta)
                push = p0 + delta - far;
        }
        if (!push)
            continue;
        lge_node_t saved = *n;
        float origin = horizontal ? n->x : n->y;
        move_axis(g, n, push, horizontal, platform);
        float actual = (horizontal ? n->x : n->y) - origin;
        *n = saved;
        if (fabsf(actual - push) > .0001f)
            return false;
        pushes[i] = push;
    }
    if (horizontal) {
        platform->x += delta;
        platform->platform_offset_x += delta;
    } else {
        platform->y += delta;
        platform->platform_offset_y += delta;
    }
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (pushes[i]) {
            if (horizontal)
                g->nodes[i].x += pushes[i];
            else
                g->nodes[i].y += pushes[i];
        }
    lge_sync_hierarchy(g);
    return true;
}
bool lge_platform_move(lge_node_t *n, float dx, float dy) {
    if (!n || lge_body_type(n) != LGE_BODY_PLATFORM || !n->effective_visible || !isfinite(dx) ||
        !isfinite(dy) || fabsf(dx) > 20 || fabsf(dy) > 20)
        return false;
    unsigned steps = (unsigned)ceilf(fmaxf(fabsf(dx), fabsf(dy)));
    if (!steps)
        return true;
    bool ok = true;
    for (unsigned i = 0; i < steps; ++i) {
        if (!platform_axis(n, dx / steps, true))
            ok = false;
        if (!platform_axis(n, dy / steps, false))
            ok = false;
    }
    return ok;
}
static void step_platforms(lge_engine_t *g) {
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        const lge_physics_def_t *p = n->definition->physics;
        if (!n->effective_visible || lge_body_type(n) != LGE_BODY_PLATFORM)
            continue;
        float dx = n->velocity_x * LGE_FIXED_SECONDS, dy = n->velocity_y * LGE_FIXED_SECONDS;
        if (p && p->travel_seconds > 0) {
            float previous = n->platform_phase;
            n->platform_phase = fmodf(previous + LGE_FIXED_SECONDS / p->travel_seconds, 2);
            float after = n->platform_phase <= 1 ? n->platform_phase : 2 - n->platform_phase;
            dx = limit(p->travel_x * after - n->platform_offset_x, -20, 20);
            dy = limit(p->travel_y * after - n->platform_offset_y, -20, 20);
            n->velocity_x = dx / LGE_FIXED_SECONDS;
            n->velocity_y = dy / LGE_FIXED_SECONDS;
        }
        lge_platform_move(n, dx, dy);
    }
}
static void event(lge_engine_t *g, lge_event_t type, lge_node_t *n, lge_node_t *other) {
    lge_node_t *previous = g->event_other;
    g->event_other = other;
    if (g->on_event)
        g->on_event(g, type, n, g->user);
    g->event_other = previous;
}
static void sample_areas(lge_engine_t *g) {
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *a = &g->nodes[i];
        /* Legacy collectibles retain their original COLLECT-only event contract. */
        if (lge_body_type(a) != LGE_BODY_AREA ||
            (!a->definition->physics && a->definition->kind != LGE_AREA))
            continue;
        for (unsigned j = 0; j < g->scene->count; ++j) {
            lge_node_t *b = &g->nodes[j];
            bool was = (g->area_contacts[i][j / 8] & (1u << (j % 8))) != 0;
            bool now = a->effective_visible && lge_body_type(b) != LGE_BODY_NONE &&
                       (mask(a) & layer(b)) && !related(a, b) && lge_nodes_overlap(a, b);
            if (now)
                g->area_contacts[i][j / 8] |= (uint8_t)(1u << (j % 8));
            else
                g->area_contacts[i][j / 8] &= (uint8_t)~(1u << (j % 8));
            if (now != was) {
                if (now && !a->definition->collectible)
                    lge_audio_play(g, a->definition->cue);
                event(g, now ? LGE_EVENT_AREA_ENTER : LGE_EVENT_AREA_EXIT, a, b);
                lge_sync_hierarchy(g);
            }
        }
    }
}
static void collect(lge_engine_t *g) {
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *a = &g->nodes[i];
        if (!a->effective_visible || !a->definition->player ||
            lge_body_type(a) != LGE_BODY_CHARACTER)
            continue;
        for (unsigned j = 0; j < g->scene->count; ++j) {
            lge_node_t *b = &g->nodes[j];
            if (!b->definition->collectible || lge_body_type(b) != LGE_BODY_AREA ||
                !(mask(b) & layer(a)) || related(a, b) || !lge_nodes_overlap(a, b))
                continue;
            lge_node_set_visible(b, false);
            b->collected = true;
            ++g->score;
            lge_audio_play(g, b->definition->cue);
            event(g, LGE_EVENT_COLLECT, b, a);
            if (!g->complete && g->total && g->score == g->total) {
                g->complete = true;
                event(g, LGE_EVENT_COMPLETE, b, NULL);
            }
        }
    }
}
void lge_physics_step(lge_engine_t *g) {
    uint8_t input = lge_input(g);
    float dx, dy;
    lge_move_input(g, &dx, &dy);
    dy = -dy;
    bool jump = ((input & (LGE_INPUT_ACTION | LGE_INPUT_UP)) &&
                 !(g->previous_input & (LGE_INPUT_ACTION | LGE_INPUT_UP))) ||
                (lge_input_pressed(g) & (LGE_INPUT_ACTION | LGE_INPUT_UP));
    bool floors[LGE_MAX_NODES] = {false};
    unsigned steps = 1;
    step_platforms(g);
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        const lge_physics_def_t *p = n->definition->physics;
        if (!n->effective_visible || lge_body_type(n) != LGE_BODY_CHARACTER)
            continue;
        lge_motion_t motion = p ? p->motion : LGE_MOTION_TOPDOWN;
        if (lge_melee_locked(n)) {
            n->velocity_x = 0;
            if (motion != LGE_MOTION_PLATFORMER)
                n->velocity_y = 0;
        }
        if (n->definition->player && motion != LGE_MOTION_CODE && !lge_melee_locked(n)) {
            if (motion == LGE_MOTION_GRID) {
                float gx = dx > .35f ? 1 : dx < -.35f ? -1 : 0;
                float gy = dy > .35f ? 1 : dy < -.35f ? -1 : 0;
                if (!n->grid_active && (gx || gy)) {
                    float size = p->grid_size ? p->grid_size : 16;
                    n->grid_x = n->x + gx * size;
                    n->grid_y = n->y + (gx ? 0 : gy) * size;
                    n->grid_active = true;
                }
                n->velocity_x = n->grid_active ? limit((n->grid_x - n->x) / LGE_FIXED_SECONDS,
                                                       -n->speed, n->speed)
                                               : 0;
                n->velocity_y = n->grid_active ? limit((n->grid_y - n->y) / LGE_FIXED_SECONDS,
                                                       -n->speed, n->speed)
                                               : 0;
            } else {
                float length = dx * dx + dy * dy;
                float scale = motion == LGE_MOTION_TOPDOWN && length > 1 ? 1 / sqrtf(length) : 1;
                n->velocity_x = dx * n->speed * scale;
                if (motion == LGE_MOTION_TOPDOWN)
                    n->velocity_y = dy * n->speed * scale;
                else {
                    n->coyote_ms =
                        n->on_floor ? p->coyote_ms : fmaxf(0, n->coyote_ms - 1000.0f / 60);
                    n->buffer_ms =
                        jump ? p->buffer_ms + 1000.0f / 60 : fmaxf(0, n->buffer_ms - 1000.0f / 60);
                    if ((n->on_floor || n->coyote_ms > 0) && n->buffer_ms > 0) {
                        n->velocity_y = -p->jump_speed;
                        n->on_floor = false;
                        n->coyote_ms = n->buffer_ms = 0;
                    }
                }
            }
        }
        n->velocity_x = isfinite(n->velocity_x) ? limit(n->velocity_x, -1200, 1200) : 0;
        n->velocity_y =
            isfinite(n->velocity_y)
                ? limit(n->velocity_y +
                            (p && motion != LGE_MOTION_GRID ? p->gravity : 0) * LGE_FIXED_SECONDS,
                        -1200, 1200)
                : 0;
        floors[i] = n->on_floor;
        n->on_floor = n->on_wall = n->on_ceiling = false;
        unsigned count =
            (unsigned)ceilf(fmaxf(fabsf(n->velocity_x), fabsf(n->velocity_y)) * LGE_FIXED_SECONDS);
        if (count > steps)
            steps = count;
    }
    /* <=1px samples also catch narrow areas crossed between rendered frames. */
    sample_areas(g);
    collect(g);
    for (unsigned s = 0; s < steps; ++s) {
        for (unsigned i = 0; i < g->scene->count; ++i) {
            lge_node_t *n = &g->nodes[i];
            if (!n->effective_visible || lge_body_type(n) != LGE_BODY_CHARACTER)
                continue;
            float old_x = n->x;
            bool grounded = n->on_floor || floors[i];
            move_axis(g, n, n->velocity_x * LGE_FIXED_SECONDS / steps, true, NULL);
            slope_floor(g, n, old_x, n->velocity_y * LGE_FIXED_SECONDS / steps, grounded);
            move_axis(g, n, n->velocity_y * LGE_FIXED_SECONDS / steps, false, NULL);
            lge_sync_hierarchy(g);
        }
        sample_areas(g);
        collect(g);
    }
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        if (n->grid_active &&
            (n->on_wall || n->on_floor || n->on_ceiling ||
             (fabsf(n->x - n->grid_x) < .001f && fabsf(n->y - n->grid_y) < .001f))) {
            n->grid_active = false;
            n->velocity_x = n->velocity_y = 0;
        }
    }
    g->previous_input = input;
}
