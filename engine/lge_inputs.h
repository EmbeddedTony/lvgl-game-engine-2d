/* Typed physical inputs. No HAL, BLE stack, LVGL, heap or transport ownership. */
#ifndef LGE_INPUTS_H
#define LGE_INPUTS_H
#include "lge_config.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#ifndef LGE_INPUT_MAX_CHANNELS
#define LGE_INPUT_MAX_CHANNELS 32
#endif
#if LGE_INPUT_MAX_CHANNELS < 1 || LGE_INPUT_MAX_CHANNELS > 32
#error "Physical input capacity must be between 1 and 32"
#endif
#ifdef __cplusplus
extern "C" {
#endif
typedef enum { LGE_VALUE_INT, LGE_VALUE_FLOAT, LGE_VALUE_BOOL } lge_value_type_t;
typedef union {
    int32_t integer;
    float real;
    bool boolean;
} lge_input_value_t;
typedef enum {
    LGE_INPUT_BIND_NONE,
    LGE_INPUT_BIND_MOVE_X,
    LGE_INPUT_BIND_MOVE_Y,
    LGE_INPUT_BIND_LEFT,
    LGE_INPUT_BIND_RIGHT,
    LGE_INPUT_BIND_UP,
    LGE_INPUT_BIND_DOWN,
    LGE_INPUT_BIND_ACTION,
    LGE_INPUT_BIND_INTERACT,
    LGE_INPUT_BIND_MENU
} lge_input_binding_t;
typedef enum {
    LGE_WIRE_NONE,
    LGE_WIRE_I8,
    LGE_WIRE_U8,
    LGE_WIRE_I16_LE,
    LGE_WIRE_U16_LE,
    LGE_WIRE_I32_LE,
    LGE_WIRE_F32_LE,
    LGE_WIRE_BIT
} lge_input_encoding_t;
typedef struct {
    const char *id;
    uint8_t source;
    lge_value_type_t type;
    lge_input_binding_t binding;
    float minimum, center, maximum, deadzone;
    float press, release;
    uint16_t smoothing_ms, timeout_ms;
    bool invert;
    lge_input_encoding_t encoding;
    uint8_t offset, bit;
} lge_input_def_t;
typedef struct {
    uint16_t report_id; /* 256 = no prefix; otherwise first report byte. */
} lge_input_source_t;
/* Optional short critical sections for ISR/worker publishers. Both or neither.
 * Default: publication, polling and reads all belong on the owner thread.
 * Context must outlive the bank; never call game/UI code inside these callbacks. */
typedef struct {
    void *context;
    uintptr_t (*enter)(void *);
    void (*leave)(void *, uintptr_t);
} lge_input_lock_t;
typedef struct {
    uint8_t channel;
    lge_value_type_t type;
    lge_input_value_t value;
} lge_input_sample_t;
typedef struct {
    lge_input_value_t pending, value;
    uint32_t received_at;
    float normalized;
    bool changed, pending_active, pulse, active, held;
} lge_input_slot_t;
typedef struct {
    const lge_input_def_t *definitions;
    const lge_input_source_t *sources;
    uint8_t count, source_count;
    lge_input_lock_t lock;
    lge_input_slot_t slots[LGE_INPUT_MAX_CHANNELS];
} lge_inputs_t;
typedef struct {
    uint8_t actions, pressed;
    float x, y;
} lge_input_frame_t;
bool lge_inputs_init(lge_inputs_t *, const lge_input_def_t *, unsigned count,
                     const lge_input_source_t *, unsigned sources, const lge_input_lock_t *);
/* Producer APIs: validate before committing; a batch is one coherent snapshot.
 * Boolean taps are latched even when press+release arrive between owner polls. */
bool lge_inputs_publish(lge_inputs_t *, const lge_input_sample_t *, size_t count);
bool lge_inputs_set_int(lge_inputs_t *, unsigned channel, int32_t);
bool lge_inputs_set_float(lge_inputs_t *, unsigned channel, float);
bool lge_inputs_set_bool(lge_inputs_t *, unsigned channel, bool);
bool lge_inputs_disconnect(lge_inputs_t *, unsigned source);
/* Owner APIs: poll using a monotonic millisecond clock, including while paused.
 * Raw reads are exact typed values; inactive reads return false without writing out.
 * Normalized values use calibration, deadzone and optional smoothing. +Y is up. */
lge_input_frame_t lge_inputs_poll(lge_inputs_t *, uint32_t now_ms, uint32_t elapsed_ms);
bool lge_inputs_read(const lge_inputs_t *, unsigned, lge_value_type_t, lge_input_value_t *);
bool lge_inputs_active(const lge_inputs_t *, unsigned);
float lge_inputs_normalized(const lge_inputs_t *, unsigned);
#ifdef __cplusplus
}
#endif
#endif
