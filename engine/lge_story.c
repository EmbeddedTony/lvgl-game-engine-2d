#include "lge_story.h"
#include "lge_gameplay.h"
#include "lge_rpg.h"
#include <math.h>
#include <string.h>
#include <limits.h>
static uint16_t mapped_key(const lge_node_t *owner, uint16_t key) {
    if (owner)
        for (unsigned i = 0; i < owner->definition->state_binding_count; ++i)
            if (owner->definition->state_bindings[i].from == key)
                return owner->definition->state_bindings[i].to;
    return key;
}
static bool test(const lge_story_t *s, const lge_condition_t *c, const lge_node_t *owner) {
    if (!c)
        return true;
    if (!s->definition || mapped_key(owner, c->key) >= s->definition->field_count)
        return false;
    int32_t a = s->values[mapped_key(owner, c->key)], b = c->value;
    switch (c->compare) {
    case LGE_COMPARE_EQ:
        return a == b;
    case LGE_COMPARE_NE:
        return a != b;
    case LGE_COMPARE_LT:
        return a < b;
    case LGE_COMPARE_GTE:
        return a >= b;
    }
    return false;
}
static int key_index(const lge_story_t *s, const char *id) {
    if (!s || !s->definition || !id)
        return -1;
    for (unsigned i = 0; i < s->definition->field_count; ++i)
        if (strcmp(id, s->definition->fields[i].id) == 0)
            return (int)i;
    return -1;
}
static void assign(lge_story_t *s, unsigned key, int64_t value) {
    const lge_state_def_t *d = &s->definition->fields[key];
    int32_t previous = s->values[key];
    s->values[key] = (int32_t)(value < d->min ? d->min : value > d->max ? d->max : value);
    if (previous != s->values[key])
        ++s->revision;
}
bool lge_state_get(const lge_story_t *s, const char *id, int32_t *out) {
    int k = key_index(s, id);
    if (k < 0 || !out)
        return false;
    *out = s->values[k];
    return true;
}
bool lge_state_set(lge_story_t *s, const char *id, int32_t value) {
    int k = key_index(s, id);
    if (k < 0)
        return false;
    assign(s, (unsigned)k, value);
    return true;
}
bool lge_state_add(lge_story_t *s, const char *id, int32_t value) {
    int k = key_index(s, id);
    if (k < 0)
        return false;
    assign(s, (unsigned)k, (int64_t)s->values[k] + value);
    return true;
}
void lge_story_init(lge_story_t *s, const lge_story_def_t *d) {
    memset(s, 0, sizeof(*s));
    s->dialog_slot = -1;
    s->facing_y = 1;
    if (!d || d->field_count > LGE_STATE_MAX || d->script_count > 512 ||
        (d->field_count && !d->fields) || (d->script_count && !d->scripts))
        return;
    s->definition = d;
    for (unsigned i = 0; i < d->field_count; ++i)
        s->values[i] = d->fields[i].initial;
}
static bool start(lge_story_t *s, lge_engine_t *g, unsigned script, lge_node_t *owner,
                  lge_node_t *other) {
    if (!s->definition || script >= s->definition->script_count)
        return false;
    const lge_script_def_t *d = &s->definition->scripts[script];
    if (d->cinematic)
        for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
            if (s->runners[i].script && s->runners[i].script->cinematic)
                return false;
    unsigned own = owner ? (unsigned)(owner - g->nodes) + 1 : 0,
             oth = other ? (unsigned)(other - g->nodes) + 1 : 0;
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
        if (s->runners[i].script == d && s->runners[i].owner == own)
            return false;
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
        if (!s->runners[i].script) {
            s->runners[i] =
                (lge_script_runner_t){.script = d, .owner = (uint16_t)own, .other = (uint16_t)oth};
            return true;
        }
    ++s->rejected_starts;
    return false;
}
bool lge_story_start(lge_story_t *s, lge_engine_t *g, const char *id, lge_node_t *owner,
                     lge_node_t *other) {
    if (!s || !g || !s->definition || !id || (owner && owner->owner != g) ||
        (other && other->owner != g))
        return false;
    for (unsigned i = 0; i < s->definition->script_count; ++i)
        if (strcmp(id, s->definition->scripts[i].id) == 0)
            return start(s, g, i, owner, other);
    return false;
}
bool lge_story_signal(lge_story_t *s, lge_engine_t *g, lge_trigger_t trigger, lge_node_t *n,
                      lge_node_t *other) {
    if (!s || !g || !g->scene || !n || n->owner != g)
        return false;
    const lge_node_def_t *d = n->definition;
    for (unsigned i = d->event_count; i > 0; --i) {
        const struct lge_event_page *p = &d->event_pages[i - 1];
        if (p->trigger == trigger && test(s, p->when, n))
            return start(s, g, p->script, n, other);
    }
    return false;
}
void lge_story_enter(lge_story_t *s, lge_engine_t *g) {
    lge_battle_cancel(s->rpg);
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
        if (s->runners[i].checkpoint_pending && s->checkpoint_feedback)
            (void)s->checkpoint_feedback(s->checkpoint_context, LGE_CHECKPOINT_FAILED);
    memset(s->runners, 0, sizeof(s->runners));
    s->dialog_slot = -1;
    s->warp_scene = NULL;
    g->camera_override = false;
    ++s->dialogue_revision;
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (g->nodes[i].effective_visible)
            (void)lge_story_signal(s, g, LGE_TRIGGER_START, &g->nodes[i], NULL);
    g->simulation_blocked = lge_story_blocking(s);
}
void lge_story_forget_node(lge_story_t *s, lge_engine_t *g, lge_node_t *node) {
    if (!s || !g || !node || node->owner != g)
        return;
    unsigned index = (unsigned)(node - g->nodes) + 1;
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i) {
        lge_script_runner_t *r = &s->runners[i];
        if (!r->script || (r->owner != index && r->other != index && r->track_node != index))
            continue;
        if (r->battle)
            lge_battle_cancel(s->rpg);
        if (r->checkpoint_pending && s->checkpoint_feedback)
            (void)s->checkpoint_feedback(s->checkpoint_context, LGE_CHECKPOINT_FAILED);
        if (r->script->cinematic) g->camera_override = false;
        if (r->tracking && r->track_node) {
            g->nodes[r->track_node - 1].velocity_x = 0;
            g->nodes[r->track_node - 1].velocity_y = 0;
        }
        if (s->dialog_slot == (int)i) {
            s->dialog_slot = -1;
            ++s->dialogue_revision;
        }
        *r = (lge_script_runner_t){0};
    }
    g->simulation_blocked = lge_story_blocking(s);
}
bool lge_story_blocking(const lge_story_t *s) {
    if (s->dialog_slot >= 0 || lge_rpg_blocking(s->rpg))
        return true;
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i)
        if (s->runners[i].script && s->runners[i].script->blocking)
            return true;
    return false;
}
const lge_action_t *lge_story_dialogue(const lge_story_t *s) {
    if (!s || s->dialog_slot < 0 || s->dialog_slot >= LGE_SCRIPT_SLOTS)
        return NULL;
    const lge_script_runner_t *r = &s->runners[(unsigned)s->dialog_slot];
    return r->script && r->pc < r->script->count ? &r->script->actions[r->pc] : NULL;
}
static unsigned utf8_size(const char *p) {
    unsigned char c = (unsigned char)*p;
    return c < 128 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : 4;
}
/* Match dialogueBottom in the editor: preserve lower touch controls when a page
 * fits above them. The in-panel advance button remains usable on small displays. */
static unsigned dialogue_bottom(const lge_engine_t *g, unsigned choices) {
    int height = g->scene->height, bottom = height - 8;
    for (unsigned i = 0; i < g->scene->count; ++i) {
        const lge_node_t *n = &g->nodes[i];
        if (n->effective_visible && n->definition->ui_layer && n->definition->input_action &&
            n->y >= height / 2.0f && n->y < height) {
            int edge = (int)floorf(n->y) - 8;
            if (edge < bottom)
                bottom = edge;
        }
    }
    return (unsigned)(bottom >= 122 + (int)choices * 20 ? bottom : height - 8);
}
static void page(lge_story_t *s) {
    const lge_action_t *a = lge_story_dialogue(s);
    const char *text = a && a->text ? a->text : "";
    size_t at = s->page_offset, out = 0;
    unsigned col = 0, line = 0;
    while (text[at]) {
        char c = text[at];
        if (c == '\n') {
            ++at;
            if (line + 1 >= s->page_rows)
                break;
            s->page_text[out++] = '\n';
            ++line;
            col = 0;
            continue;
        }
        if (c == ' ' && !col) {
            ++at;
            continue;
        }
        unsigned word = 0;
        if (c != ' ' && (!at || text[at - 1] == ' ' || text[at - 1] == '\n')) {
            size_t scan = at;
            while (text[scan] && text[scan] != ' ' && text[scan] != '\n') {
                ++word;
                scan += utf8_size(text + scan);
            }
        }
        if (col >= s->page_columns ||
            (word && word <= s->page_columns && col && col + word > s->page_columns)) {
            if (line + 1 >= s->page_rows)
                break;
            s->page_text[out++] = '\n';
            ++line;
            col = 0;
            continue;
        }
        unsigned bytes = utf8_size(text + at);
        if (out + bytes > 1000)
            break;
        for (unsigned i = 0; i < bytes; ++i)
            s->page_text[out++] = text[at++];
        ++col;
    }
    while (out && (s->page_text[out - 1] == ' ' || s->page_text[out - 1] == '\n'))
        --out;
    s->page_text[out] = 0;
    s->page_next = (uint16_t)at;
    s->page_final = !text[at];
    s->page_length = (uint16_t)out;
    s->page_visible = a && a->text_speed ? 0 : (uint16_t)out;
    s->reveal_credit = 0;
    ++s->dialogue_revision;
}
bool lge_story_revealing(const lge_story_t *s) {
    return lge_story_dialogue(s) && s->page_visible < s->page_length;
}
static void reveal_step(lge_story_t *s, const lge_action_t *a, float seconds) {
    if (!lge_story_revealing(s) || seconds <= 0)
        return;
    float credit = fminf((float)s->page_length, s->reveal_credit + seconds * a->text_speed);
    unsigned count = (unsigned)(credit + .0001f);
    s->reveal_credit = fmaxf(0, credit - count);
    uint16_t before = s->page_visible;
    while (count-- && s->page_visible < s->page_length) {
        unsigned end = s->page_visible + utf8_size(s->page_text + s->page_visible);
        s->page_visible = (uint16_t)(end > s->page_length ? s->page_length : end);
    }
    if (s->page_visible == s->page_length)
        s->reveal_credit = 0;
    if (before != s->page_visible)
        ++s->dialogue_revision;
}
static uint16_t next(int16_t target, uint16_t pc) {
    return target < 0 ? (uint16_t)(pc + 1) : (uint16_t)target;
}
bool lge_story_choose(lge_story_t *s, unsigned choice) {
    const lge_action_t *a = lge_story_dialogue(s);
    if (!a)
        return false;
    if (s->page_final && a->choice_count && choice >= a->choice_count)
        return false;
    if (lge_story_revealing(s)) {
        s->page_visible = s->page_length;
        s->reveal_credit = 0;
        ++s->dialogue_revision;
        return true;
    }
    if (!s->page_final) {
        s->page_offset = s->page_next;
        page(s);
        return true;
    }
    if (a->choice_count && choice >= a->choice_count)
        return false;
    lge_script_runner_t *r = &s->runners[(unsigned)s->dialog_slot];
    r->pc = a->choice_count ? next(a->choices[choice].target, r->pc) : (uint16_t)(r->pc + 1);
    r->dialog = false;
    s->dialog_slot = -1;
    ++s->dialogue_revision;
    return true;
}
static lge_node_t *player(lge_engine_t *g) {
    for (unsigned i = 0; i < g->scene->count; ++i)
        if (g->nodes[i].definition->player && g->nodes[i].effective_visible)
            return &g->nodes[i];
    return NULL;
}
static lge_node_t *target(lge_engine_t *g, const lge_script_runner_t *r, const char *id) {
    if (!id)
        return NULL;
    if (strcmp(id, "self") == 0)
        return r->owner ? &g->nodes[r->owner - 1] : NULL;
    if (strcmp(id, "other") == 0)
        return r->other ? &g->nodes[r->other - 1] : NULL;
    if (strcmp(id, "player") == 0)
        return player(g);
    return lge_find(g, id);
}
static bool track_step(lge_script_runner_t *r, lge_engine_t *g, float seconds) {
    if (!r->tracking)
        return false;
    r->elapsed_ms = fminf(r->duration_ms, r->elapsed_ms + seconds * 1000);
    float f = r->duration_ms > 0 ? r->elapsed_ms / r->duration_ms : 1;
    float x = r->from_x + (r->to_x - r->from_x) * f,
          y = r->from_y + (r->to_y - r->from_y) * f;
    if (r->track_node) {
        lge_node_t *n = &g->nodes[r->track_node - 1];
        (void)lge_node_set_position(n, x, y);
        n->velocity_x = f < 1 && r->duration_ms > 0 ? (r->to_x - r->from_x) * 1000 / r->duration_ms : 0;
        n->velocity_y = f < 1 && r->duration_ms > 0 ? (r->to_y - r->from_y) * 1000 / r->duration_ms : 0;
    } else {
        g->camera_override = true;
        g->camera_x = x;
        g->camera_y = y;
    }
    r->tracking = f < 1;
    return r->tracking;
}
bool lge_story_skip(lge_story_t *s, lge_engine_t *g) {
    if (!s || !g || g->paused)
        return false;
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i) {
        lge_script_runner_t *r = &s->runners[i];
        if (!r->script || !r->started || !r->script->cinematic || r->script->skip_to < 0 ||
            r->script->skip_to >= r->script->count || r->pc > (uint16_t)r->script->skip_to)
            continue;
        if (r->tracking && r->track_node) {
            g->nodes[r->track_node - 1].velocity_x = 0;
            g->nodes[r->track_node - 1].velocity_y = 0;
        }
        r->tracking = false;
        r->wait_ms = 0;
        r->dialog = false;
        r->pc = (uint16_t)r->script->skip_to;
        if (s->dialog_slot == (int)i) {
            s->dialog_slot = -1;
            ++s->dialogue_revision;
        }
        g->camera_override = false;
        return true;
    }
    return false;
}
static void interact(lge_story_t *s, lge_engine_t *g) {
    lge_node_t *p = player(g), *best = NULL;
    if (!p)
        return;
    float dist = 1600.001f, px = p->x + p->definition->width * .5f,
          py = p->y + p->definition->height * .5f;
    for (unsigned i = 0; i < g->scene->count; ++i) {
        lge_node_t *n = &g->nodes[i];
        if (n == p || !n->effective_visible)
            continue;
        bool eligible = false;
        for (unsigned j = 0; j < n->definition->event_count; ++j) {
            const struct lge_event_page *e = &n->definition->event_pages[j];
            if (e->trigger == LGE_TRIGGER_INTERACT && test(s, e->when, n))
                eligible = true;
        }
        float dx = n->x + n->definition->width * .5f - px,
              dy = n->y + n->definition->height * .5f - py, d = dx * dx + dy * dy;
        if (eligible && d < dist && dx * s->facing_x + dy * s->facing_y >= -8) {
            dist = d;
            best = n;
        }
    }
    if (best)
        (void)lge_story_signal(s, g, LGE_TRIGGER_INTERACT, best, p);
}
void lge_story_step(lge_story_t *s, lge_engine_t *g, float seconds) {
    if (!s || !s->definition || !g || !g->scene || g->paused || !isfinite(seconds) || seconds < 0)
        return;
    uint8_t input = lge_input(g), pressed = (input & (uint8_t)~s->previous) | lge_input_pressed(g);
    s->previous = input;
    if (!lge_story_blocking(s)) {
        if (input & 3) {
            s->facing_x = input & 2 ? 1 : -1;
            s->facing_y = 0;
        } else if (input & 12) {
            s->facing_y = input & 8 ? 1 : -1;
            s->facing_x = 0;
        }
    }
    const lge_action_t *dialog = lge_story_dialogue(s);
    if (dialog) {
        if (!lge_story_revealing(s) && s->page_final && dialog->choice_count && (pressed & 12)) {
            s->choice = (uint8_t)((s->choice + ((pressed & 8) ? 1 : dialog->choice_count - 1)) %
                                  dialog->choice_count);
            ++s->dialogue_revision;
        }
        if (pressed & LGE_INPUT_INTERACT)
            (void)lge_story_choose(s, s->choice);
        else
            reveal_step(s, dialog, seconds);
    } else if ((pressed & LGE_INPUT_INTERACT) && !lge_story_blocking(s))
        interact(s, g);
    for (unsigned i = 0; i < LGE_SCRIPT_SLOTS; ++i) {
        lge_script_runner_t *r = &s->runners[i];
        if (!r->script || r->dialog)
            continue;
        if (track_step(r, g, seconds))
            continue;
        if (r->wait_ms > 0) {
            r->wait_ms -= seconds * 1000;
            if (r->wait_ms > .001f)
                continue;
        }
        unsigned budget = LGE_SCRIPT_BUDGET;
        r->started = true;
        while (r->pc < r->script->count && budget--) {
            const lge_action_t *a = &r->script->actions[r->pc];
            const lge_node_t *owner = r->owner ? &g->nodes[r->owner - 1] : NULL;
            uint16_t key = mapped_key(owner, a->condition.key);
            switch (a->type) {
            case LGE_ACTION_STATE_SET:
            case LGE_ACTION_STATE_ADD:
                if (key < s->definition->field_count)
                    assign(s, key,
                           (a->type == LGE_ACTION_STATE_ADD ? (int64_t)s->values[key] : 0) +
                               a->value);
                ++r->pc;
                break;
            case LGE_ACTION_BRANCH:
                r->pc = next(test(s, &a->condition, owner) ? a->yes : a->no, r->pc);
                break;
            case LGE_ACTION_JUMP:
                r->pc = next(a->yes, r->pc);
                break;
            case LGE_ACTION_SAY:
                if (s->dialog_slot < 0 && !lge_rpg_blocking(s->rpg)) {
                    s->dialog_slot = (int8_t)i;
                    s->choice = 0;
                    r->dialog = true;
                    s->page_offset = 0;
                    s->page_bottom = (uint16_t)dialogue_bottom(g, a->choice_count);
                    int columns = ((int)g->scene->width - 32) / 8,
                        rows = ((int)s->page_bottom + 8 - 112 - a->choice_count * 20) / 18;
                    s->page_columns = (uint8_t)(columns < 4 ? 4 : columns > 60 ? 60 : columns);
                    s->page_rows = (uint8_t)(rows < 1 ? 1 : rows > 6 ? 6 : rows);
                    page(s);
                }
                budget = 0;
                break;
            case LGE_ACTION_WAIT:
                r->wait_ms = (float)a->value;
                ++r->pc;
                budget = 0;
                break;
            case LGE_ACTION_WARP:
                if (!s->warp_scene) {
                    s->warp_scene = a->scene;
                    s->warp_x = a->x;
                    s->warp_y = a->y;
                }
                r->pc = r->script->count;
                break;
            case LGE_ACTION_VISIBLE:
                lge_node_set_visible(target(g, r, a->node), a->value != 0);
                ++r->pc;
                break;
            case LGE_ACTION_EMITTER:
                lge_emitter_set_enabled(target(g, r, a->node), a->value != 0);
                ++r->pc;
                break;
            case LGE_ACTION_VELOCITY:
                (void)lge_body_set_velocity(target(g, r, a->node), a->x, a->y);
                ++r->pc;
                break;
            case LGE_ACTION_MOVE: {
                lge_node_t *n = target(g, r, a->node);
                if (n) {
                    r->tracking = true;
                    r->track_node = (uint16_t)(n - g->nodes + 1);
                    r->from_x = n->x;
                    r->from_y = n->y;
                    r->to_x = a->x;
                    r->to_y = a->y;
                    r->elapsed_ms = 0;
                    r->duration_ms = (float)a->value;
                    (void)track_step(r, g, seconds);
                }
                ++r->pc;
                budget = 0;
                break;
            }
            case LGE_ACTION_CAMERA:
                if (a->yes)
                    g->camera_override = false;
                else {
                    float x = 0, y = 0;
                    (void)lge_camera_position(g, &x, &y);
                    r->tracking = true;
                    r->track_node = 0;
                    r->from_x = x;
                    r->from_y = y;
                    r->to_x = a->x;
                    r->to_y = a->y;
                    r->elapsed_ms = 0;
                    r->duration_ms = (float)a->value;
                    (void)track_step(r, g, seconds);
                }
                ++r->pc;
                budget = 0;
                break;
            case LGE_ACTION_CHECKPOINT: {
                /* Bounded cold-path scratch. Storage owns wear and atomic replacement. */
                if (a->value && s->checkpoint_feedback) {
                    r->checkpoint_pending = true;
                    if (!s->checkpoint_feedback(s->checkpoint_context, LGE_CHECKPOINT_SAVING)) {
                        budget = 0;
                        break;
                    }
                }
                bool ok = false;
#if LGE_CHECKPOINT_BYTES > 0
                /* Single LVGL-owner thread; no 4KiB automatic buffer on a small MCU stack. */
                static uint8_t packet[LGE_CHECKPOINT_BYTES];
                size_t size = lge_session_save_size(s, s->rpg);
                ok = size && size <= sizeof(packet);
                if (a->value)
                    ok = ok && s->storage_write && lge_session_save(s, s->rpg, packet, size) &&
                         s->storage_write(s->storage_context, packet, size);
                else
                    ok = ok && s->storage_read &&
                         s->storage_read(s->storage_context, packet, size) &&
                         lge_session_restore(s, s->rpg, packet, size);
#endif
                r->checkpoint_pending = false;
                if (a->value && s->checkpoint_feedback)
                    (void)s->checkpoint_feedback(s->checkpoint_context,
                        ok ? LGE_CHECKPOINT_SAVED : LGE_CHECKPOINT_FAILED);
                r->pc = next(ok ? a->yes : a->no, r->pc);
                budget = 0;
                break;
            }
            case LGE_ACTION_SOUND:
                (void)lge_audio_play(g, a->cue);
                ++r->pc;
                break;
            case LGE_ACTION_BATTLE:
                if (!s->rpg) {
                    r->pc = next(a->no, r->pc);
                    break;
                }
                if (!r->battle) {
                    if (lge_rpg_blocking(s->rpg) || s->dialog_slot >= 0) {
                        budget = 0;
                        break;
                    }
                    if (!lge_battle_start(s->rpg, a->text)) {
                        r->pc = next(a->no, r->pc);
                        break;
                    }
                    r->battle = true;
                    s->rpg->claimed = true;
                    s->rpg->previous = lge_input(g);
                    budget = 0;
                    break;
                }
                if (s->rpg->phase != LGE_BATTLE_NONE) {
                    budget = 0;
                    break;
                }
                r->battle = false;
                s->rpg->claimed = false;
                r->pc = next(s->rpg->result == LGE_BATTLE_VICTORY   ? a->yes
                             : s->rpg->result == LGE_BATTLE_ESCAPED ? a->escape
                                                                    : a->no,
                             r->pc);
                break;
            case LGE_ACTION_PARTY_REST:
                (void)lge_party_rest(s->rpg);
                ++r->pc;
                break;
            case LGE_ACTION_END:
                r->pc = r->script->count;
                break;
            default:
                r->pc = r->script->count;
                break;
            }
        }
        if (r->pc >= r->script->count && !r->tracking) {
            if (r->script->cinematic) g->camera_override = false;
            r->script = NULL;
        }
    }
    g->simulation_blocked = lge_story_blocking(s);
}
static void write32(uint8_t *p, uint32_t n) {
    for (unsigned i = 0; i < 4; ++i)
        p[i] = (uint8_t)(n >> (i * 8));
}
static uint32_t read32(const uint8_t *p) {
    uint32_t n = 0;
    for (unsigned i = 0; i < 4; ++i)
        n |= (uint32_t)p[i] << (i * 8);
    return n;
}
static uint32_t checksum(const uint8_t *p, size_t n) {
    uint32_t h = 2166136261u;
    for (size_t i = 0; i < n; ++i)
        h = (h ^ p[i]) * 16777619u;
    return h;
}
size_t lge_story_save_size(const lge_story_t *s) {
    size_t size = 16;
    if (!s || !s->definition)
        return 0;
    for (unsigned i = 0; i < s->definition->field_count; ++i)
        if (s->definition->fields[i].persistent)
            size += 4;
    return size;
}
bool lge_story_save(const lge_story_t *s, void *out, size_t size) {
    size_t need = lge_story_save_size(s);
    if (!out || !need || size != need)
        return false;
    uint8_t *p = out;
    write32(p, 0x3153474c);
    write32(p + 4, s->definition->schema);
    write32(p + 8, (uint32_t)((need - 16) / 4));
    size_t offset = 12;
    for (unsigned i = 0; i < s->definition->field_count; ++i)
        if (s->definition->fields[i].persistent) {
            write32(p + offset, (uint32_t)s->values[i]);
            offset += 4;
        }
    write32(p + offset, checksum(p, offset));
    return true;
}
bool lge_story_restore(lge_story_t *s, const void *data, size_t size) {
    size_t need = lge_story_save_size(s);
    if (!data || size != need || !need)
        return false;
    const uint8_t *p = data;
    if (read32(p) != 0x3153474c || read32(p + 4) != s->definition->schema ||
        read32(p + 8) != (need - 16) / 4 || read32(p + need - 4) != checksum(p, need - 4))
        return false;
    /* Validate every value before mutating state, including hostile or damaged packets. */
    size_t offset = 12;
    for (unsigned i = 0; i < s->definition->field_count; ++i)
        if (s->definition->fields[i].persistent) {
            uint32_t bits = read32(p + offset);
            int64_t value = bits <= INT32_MAX ? (int64_t)bits : (int64_t)bits - INT64_C(4294967296);
            if (value < s->definition->fields[i].min || value > s->definition->fields[i].max)
                return false;
            offset += 4;
        }
    offset = 12;
    for (unsigned i = 0; i < s->definition->field_count; ++i) {
        const lge_state_def_t *d = &s->definition->fields[i];
        if (d->persistent) {
            uint32_t bits = read32(p + offset);
            s->values[i] =
                (int32_t)(bits <= INT32_MAX ? (int64_t)bits : (int64_t)bits - INT64_C(4294967296));
            offset += 4;
        } else
            s->values[i] = d->initial;
    }
    return true;
}
