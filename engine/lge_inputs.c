#include "lge_inputs.h"
#include <math.h>
#include <string.h>
static uintptr_t enter(lge_inputs_t *b) {
    return b->lock.enter ? b->lock.enter(b->lock.context) : 0;
}
static void leave(lge_inputs_t *b, uintptr_t key) {
    if (b->lock.leave)
        b->lock.leave(b->lock.context, key);
}
static uint8_t action(lge_input_binding_t binding) {
    return binding >= LGE_INPUT_BIND_LEFT && binding <= LGE_INPUT_BIND_MENU
               ? (uint8_t)(1u << (binding - LGE_INPUT_BIND_LEFT))
               : 0;
}
static float normalize(const lge_input_def_t *d, lge_input_value_t v) {
    if (d->type == LGE_VALUE_BOOL)
        return v.boolean ? 1 : 0;
    float raw = d->type == LGE_VALUE_INT ? (float)v.integer : v.real;
    float span = raw >= d->center ? d->maximum - d->center : d->center - d->minimum;
    float n = span > 0 ? (raw - d->center) / span : 0;
    n = fmaxf(-1, fminf(1, n));
    float size = fabsf(n);
    n = size <= d->deadzone ? 0 : copysignf((size - d->deadzone) / (1 - d->deadzone), n);
    return d->invert ? -n : n;
}
bool lge_inputs_init(lge_inputs_t *b, const lge_input_def_t *defs, unsigned count,
                     const lge_input_source_t *sources, unsigned source_count,
                     const lge_input_lock_t *lock) {
    if (!b || count > LGE_INPUT_MAX_CHANNELS || source_count > 8 ||
        (count && (!defs || !source_count)) || (source_count && !sources) ||
        (lock && (!!lock->enter != !!lock->leave)))
        return false;
    for (unsigned i = 0; i < source_count; i++)
        if (sources[i].report_id > 256)
            return false;
    for (unsigned i = 0; i < count; i++) {
        const lge_input_def_t *d = defs + i;
        if (!d->id || d->source >= source_count || (unsigned)d->type > LGE_VALUE_BOOL ||
            (unsigned)d->binding > LGE_INPUT_BIND_MENU || !isfinite(d->minimum) ||
            !isfinite(d->center) || !isfinite(d->maximum) || d->minimum >= d->maximum ||
            d->center < d->minimum || d->center > d->maximum || !isfinite(d->deadzone) ||
            d->deadzone < 0 || d->deadzone >= 1 || !isfinite(d->press) || !isfinite(d->release) ||
            d->release < 0 || d->press > 1 || d->release >= d->press ||
            (unsigned)d->encoding > LGE_WIRE_BIT || d->offset > 63 || d->bit > 7)
            return false;
        unsigned width = d->encoding == LGE_WIRE_I32_LE || d->encoding == LGE_WIRE_F32_LE   ? 4
                         : d->encoding == LGE_WIRE_I16_LE || d->encoding == LGE_WIRE_U16_LE ? 2
                                                                                            : 1;
        if (d->offset + width > 64 ||
            (d->type == LGE_VALUE_BOOL &&
             (d->binding == LGE_INPUT_BIND_MOVE_X || d->binding == LGE_INPUT_BIND_MOVE_Y)) ||
            (d->encoding == LGE_WIRE_BIT && d->type != LGE_VALUE_BOOL) ||
            (d->encoding == LGE_WIRE_F32_LE && d->type != LGE_VALUE_FLOAT) ||
            (d->type == LGE_VALUE_BOOL && d->encoding != LGE_WIRE_NONE &&
             d->encoding != LGE_WIRE_BIT))
            return false;
    }
    memset(b, 0, sizeof(*b));
    b->definitions = defs;
    b->count = (uint8_t)count;
    b->sources = sources;
    b->source_count = (uint8_t)source_count;
    if (lock)
        b->lock = *lock;
    return true;
}
bool lge_inputs_publish(lge_inputs_t *b, const lge_input_sample_t *samples, size_t count) {
    if (!b || !samples || !count || count > b->count)
        return false;
    uint32_t seen = 0;
    for (size_t i = 0; i < count; i++) {
        unsigned id = samples[i].channel;
        if (id >= b->count || samples[i].type != b->definitions[id].type ||
            (seen & (UINT32_C(1) << id)) ||
            (samples[i].type == LGE_VALUE_FLOAT && !isfinite(samples[i].value.real)))
            return false;
        seen |= UINT32_C(1) << id;
    }
    uintptr_t key = enter(b);
    for (size_t i = 0; i < count; i++) {
        lge_input_slot_t *s = b->slots + samples[i].channel;
        if (samples[i].type == LGE_VALUE_BOOL && samples[i].value.boolean &&
            (!s->pending_active || !s->pending.boolean))
            s->pulse = true;
        s->pending = samples[i].value;
        s->pending_active = true;
        s->changed = true;
    }
    leave(b, key);
    return true;
}
bool lge_inputs_set_int(lge_inputs_t *b, unsigned id, int32_t v) {
    if (id > 255)
        return false;
    lge_input_sample_t s = {(uint8_t)id, LGE_VALUE_INT, {.integer = v}};
    return lge_inputs_publish(b, &s, 1);
}
bool lge_inputs_set_float(lge_inputs_t *b, unsigned id, float v) {
    if (id > 255)
        return false;
    lge_input_sample_t s = {(uint8_t)id, LGE_VALUE_FLOAT, {.real = v}};
    return lge_inputs_publish(b, &s, 1);
}
bool lge_inputs_set_bool(lge_inputs_t *b, unsigned id, bool v) {
    if (id > 255)
        return false;
    lge_input_sample_t s = {(uint8_t)id, LGE_VALUE_BOOL, {.boolean = v}};
    return lge_inputs_publish(b, &s, 1);
}
bool lge_inputs_disconnect(lge_inputs_t *b, unsigned source) {
    if (!b || source >= b->source_count)
        return false;
    uintptr_t key = enter(b);
    for (unsigned i = 0; i < b->count; i++)
        if (b->definitions[i].source == source) {
            b->slots[i].pending_active = false;
            b->slots[i].changed = true;
            b->slots[i].pulse = false;
        }
    leave(b, key);
    return true;
}
lge_input_frame_t lge_inputs_poll(lge_inputs_t *b, uint32_t now, uint32_t elapsed) {
    lge_input_frame_t frame = {0};
    if (!b)
        return frame;
    /* Only the bounded publication snapshot is copied under the platform lock. */
    typedef struct {
        lge_input_value_t value;
        bool changed, active, pulse;
    } snapshot_t;
    snapshot_t snapshot[LGE_INPUT_MAX_CHANNELS];
    uintptr_t key = enter(b);
    for (unsigned i = 0; i < b->count; i++) {
        lge_input_slot_t *s = b->slots + i;
        snapshot[i] = (snapshot_t){s->pending, s->changed, s->pending_active, s->pulse};
        s->changed = s->pulse = false;
    }
    leave(b, key);
    for (unsigned i = 0; i < b->count; i++) {
        lge_input_slot_t *s = b->slots + i;
        const lge_input_def_t *d = b->definitions + i;
        bool was_active = s->active;
        if (snapshot[i].changed) {
            s->value = snapshot[i].value;
            s->active = snapshot[i].active;
            s->received_at = now;
        }
        if (d->timeout_ms && (uint32_t)(now - s->received_at) >= d->timeout_ms)
            s->active = false;
        float target = s->active ? normalize(d, s->value) : 0;
        float alpha = d->smoothing_ms ? (float)elapsed / ((float)d->smoothing_ms + elapsed) : 1;
        s->normalized =
            s->active && was_active ? s->normalized + alpha * (target - s->normalized) : target;
        bool held = s->active && (d->type == LGE_VALUE_BOOL
                                      ? s->value.boolean
                                      : s->normalized >= (s->held ? d->release : d->press));
        uint8_t bit = action(d->binding);
        if (held)
            frame.actions |= bit;
        if ((held && !s->held) || (s->active && snapshot[i].pulse))
            frame.pressed |= bit;
        s->held = held;
        if (d->binding == LGE_INPUT_BIND_MOVE_X && fabsf(s->normalized) > fabsf(frame.x))
            frame.x = s->normalized;
        if (d->binding == LGE_INPUT_BIND_MOVE_Y && fabsf(s->normalized) > fabsf(frame.y))
            frame.y = s->normalized;
    }
    return frame;
}
bool lge_inputs_active(const lge_inputs_t *b, unsigned id) {
    return b && id < b->count && b->slots[id].active;
}
float lge_inputs_normalized(const lge_inputs_t *b, unsigned id) {
    return lge_inputs_active(b, id) ? b->slots[id].normalized : 0;
}
bool lge_inputs_read(const lge_inputs_t *b, unsigned id, lge_value_type_t type,
                     lge_input_value_t *out) {
    if (!out || !lge_inputs_active(b, id) || b->definitions[id].type != type)
        return false;
    *out = b->slots[id].value;
    return true;
}
