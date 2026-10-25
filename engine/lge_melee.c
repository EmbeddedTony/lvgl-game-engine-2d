#include "lge_melee.h"
#include <math.h>
#include <string.h>
static lge_melee_actor_t *state(const lge_node_t *n) {
    if (!n || !n->owner || !n->owner->melee)
        return NULL;
    lge_melee_t *m = n->owner->melee;
    for (unsigned i = 0; i < m->count; ++i)
        if (&n->owner->nodes[m->actors[i].node] == n)
            return &m->actors[i];
    return NULL;
}
void lge_melee_init(lge_engine_t *g, lge_melee_t *pool) {
    g->melee = pool;
    if (!pool)
        return;
    memset(pool, 0, sizeof(*pool));
    if (g->scene)
        for (unsigned i = 0; i < g->scene->count && pool->count < LGE_MELEE_MAX; ++i)
            if (g->scene->nodes[i].melee)
                pool->actors[pool->count++].node = (uint16_t)i;
}
bool lge_melee_start(lge_node_t *n) {
    lge_melee_actor_t *a = state(n);
    if (!a || a->swinging || !n->effective_visible || n->owner->paused ||
        n->owner->simulation_blocked)
        return false;
    a->tick = 0;
    a->swinging = true;
    memset(a->hits, 0, sizeof(a->hits));
    return true;
}
bool lge_melee_active(const lge_node_t *n) {
    const lge_melee_actor_t *a = state(n);
    return a && a->swinging;
}
bool lge_melee_locked(const lge_node_t *n) {
    return n && n->definition->melee && n->definition->melee->lock_movement && lge_melee_active(n);
}
float lge_melee_time(const lge_node_t *n) {
    const lge_melee_actor_t *a = state(n);
    return a ? a->tick * LGE_FIXED_SECONDS : 0;
}
void lge_melee_prepare(lge_engine_t *g) {
    if (!g->melee)
        return;
    for (unsigned i = 0; i < g->melee->count; ++i) {
        lge_melee_actor_t *a = &g->melee->actors[i];
        lge_node_t *n = &g->nodes[a->node];
        const lge_melee_def_t *d = n->definition->melee;
        if (!n->effective_visible) {
            a->swinging = false;
            continue;
        }
        if (a->swinging && ++a->tick >= d->windup + d->active + d->recovery)
            a->swinging = false;
        if (!a->swinging && n->definition->player) {
            float x, y;
            lge_move_input(g, &x, &y);
            if (fabsf(x) > .01f)
                n->facing = x > 0 ? 3 : 2;
            else if (fabsf(y) > .01f)
                n->facing = y > 0 ? 1 : 0;
            if (lge_input_pressed(g) & LGE_INPUT_ACTION)
                lge_melee_start(n);
        }
    }
}
static lge_box_t bounds(const lge_node_t *n) {
    lge_box_t b = {0, 0, n->definition->width, n->definition->height};
    if (n->definition->physics && n->definition->physics->box.width > 0)
        b = n->definition->physics->box;
    b.x += n->x;
    b.y += n->y;
    return b;
}
static bool overlaps(lge_box_t a, lge_box_t b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
           a.y + a.height > b.y;
}
void lge_melee_step(lge_engine_t *g) {
    lge_melee_t *m = g->melee;
    if (!m)
        return;
    for (unsigned i = 0; i < m->count; ++i) {
        lge_melee_actor_t *a = &m->actors[i];
        lge_node_t *n = &g->nodes[a->node];
        const lge_melee_def_t *d = n->definition->melee;
        if (!a->swinging || !n->effective_visible || a->tick < d->windup ||
            a->tick >= d->windup + d->active)
            continue;
        lge_box_t b = bounds(n), hit;
        float cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        if (n->facing == 2 || n->facing == 3)
            hit = (lge_box_t){n->facing == 2 ? b.x - d->reach : b.x + b.width, cy - d->width / 2.0f,
                              d->reach, d->width};
        else
            hit = (lge_box_t){cx - d->width / 2.0f,
                              n->facing == 1 ? b.y - d->reach : b.y + b.height, d->width, d->reach};
        for (unsigned j = 0; j < g->scene->count; ++j) {
            lge_node_t *t = &g->nodes[j];
            const lge_physics_def_t *p = t->definition->physics;
            uint8_t target_layer = p                            ? p->layer
                                   : t->definition->collectible ? LGE_LAYER_PICKUP
                                   : t->definition->player      ? LGE_LAYER_PLAYER
                                                                : LGE_LAYER_WORLD;
            uint32_t bit = UINT32_C(1) << (j % 32);
            if (t == n || !t->effective_visible || lge_body_type(t) == LGE_BODY_NONE ||
                t->definition->tilemap || !(target_layer & d->mask) || (a->hits[j / 32] & bit) ||
                !overlaps(hit, bounds(t)))
                continue;
            /* Children are part of the attacker's own actor, not damage targets. */
            bool child = false;
            for (uint16_t k = t->definition->parent; k; k = g->nodes[k - 1].definition->parent)
                if (k - 1 == a->node)
                    child = true;
            if (child)
                continue;
            a->hits[j / 32] |= bit;
            m->hit = (lge_melee_hit_t){n, t, d->damage};
            m->in_hit = true;
            g->event_other = n;
            if (g->on_event)
                g->on_event(g, LGE_EVENT_PROJECTILE_HIT, t, g->user);
            g->event_other = NULL;
            m->in_hit = false;
            lge_sync_hierarchy(g);
            if (g->paused || g->simulation_blocked)
                return;
        }
    }
}
const lge_melee_hit_t *lge_melee_hit(const lge_engine_t *g) {
    return g && g->melee && g->melee->in_hit ? &g->melee->hit : NULL;
}
