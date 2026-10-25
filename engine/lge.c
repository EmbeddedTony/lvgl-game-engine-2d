#include "lge_melee.h"
#include "lge.h"
#include "lge_gameplay.h"
#include <math.h>
#include <string.h>

/* Calls are serialized by the LVGL owner. Keep tokens unique across game
 * instances/recreation so queued completions from an old view stay harmless. */
static uint32_t next_audio_token;
static uint32_t next_prefab_token;

static float clamp(float v, float lo, float hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
static void emit(lge_engine_t *g, lge_event_t event, lge_node_t *node) {
    if (g->on_event)
        g->on_event(g, event, node, g->user);
}
static float gain_for(lge_engine_t *g, const lge_cue_t *cue) {
    return clamp(cue->gain * g->master_gain * g->bus_gain[cue->bus], 0, 1);
}
void lge_init(lge_engine_t *g, const lge_audio_backend_t *audio, lge_event_cb cb, void *user) {
    memset(g, 0, sizeof(*g));
    if (audio && audio->play && audio->stop && audio->pause && audio->set_gain)
        g->audio = *audio;
    g->master_gain = 1;
    for (unsigned i = 0; i < LGE_BUS_COUNT; ++i)
        g->bus_gain[i] = 1;
    g->on_event = cb;
    g->user = user;
}
void lge_audio_stop(lge_engine_t *g, uint32_t handle) {
    if (!handle)
        return;
    for (unsigned i = 0; i < LGE_MAX_VOICES; ++i) {
        if (g->voices[i].handle != handle)
            continue;
        if (g->audio.stop)
            g->audio.stop(g->audio.context, handle);
        g->voices[i] = (lge_voice_t){0};
        return;
    }
}
void lge_audio_stop_all(lge_engine_t *g) {
    for (unsigned i = 0; i < LGE_MAX_VOICES; ++i)
        lge_audio_stop(g, g->voices[i].handle);
}
void lge_audio_complete(lge_engine_t *g, uint32_t handle) {
    for (unsigned i = 0; i < LGE_MAX_VOICES; ++i)
        if (g->voices[i].handle == handle)
            g->voices[i] = (lge_voice_t){0};
}
uint32_t lge_audio_play(lge_engine_t *g, const lge_cue_t *cue) {
    if (!cue || !g->audio.play || g->paused || (unsigned)cue->bus >= LGE_BUS_COUNT ||
        !isfinite(cue->gain))
        return 0;
    unsigned slot = LGE_MAX_VOICES;
    for (unsigned i = 0; i < LGE_MAX_VOICES; ++i)
        if (!g->voices[i].handle) {
            slot = i;
            break;
        }
    if (slot == LGE_MAX_VOICES) {
        slot = 0;
        for (unsigned i = 1; i < LGE_MAX_VOICES; ++i)
            if (g->voices[i].cue->priority < g->voices[slot].cue->priority)
                slot = i;
        if (g->voices[slot].cue->priority > cue->priority)
            return 0;
        lge_audio_stop(g, g->voices[slot].handle);
    }
    /* Monotonic tokens prevent a late completion from clearing a reused slot. */
    if (++next_audio_token == 0)
        ++next_audio_token;
    uint32_t token = next_audio_token;
    g->next_voice = token;
    if (!g->audio.play(g->audio.context, token, cue, gain_for(g, cue)))
        return 0;
    g->voices[slot] = (lge_voice_t){token, cue};
    return token;
}
static void refresh_gain(lge_engine_t *g) {
    if (!g->audio.set_gain)
        return;
    for (unsigned i = 0; i < LGE_MAX_VOICES; ++i)
        if (g->voices[i].handle)
            g->audio.set_gain(g->audio.context, g->voices[i].handle, gain_for(g, g->voices[i].cue));
}
void lge_audio_set_bus(lge_engine_t *g, lge_bus_t bus, float gain) {
    if ((unsigned)bus >= LGE_BUS_COUNT || !isfinite(gain))
        return;
    g->bus_gain[bus] = clamp(gain, 0, 1);
    refresh_gain(g);
}
void lge_audio_set_master(lge_engine_t *g, float gain) {
    if (!isfinite(gain))
        return;
    g->master_gain = clamp(gain, 0, 1);
    refresh_gain(g);
}
bool lge_scene_valid(const lge_scene_def_t *scene) {
    if (!scene || !scene->nodes || scene->count > LGE_MAX_NODES || !scene->width || !scene->height)
        return false;
    const lge_camera2d_def_t *camera = scene->camera2d;
    if (camera && (!camera->world_width || !camera->world_height || camera->world_width > 4096 ||
                   camera->world_height > 4096 || !camera->follow ||
                   camera->follow > scene->count || scene->nodes[camera->follow - 1].ui_layer))
        return false;
    unsigned melee_count = 0;
    for (unsigned i = 0; i < scene->count; ++i) {
        const lge_node_def_t *d = &scene->nodes[i];
        if (d->prefab && (!*d->prefab || d->kind != LGE_INSTANCE))
            return false;
        if (d->prefab)
            for (unsigned at = d->parent; at; at = scene->nodes[at - 1].parent) {
                if (at > i || scene->nodes[at - 1].prefab)
                    return false;
            }
        if (d->input_action && (d->kind != LGE_BUTTON || !d->ui_layer || (d->input_action & 128)))
            return false;
        if (d->state_binding_count > 16 || (d->state_binding_count && !d->state_bindings))
            return false;
        if (d->event_count > 8 || (d->event_count && !d->event_pages))
            return false;
        if (d->pattern) {
            const lge_pattern_t *b = d->pattern;
            if (!b->id || d->ui_layer || d->kind == LGE_INSTANCE || b->damage > 9999 ||
                b->color > 0xffffff || (unsigned)b->mode > LGE_PATTERN_AIMED || !b->count ||
                b->count > 32 || !b->radius || b->radius > 8 || !isfinite(b->angle) ||
                fabsf(b->angle) > 360 || !isfinite(b->spread) || b->spread < 0 || b->spread > 360 ||
                !isfinite(b->rotation) || fabsf(b->rotation) > 360 || !isfinite(b->speed) ||
                b->speed < 1 || b->speed > 600 || !isfinite(b->interval) || b->interval < .05f ||
                b->interval > 60 || !isfinite(b->lifetime) || b->lifetime < .017f ||
                b->lifetime > 60)
                return false;
        }
        if (d->animator) {
            const lge_animation_clip_t *clips[] = {
                d->animator->idle,        d->animator->move,         d->animator->jump,
                d->animator->attack,      d->animator->attack_up,    d->animator->attack_down,
                d->animator->attack_left, d->animator->attack_right, d->animator->fall,
                d->animator->idle_up,     d->animator->move_up,      d->animator->idle_down,
                d->animator->move_down,   d->animator->idle_left,    d->animator->move_left,
                d->animator->idle_right,  d->animator->move_right};
            if (d->kind != LGE_SPRITE)
                return false;
            for (unsigned j = 0; j < sizeof(clips) / sizeof(clips[0]); ++j)
                if (clips[j] && (!clips[j]->frames || !clips[j]->count || clips[j]->count > 32 ||
                                 !clips[j]->fps || clips[j]->fps > 60))
                    return false;
        }
        if (d->melee) {
            const lge_melee_def_t *m = d->melee;
            if (++melee_count > LGE_MELEE_MAX || d->kind != LGE_SPRITE || d->ui_layer ||
                !m->reach || m->reach > 256 || !m->width || m->width > 256 || !m->windup ||
                !m->active || !m->recovery || m->windup > 120 || m->active > 120 ||
                m->recovery > 120 || m->damage > 9999)
                return false;
        }
        if (!d->id || !d->width || !d->height || !isfinite(d->x) || !isfinite(d->y) ||
            !isfinite(d->speed) || d->speed < 0 || d->speed > 600 || d->parent > i ||
            (unsigned)d->kind > LGE_AREA || !lge_physics_valid(d))
            return false;
        if (d->tilemap && (!d->tilemap->tile_size || !d->tilemap->columns || !d->tilemap->rows ||
                           (!d->tilemap->runs && !d->tilemap->cells) || !d->tilemap->tiles ||
                           d->tilemap->tile_count > 255))
            return false;
        if (d->tilemap && d->tilemap->animations)
            for (unsigned t = 0; t < d->tilemap->tile_count; ++t) {
                const lge_tile_animation_t *a = d->tilemap->animations[t];
                if (a) {
                    if (!a->frames || !a->count || a->count > 8 || !a->fps || a->fps > 30)
                        return false;
                    for (unsigned f = 0; f < a->count; ++f)
                        if (!a->frames[f])
                            return false;
                }
            }
        if (d->tilemap && d->tilemap->slopes)
            for (unsigned t = 0; t < d->tilemap->tile_count; ++t) {
                unsigned shape = d->tilemap->slopes[t];
                if (shape > LGE_SLOPE_DOWN ||
                    (shape && !lge_tile_is_solid(d->tilemap, (uint16_t)(t + 1))))
                    return false;
            }
    }
    return true;
}
bool lge_load(lge_engine_t *g, const lge_scene_def_t *scene) {
    if (g->prefab_mutating || !lge_scene_valid(scene))
        return false;
    if (g->scene)
        emit(g, LGE_EVENT_EXIT, NULL);
    lge_audio_stop_all(g);
    if (g->paused && g->audio.pause)
        g->audio.pause(g->audio.context, false);
    g->scene = scene;
    g->ticks = 0;
    g->score = 0;
    g->total = 0;
    g->input = 0;
    g->virtual_input = g->controller_input = 0;
    g->controller_x = g->controller_y = 0;
    g->override_mask = 0;
    g->input_overridden = false;
    memset(g->held_buttons, 0, sizeof(g->held_buttons));
    g->complete = false;
    g->paused = false;
    g->accumulator = 0;
    g->previous_input = 0;
    g->event_other = NULL;
    g->simulation_blocked = false;
    g->camera_override = false;
    g->pressed_input = 0;
    g->step_input = 0;
    g->step_pressed = 0;
    g->stepping = false;
    g->prefab_mutating = false;
    memset(g->area_contacts, 0, sizeof(g->area_contacts));
    if (g->melee)
        lge_melee_init(g, g->melee);
    if (g->projectiles)
        lge_projectiles_init(g, g->projectiles, g->projectiles->capacity);
    for (unsigned i = 0; i < scene->count; ++i) {
        const lge_node_def_t *d = &scene->nodes[i];
        const lge_node_t *parent = d->parent ? &g->nodes[d->parent - 1] : NULL;
        float x = d->x + (parent ? parent->x : 0), y = d->y + (parent ? parent->y : 0);
        bool visible = !d->prefab && d->visible && (!parent || parent->effective_visible);
        g->nodes[i] = (lge_node_t){.definition = d,
                                   .emitter_enabled = d->emitter_autoplay,
                                   .speed = d->speed,
                                   .image = d->image,
                                   .owner = g,
                                   .x = x,
                                   .y = y,
                                   .visible = d->visible,
                                   .active = !d->prefab,
                                   .collectible_counted = d->collectible && visible,
                                   .effective_visible = visible,
                                   .hierarchy_x = x,
                                   .hierarchy_y = y,
                                   .velocity_x = d->physics ? d->physics->velocity_x : 0,
                                   .velocity_y = d->physics ? d->physics->velocity_y : 0};
        if (d->collectible && visible)
            ++g->total;
    }
    lge_audio_play(g, scene->music);
    emit(g, LGE_EVENT_START, NULL);
    return true;
}
void lge_destroy(lge_engine_t *g) {
    if (g->prefab_mutating)
        return;
    if (g->scene)
        emit(g, LGE_EVENT_EXIT, NULL);
    lge_audio_stop_all(g);
    if (g->paused && g->audio.pause)
        g->audio.pause(g->audio.context, false);
    g->scene = NULL;
    g->input = 0;
    g->virtual_input = g->controller_input = 0;
    g->controller_x = g->controller_y = 0;
    g->override_mask = 0;
    g->input_overridden = false;
    memset(g->held_buttons, 0, sizeof(g->held_buttons));
    g->paused = false;
}
void lge_override_input(lge_engine_t *g, bool enabled, uint8_t mask) {
    if (!g)
        return;
    mask &= 127;
    if (g->input_overridden != enabled) {
        g->input = g->virtual_input = g->pressed_input = g->previous_input = 0;
        memset(g->held_buttons, 0, sizeof(g->held_buttons));
        g->override_mask = 0;
    }
    if (enabled)
        g->pressed_input |= mask & (uint8_t)~g->override_mask;
    g->override_mask = enabled ? mask : 0;
    g->input_overridden = enabled;
}
void lge_set_input(lge_engine_t *g, uint8_t mask) {
    if (g->input_overridden)
        return;
    g->pressed_input |= (mask & (uint8_t)~(g->input | g->virtual_input | g->controller_input));
    g->input = mask;
}
void lge_set_controller_input(lge_engine_t *g, uint8_t mask, uint8_t pressed, float x, float y) {
    mask &= 127;
    /* Continue tracking held state while paused/overridden, but discard its edges. */
    if (!g->paused && !g->input_overridden)
        g->pressed_input |= pressed & (uint8_t)~(g->input | g->virtual_input);
    if (!g->input_overridden)
        g->previous_input |= mask & (uint8_t)~pressed;
    g->controller_input = mask;
    g->controller_x = isfinite(x) ? fmaxf(-1, fminf(1, x)) : 0;
    g->controller_y = isfinite(y) ? fmaxf(-1, fminf(1, y)) : 0;
}
void lge_move_input(const lge_engine_t *g, float *x, float *y) {
    uint8_t bits = lge_input(g);
    float dx = ((bits & LGE_INPUT_RIGHT) != 0) - ((bits & LGE_INPUT_LEFT) != 0);
    float dy = ((bits & LGE_INPUT_UP) != 0) - ((bits & LGE_INPUT_DOWN) != 0);
    if (!g->input_overridden) {
        if (fabsf(g->controller_x) > fabsf(dx))
            dx = g->controller_x;
        if (fabsf(g->controller_y) > fabsf(dy))
            dy = g->controller_y;
    }
    if (x)
        *x = dx;
    if (y)
        *y = dy;
}
void lge_button_input(lge_node_t *n, bool held) {
    if (!n || !n->owner || !n->owner->scene || n->definition->kind != LGE_BUTTON ||
        !n->definition->ui_layer || !n->definition->input_action)
        return;
    lge_engine_t *g = n->owner;
    if (g->input_overridden)
        return;
    if (held && (g->paused || !n->effective_visible))
        return;
    unsigned index = (unsigned)(n - g->nodes);
    if (index >= g->scene->count)
        return;
    uint32_t bit = (uint32_t)1 << (index % 32);
    if (((g->held_buttons[index / 32] & bit) != 0) == held)
        return; /* PRESSING repeats while held; recompute only on an ownership change. */
    if (held)
        g->held_buttons[index / 32] |= bit;
    else
        g->held_buttons[index / 32] &= ~bit;
    uint8_t mask = 0;
    for (unsigned j = 0; j < g->scene->count; ++j)
        if ((g->held_buttons[j / 32] & ((uint32_t)1 << (j % 32))) && g->nodes[j].effective_visible)
            mask |= g->nodes[j].definition->input_action;
    g->pressed_input |= mask & (uint8_t)~(g->input | g->virtual_input | g->controller_input);
    g->virtual_input = mask;
}
uint8_t lge_input(const lge_engine_t *g) {
    return g->stepping
               ? g->step_input
               : (g->input_overridden ? g->override_mask
                                      : (g->input | g->virtual_input | g->controller_input));
}
uint8_t lge_input_pressed(const lge_engine_t *g) {
    return g->stepping ? g->step_pressed : 0;
}
void lge_pause(lge_engine_t *g, bool paused) {
    if (g->paused == paused)
        return;
    g->paused = paused;
    g->input = 0;
    g->virtual_input = 0;
    memset(g->held_buttons, 0, sizeof(g->held_buttons));
    g->previous_input = 0;
    g->pressed_input = 0;
    g->step_pressed = 0;
    g->accumulator = 0;
    if (g->audio.pause)
        g->audio.pause(g->audio.context, paused);
}
lge_node_t *lge_find(lge_engine_t *g, const char *id) {
    if (!g->scene || !id)
        return NULL;
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (strcmp(g->nodes[i].definition->id, id) == 0)
            return &g->nodes[i];
    return NULL;
}
lge_node_t *lge_node_parent(lge_node_t *n) {
    return n && n->owner && n->definition->parent ? &n->owner->nodes[n->definition->parent - 1]
                                                  : NULL;
}
/* Preserve the public world-space x/y fields used by existing C hooks. Parent
 * deltas propagate once, including direct field writes and controller motion. */
void lge_sync_hierarchy(lge_engine_t *g) {
    if (!g || !g->scene)
        return;
    float dx[LGE_MAX_NODES], dy[LGE_MAX_NODES];
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        unsigned parent = n->definition->parent;
        if (parent) {
            n->x += dx[parent - 1];
            n->y += dy[parent - 1];
        }
        dx[i] = n->x - n->hierarchy_x;
        dy[i] = n->y - n->hierarchy_y;
        n->hierarchy_x = n->x;
        n->hierarchy_y = n->y;
        n->effective_visible =
            n->active && n->visible && (!parent || g->nodes[parent - 1].effective_visible);
    }
}
bool lge_node_set_position(lge_node_t *n, float x, float y) {
    if (!n || !isfinite(x) || !isfinite(y) || fabsf(x) > 32767 || fabsf(y) > 32767)
        return false;
    lge_sync_hierarchy(n->owner);
    n->grid_active = false;
    n->x = x;
    n->y = y;
    lge_sync_hierarchy(n->owner);
    return true;
}
bool lge_node_set_local_position(lge_node_t *n, float x, float y) {
    if (!n || !isfinite(x) || !isfinite(y))
        return false;
    lge_sync_hierarchy(n->owner);
    lge_node_t *parent = lge_node_parent(n);
    return lge_node_set_position(n, x + (parent ? parent->x : 0), y + (parent ? parent->y : 0));
}
void lge_node_set_visible(lge_node_t *n, bool visible) {
    if (n) {
        n->visible = visible;
        lge_sync_hierarchy(n->owner);
        for (unsigned i = 0; i < n->owner->scene->count; ++i)
            if (!n->owner->nodes[i].effective_visible &&
                n->owner->nodes[i].definition->input_action)
                lge_button_input(&n->owner->nodes[i], false);
    }
}

/* Parent-before-child tables make subtree membership bounded O(nodes), even when
 * authored descendants were interleaved with unrelated siblings. */
static void prefab_members(const lge_engine_t *g, unsigned root, bool *members) {
    memset(members, 0, LGE_MAX_NODES * sizeof(*members));
    members[root] = true;
    for (unsigned i = root + 1; i < g->scene->count; ++i) {
        unsigned parent = g->nodes[i].definition->parent;
        members[i] = parent && members[parent - 1];
    }
}
static void prefab_clear(lge_engine_t *g, const bool *members) {
    uint8_t bits[LGE_NODE_CONTACT_BYTES] = {0};
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (members[i])
            bits[i / 8] |= (uint8_t)(1u << (i % 8));
    for (unsigned i = 0; i < g->scene->count; ++i) {
        if (members[i]) {
            memset(g->area_contacts[i], 0, sizeof(g->area_contacts[i]));
            lge_button_input(&g->nodes[i], false);
        }
        for (unsigned j = 0; j < sizeof(bits); ++j)
            g->area_contacts[i][j] &= (uint8_t)~bits[j];
    }
    if (g->melee)
        for (unsigned i = 0; i < g->melee->count; ++i) {
            lge_melee_actor_t *a = &g->melee->actors[i];
            if (members[a->node]) {
                a->tick = 0;
                a->swinging = false;
                memset(a->hits, 0, sizeof(a->hits));
            }
            for (unsigned j = 0; j < g->scene->count; ++j)
                if (members[j])
                    a->hits[j / 32] &= ~((uint32_t)1 << (j % 32));
        }
    if (g->projectiles)
        for (unsigned i = 0; i < g->projectiles->capacity; ++i)
            if (g->projectiles->slots[i].owner < g->scene->count &&
                members[g->projectiles->slots[i].owner])
                g->projectiles->slots[i] = (lge_projectile_t){0};
}
lge_node_t *lge_prefab_node(lge_engine_t *g, lge_prefab_handle_t h, const char *path) {
    if (!g || !g->scene || !h.generation || h.index >= g->scene->count)
        return NULL;
    lge_node_t *root = &g->nodes[h.index];
    if (!root->definition->prefab || !root->active || root->generation != h.generation)
        return NULL;
    if (!path || !*path)
        return root;
    size_t length = strlen(root->definition->id);
    bool members[LGE_MAX_NODES];
    prefab_members(g, h.index, members);
    for (unsigned i = h.index + 1; i < g->scene->count; ++i) {
        const char *id = g->nodes[i].definition->id;
        if (members[i] && !strncmp(id, root->definition->id, length) && id[length] == '/' &&
            !strcmp(id + length + 1, path))
            return &g->nodes[i];
    }
    return NULL;
}
lge_prefab_handle_t lge_prefab_spawn(lge_engine_t *g, const char *source, float x, float y) {
    lge_prefab_handle_t empty = {0};
    if (!g || !g->scene || !source || g->prefab_mutating || !isfinite(x) || !isfinite(y))
        return empty;
    lge_sync_hierarchy(g);
    for (unsigned root = 0; root < g->scene->count; ++root) {
        lge_node_t *r = &g->nodes[root];
        if (!r->definition->prefab || r->active || strcmp(r->definition->prefab, source))
            continue;
        lge_node_t *owner = lge_node_parent(r);
        if (owner && !owner->effective_visible)
            continue;
        bool members[LGE_MAX_NODES];
        prefab_members(g, root, members);
        /* Validate every resulting coordinate before mutating any state. */
        float xs[LGE_MAX_NODES], ys[LGE_MAX_NODES];
        for (unsigned i = root; i < g->scene->count; ++i)
            if (members[i]) {
                const lge_node_def_t *d = g->nodes[i].definition;
                xs[i] = i == root ? x : xs[d->parent - 1] + d->x;
                ys[i] = i == root ? y : ys[d->parent - 1] + d->y;
                if (fabsf(xs[i]) > 32767 || fabsf(ys[i]) > 32767)
                    return empty;
            }
        g->prefab_mutating = true;
        prefab_clear(g, members);
        if (++next_prefab_token == 0)
            ++next_prefab_token;
        for (unsigned i = root; i < g->scene->count; ++i)
            if (members[i]) {
                const lge_node_def_t *d = g->nodes[i].definition;
                g->nodes[i] = (lge_node_t){.definition = d,
                                           .owner = g,
                                           .x = xs[i],
                                           .y = ys[i],
                                           .hierarchy_x = xs[i],
                                           .hierarchy_y = ys[i],
                                           .visible = d->visible,
                                           .active = true,
                                           .speed = d->speed,
                                           .image = d->image,
                                           .emitter_enabled = d->emitter_autoplay,
                                           .velocity_x = d->physics ? d->physics->velocity_x : 0,
                                           .velocity_y = d->physics ? d->physics->velocity_y : 0,
                                           .generation = i == root ? next_prefab_token : 0};
            }
        lge_sync_hierarchy(g);
        for (unsigned i = root; i < g->scene->count; ++i)
            if (members[i]) {
                lge_node_t *n = &g->nodes[i];
                if (n->definition->collectible && n->effective_visible && g->total < UINT16_MAX) {
                    ++g->total;
                    n->collectible_counted = true;
                }
            }
        lge_prefab_handle_t handle = {r->generation, (uint16_t)root};
        for (unsigned i = root; i < g->scene->count; ++i)
            if (members[i])
                emit(g, LGE_EVENT_SPAWN, &g->nodes[i]);
        g->prefab_mutating = false;
        return handle;
    }
    return empty;
}
bool lge_prefab_despawn(lge_engine_t *g, lge_prefab_handle_t handle) {
    lge_node_t *root = lge_prefab_node(g, handle, NULL);
    if (!root || g->prefab_mutating)
        return false;
    bool members[LGE_MAX_NODES];
    prefab_members(g, handle.index, members);
    g->prefab_mutating = true;
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (members[i]) {
            emit(g, LGE_EVENT_DESPAWN, &g->nodes[i]);
            lge_node_t *n = &g->nodes[i];
            if (n->collectible_counted && !n->collected && g->total)
                --g->total;
            n->collectible_counted = false;
        }
    prefab_clear(g, members);
    root->active = false;
    root->generation = 0;
    lge_sync_hierarchy(g);
    g->prefab_mutating = false;
    return true;
}
const void *lge_tile_image(const lge_tilemap_t *m, uint16_t v, uint32_t ticks) {
    if (!m || !v || v > m->tile_count)
        return NULL;
    const lge_tile_animation_t *a = m->animations ? m->animations[v - 1] : NULL;
    if (!a)
        return m->tiles[v - 1];
    uint32_t frame = (ticks / 60 * a->fps + (ticks % 60) * a->fps / 60) % a->count;
    return a->frames[frame];
}
uint16_t lge_tile_cursor_at(lge_tile_cursor_t *cursor, const lge_tilemap_t *map, int column,
                            int row) {
    if (!map || column < 0 || row < 0 || column >= map->columns || row >= map->rows)
        return 0;
    uint32_t target = (uint32_t)row * map->columns + (unsigned)column;
    if (map->cells)
        return map->cells[target];
    if (!map->runs || !map->run_count)
        return 0;
    uint32_t run = 0, start = 0;
    if (cursor->map == map && target >= cursor->start && target < cursor->end) {
        return map->runs[cursor->run * 2 + 1];
    }
    if (cursor->map == map && target >= cursor->end && target - cursor->end < 16) {
        run = cursor->run + 1;
        start = cursor->end;
    } else if (map->run_seek) {
        uint32_t low = 0, high = (map->run_count - 1) / 16 + 1;
        while (low + 1 < high) {
            uint32_t mid = low + (high - low) / 2;
            if (map->run_seek[mid] <= target)
                low = mid;
            else
                high = mid;
        }
        run = low * 16;
        start = map->run_seek[low];
    }
    if (cursor->map == map && target >= cursor->end && cursor->end > start) {
        run = cursor->run + 1;
        start = cursor->end;
    }
    for (; run < map->run_count; ++run) {
        uint32_t end = start + map->runs[run * 2];
        if (target < end) {
            *cursor = (lge_tile_cursor_t){map, run, start, end};
            return map->runs[run * 2 + 1];
        }
        start = end;
    }
    return 0;
}
uint16_t lge_tile_at(const lge_tilemap_t *map, int column, int row) {
    lge_tile_cursor_t cursor = {0};
    return lge_tile_cursor_at(&cursor, map, column, row);
}
bool lge_tile_is_solid(const lge_tilemap_t *map, uint16_t value) {
    if (!map || !value || value > map->tile_count)
        return false;
    return map->solid_bits ? (map->solid_bits[(value - 1) / 8] & (1u << ((value - 1) % 8))) != 0
                           : value <= 32 && (map->solid_mask & (UINT32_C(1) << (value - 1))) != 0;
}
static void tick(lge_engine_t *g) {
    ++g->ticks;
    lge_sync_hierarchy(g);
    if (!g->simulation_blocked) {
        lge_melee_prepare(g);
        lge_physics_step(g);
        lge_melee_step(g);
        lge_projectiles_step(g);
    }
    if (g->on_update)
        g->on_update(g, LGE_FIXED_SECONDS, g->user);
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        const lge_animator_def_t *a = n->definition->animator;
        if (!a)
            continue;
        bool platform =
            n->definition->physics && n->definition->physics->motion == LGE_MOTION_PLATFORMER;
        const lge_animation_clip_t *clip = platform && !n->on_floor && n->velocity_y < -1  ? a->jump
                                           : platform && !n->on_floor && n->velocity_y > 1 ? a->fall
                                           : fabsf(n->velocity_x) > 1 || fabsf(n->velocity_y) > 1
                                               ? a->move
                                               : a->idle;
        if (!lge_melee_active(n) && fabsf(n->velocity_x) > 1)
            n->facing = n->velocity_x < 0 ? 2 : 3;
        else if (!lge_melee_active(n) && fabsf(n->velocity_y) > 1)
            n->facing = n->velocity_y < 0 ? 1 : 0;
        if (!platform) {
            bool moving = fabsf(n->velocity_x) > 1 || fabsf(n->velocity_y) > 1;
            const lge_animation_clip_t *dirs[] = {
                moving ? a->move_down : a->idle_down, moving ? a->move_up : a->idle_up,
                moving ? a->move_left : a->idle_left, moving ? a->move_right : a->idle_right};
            if (dirs[n->facing])
                clip = dirs[n->facing];
        }
        const lge_animation_clip_t *attacks[] = {a->attack_down, a->attack_up, a->attack_left,
                                                 a->attack_right};
        const lge_animation_clip_t *swing = attacks[n->facing] ? attacks[n->facing] : a->attack;
        bool attacking = lge_melee_active(n) && swing;
        if (attacking)
            clip = swing;
        if (!clip)
            clip = a->idle;
        if (!clip)
            continue;
        if (attacking) {
            n->animation = clip;
            n->animation_time = lge_melee_time(n);
        } else if (clip != n->animation) {
            n->animation = clip;
            n->animation_time = 0;
        } else
            n->animation_time += LGE_FIXED_SECONDS;
        unsigned frame = (unsigned)floorf(n->animation_time * clip->fps + .00001f);
        if (clip->loop) {
            frame %= clip->count;
            n->animation_time = fmodf(n->animation_time, (float)clip->count / clip->fps);
        } else if (frame >= clip->count) {
            frame = clip->count - 1;
            n->animation_time = (float)frame / clip->fps;
        }
        n->image = clip->frames[frame];
    }
    lge_sync_hierarchy(g);
}
void lge_update(lge_engine_t *g, uint32_t elapsed_ms) {
    if (!g->scene || g->paused)
        return;
    if (elapsed_ms > 100)
        elapsed_ms = 100; /* Bounded catch-up after a slow display flush. */
    g->accumulator += (float)elapsed_ms / 1000;
    while (g->accumulator + 0.000001f >= LGE_FIXED_SECONDS) {
        g->accumulator -= LGE_FIXED_SECONDS;
        g->step_pressed = g->pressed_input;
        g->pressed_input = 0;
        g->step_input =
            (g->input_overridden ? g->override_mask
                                 : (g->input | g->virtual_input | g->controller_input)) |
            g->step_pressed;
        g->stepping = true;
        tick(g);
        g->stepping = false;
    }
}
void lge_click(lge_node_t *node) {
    if (!node || !node->owner)
        return;
    lge_sync_hierarchy(node->owner);
    if (!node->effective_visible || node->owner->paused || node->owner->input_overridden ||
        node->definition->kind != LGE_BUTTON)
        return;
    lge_audio_play(node->owner, node->definition->cue);
    emit(node->owner, LGE_EVENT_CLICK, node);
}

bool lge_camera_position(const lge_engine_t *g, float *x, float *y) {
    if (x)
        *x = 0;
    if (y)
        *y = 0;
    if (!g || !g->scene || !g->scene->camera2d)
        return false;
    const lge_camera2d_def_t *c = g->scene->camera2d;
    if (g->camera_override) {
        if (x)
            *x = floorf(clamp(g->camera_x, 0, fmaxf(0, c->world_width - g->scene->width)) + .5f);
        if (y)
            *y = floorf(clamp(g->camera_y, 0, fmaxf(0, c->world_height - g->scene->height)) + .5f);
        return true;
    }
    if (!c->follow || c->follow > g->scene->count)
        return false;
    const lge_node_t *target = &g->nodes[c->follow - 1];
    if (x)
        *x = floorf(clamp(target->x + target->definition->width * .5f - g->scene->width * .5f, 0,
                          fmaxf(0, c->world_width - g->scene->width)) +
                    .5f);
    if (y && c->follow_y)
        *y = floorf(clamp(target->y + target->definition->height * .5f - g->scene->height * .5f, 0,
                          fmaxf(0, c->world_height - g->scene->height)) +
                    .5f);
    return true;
}

float lge_time_seconds(const lge_engine_t *g) {
    return g && g->scene ? g->ticks * LGE_FIXED_SECONDS : 0;
}
float lge_delta_seconds(const lge_engine_t *g) {
    return g && g->stepping ? LGE_FIXED_SECONDS : 0;
}
bool lge_node_set_speed(lge_node_t *n, float speed) {
    if (!n || !isfinite(speed) || speed < 0 || speed > 600)
        return false;
    n->speed = speed;
    return true;
}
bool lge_body_velocity(const lge_node_t *n, float *x, float *y) {
    if (x)
        *x = n ? n->velocity_x : 0;
    if (y)
        *y = n ? n->velocity_y : 0;
    return n && (lge_body_type(n) == LGE_BODY_CHARACTER || lge_body_type(n) == LGE_BODY_PLATFORM);
}
