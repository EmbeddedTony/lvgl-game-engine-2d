#include "lge_gameplay.h"
#include <math.h>
#include <string.h>
#include <limits.h>

void lge_projectiles_init(lge_engine_t *g, lge_projectiles_t *pool, uint8_t capacity) {
    if (!g)
        return;
    g->projectiles = pool;
    if (pool) {
        memset(pool, 0, sizeof(*pool));
        pool->capacity = capacity > LGE_MAX_PROJECTILES ? LGE_MAX_PROJECTILES : capacity;
    }
}
bool lge_emitter_set_enabled(lge_node_t *n, bool enabled) {
    if (!n || !n->definition->pattern)
        return false;
    if (enabled && !n->emitter_enabled) {
        n->emitter_time = 0;
        n->emitter_angle = 0;
    }
    n->emitter_enabled = enabled;
    return true;
}
unsigned lge_projectiles_count(const lge_engine_t *g) {
    unsigned count = 0;
    if (g && g->projectiles)
        for (unsigned i = 0; i < g->projectiles->capacity; ++i)
            if (g->projectiles->slots[i].remaining > 0)
                ++count;
    return count;
}
const lge_projectile_t *lge_projectile_hit(const lge_engine_t *g) {
    return g ? g->projectile_hit : NULL;
}
static bool same_branch(const lge_node_t *a, const lge_node_t *b) {
    for (const lge_node_t *p = a; p; p = lge_node_parent((lge_node_t *)p))
        if (p == b)
            return true;
    for (const lge_node_t *p = b; p; p = lge_node_parent((lge_node_t *)p))
        if (p == a)
            return true;
    const lge_node_t *owner = NULL, *target = NULL;
    for (const lge_node_t *p = a; p; p = lge_node_parent((lge_node_t *)p))
        if (lge_body_type(p) == LGE_BODY_CHARACTER) {
            owner = p;
            break;
        }
    for (const lge_node_t *p = b; p; p = lge_node_parent((lge_node_t *)p))
        if (lge_body_type(p) == LGE_BODY_CHARACTER) {
            target = p;
            break;
        }
    return owner && owner == target;
}
/* Segment vs expanded AABB, earliest hit. Swept tests avoid fast bullet tunneling. */
static float hit_time(float x, float y, float dx, float dy, lge_box_t box, float radius) {
    float near = 0, far = 1;
    float origin[2] = {x, y}, delta[2] = {dx, dy}, lo[2] = {box.x - radius, box.y - radius},
          hi[2] = {box.x + box.width + radius, box.y + box.height + radius};
    for (unsigned axis = 0; axis < 2; ++axis) {
        if (fabsf(delta[axis]) < .000001f) {
            if (origin[axis] < lo[axis] || origin[axis] > hi[axis])
                return 2;
        } else {
            float a = (lo[axis] - origin[axis]) / delta[axis],
                  b = (hi[axis] - origin[axis]) / delta[axis];
            near = fmaxf(near, fminf(a, b));
            far = fminf(far, fmaxf(a, b));
            if (near > far)
                return 2;
        }
    }
    return near;
}
static void emit(lge_engine_t *g, unsigned owner) {
    lge_node_t *n = &g->nodes[owner];
    const lge_pattern_t *p = n->definition->pattern;
    float x = n->x + n->definition->width * .5f, y = n->y + n->definition->height * .5f;
    float base = p->angle + n->emitter_angle;
    if (p->mode == LGE_PATTERN_AIMED)
        for (unsigned i = 0; i < g->scene->count; ++i) {
            lge_node_t *target = &g->nodes[i];
            if (!target->definition->player || !target->effective_visible)
                continue;
            base += atan2f(target->y + target->definition->height * .5f - y,
                           target->x + target->definition->width * .5f - x) *
                    57.295779513f;
            break;
        }
    for (unsigned shot = 0; shot < p->count; ++shot) {
        lge_projectile_t *b = NULL;
        for (unsigned i = 0; i < g->projectiles->capacity; ++i)
            if (g->projectiles->slots[i].remaining <= 0) {
                b = &g->projectiles->slots[i];
                break;
            }
        if (!b) {
            if (g->projectiles->dropped < UINT32_MAX)
                ++g->projectiles->dropped;
            continue;
        }
        float spread = p->mode == LGE_PATTERN_RING ? 360.0f * shot / p->count
                       : p->count == 1             ? 0
                                       : p->spread * ((float)shot / (p->count - 1) - .5f);
        float radians = (base + spread) * .01745329252f;
        *b = (lge_projectile_t){.x = x,
                                .y = y,
                                .vx = cosf(radians) * p->speed,
                                .vy = sinf(radians) * p->speed,
                                .remaining = p->lifetime,
                                .pattern = p,
                                .owner = (uint16_t)owner};
    }
    n->emitter_angle = fmodf(n->emitter_angle + p->rotation, 360);
}
void lge_projectiles_step(lge_engine_t *g) {
    if (!g || !g->scene || !g->projectiles)
        return;
    /* Existing shots retire before new bursts can reuse their slots. */
    for (unsigned slot = 0; slot < g->projectiles->capacity; ++slot) {
        lge_projectile_t *b = &g->projectiles->slots[slot];
        if (b->remaining <= 0)
            continue;
        float seconds = fminf(LGE_FIXED_SECONDS, b->remaining), dx = b->vx * seconds,
              dy = b->vy * seconds, best = 2;
        lge_node_t *hit = NULL, *owner = &g->nodes[b->owner];
        for (unsigned i = 0; i < g->scene->count; ++i) {
            lge_node_t *target = &g->nodes[i];
            lge_body_type_t type = lge_body_type(target);
            unsigned layer = target->definition->physics       ? target->definition->physics->layer
                             : target->definition->player      ? LGE_LAYER_PLAYER
                             : target->definition->collectible ? LGE_LAYER_PICKUP
                                                               : LGE_LAYER_WORLD;
            if (!target->effective_visible ||
                (type != LGE_BODY_CHARACTER && type != LGE_BODY_AREA) ||
                !(b->pattern->mask & layer) || same_branch(owner, target))
                continue;
            float t = hit_time(b->x, b->y, dx, dy, lge_node_bounds(target), b->pattern->radius);
            if (t < best) {
                best = t;
                hit = target;
            }
        }
        b->x += dx * (hit ? best : 1);
        b->y += dy * (hit ? best : 1);
        b->remaining -= seconds;
        if (hit) {
            lge_node_t *previous = g->event_other;
            g->event_other = owner;
            g->projectile_hit = b;
            if (g->on_event)
                g->on_event(g, LGE_EVENT_PROJECTILE_HIT, hit, g->user);
            g->projectile_hit = NULL;
            g->event_other = previous;
            b->remaining = 0;
        }
    }
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        const lge_pattern_t *p = n->definition->pattern;
        if (!p || !n->emitter_enabled || !n->effective_visible)
            continue;
        n->emitter_time -= LGE_FIXED_SECONDS;
        if (n->emitter_time <= .000001f) {
            emit(g, i);
            n->emitter_time += p->interval;
        }
    }
}
#define LOOKUP(name, type, field, count)                                                           \
    const type *name(const lge_rpg_database_t *d, const char *id) {                                \
        if (d && id)                                                                               \
            for (unsigned i = 0; i < d->count; ++i)                                                \
                if (strcmp(d->field[i].id, id) == 0)                                               \
                    return &d->field[i];                                                           \
        return NULL;                                                                               \
    }
LOOKUP(lge_rpg_item, lge_rpg_item_t, items, item_count)
LOOKUP(lge_rpg_skill, lge_rpg_skill_t, skills, skill_count)
LOOKUP(lge_rpg_actor, lge_rpg_actor_def_t, actors, actor_count)
LOOKUP(lge_rpg_encounter, lge_rpg_encounter_t, encounters, encounter_count)
static uint16_t stat(unsigned base, unsigned growth, unsigned level) {
    unsigned value = base + growth * (level - 1);
    return (uint16_t)(value > 9999 ? 9999 : value);
}
bool lge_rpg_stats(const lge_rpg_actor_def_t *a, unsigned level, lge_rpg_stats_t *out) {
    if (!a || !out || !level || level > 100)
        return false;
    *out = (lge_rpg_stats_t){
        stat(a->hp, a->hp_growth, level), stat(a->attack, a->attack_growth, level),
        stat(a->defense, a->defense_growth, level), stat(a->speed, a->speed_growth, level),
        stat(a->mp, a->mp_growth, level)};
    return true;
}
uint16_t lge_rpg_skill_amount(const lge_rpg_skill_t *s, uint16_t attack, uint16_t defense,
                              uint32_t roll) {
    if (!s || roll % 100 >= s->accuracy)
        return 0;
    int value = s->power + (s->healing ? 0 : (int)attack - (int)defense / 2);
    if (value < (s->healing ? 0 : 1))
        value = s->healing ? 0 : 1;
    return (uint16_t)(value > 9999 ? 9999 : value);
}
const char *lge_rpg_choose(const lge_rpg_encounter_t *t, uint32_t roll, uint32_t level_roll,
                           uint8_t *level) {
    if (level)
        *level = 0;
    if (!t || !t->entries || !t->count)
        return NULL;
    unsigned total = 0;
    for (unsigned i = 0; i < t->count; ++i) {
        const lge_rpg_encounter_entry_t *e = &t->entries[i];
        if (!e->actor || !e->min_level || e->max_level < e->min_level || e->max_level > 100)
            return NULL;
        total += e->weight;
    }
    if (!total)
        return NULL;
    unsigned pick = roll % total;
    for (unsigned i = 0; i < t->count; ++i) {
        const lge_rpg_encounter_entry_t *e = &t->entries[i];
        if (pick < e->weight) {
            if (level)
                *level = (uint8_t)(e->min_level + level_roll % (e->max_level - e->min_level + 1));
            return e->actor;
        }
        pick -= e->weight;
    }
    return NULL;
}
