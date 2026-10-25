#ifndef LGE_STORY_H
#define LGE_STORY_H
#include "lge.h"
#ifdef __cplusplus
extern "C" {
#endif
#define LGE_STATE_MAX 512
#define LGE_SCRIPT_SLOTS 8
#define LGE_SCRIPT_BUDGET 32
/* Data is immutable and may live in flash. State uses bounded signed integers. */
typedef struct {
    const char *id;
    int32_t initial, min, max;
    bool persistent;
} lge_state_def_t;
typedef enum { LGE_COMPARE_EQ, LGE_COMPARE_NE, LGE_COMPARE_LT, LGE_COMPARE_GTE } lge_compare_t;
struct lge_state_binding {
    uint16_t from, to;
};
typedef struct {
    uint16_t key;
    lge_compare_t compare;
    int32_t value;
} lge_condition_t;
typedef enum {
    LGE_TRIGGER_START,
    LGE_TRIGGER_INTERACT,
    LGE_TRIGGER_ENTER,
    LGE_TRIGGER_EXIT,
    LGE_TRIGGER_COLLECT,
    LGE_TRIGGER_CLICK,
    LGE_TRIGGER_COMPLETE,
    LGE_TRIGGER_HIT
} lge_trigger_t;
typedef enum {
    LGE_ACTION_STATE_SET,
    LGE_ACTION_STATE_ADD,
    LGE_ACTION_BRANCH,
    LGE_ACTION_JUMP,
    LGE_ACTION_SAY,
    LGE_ACTION_WAIT,
    LGE_ACTION_WARP,
    LGE_ACTION_VISIBLE,
    LGE_ACTION_VELOCITY,
    LGE_ACTION_EMITTER,
    LGE_ACTION_SOUND,
    LGE_ACTION_END,
    LGE_ACTION_BATTLE,
    LGE_ACTION_PARTY_REST,
    LGE_ACTION_MOVE,
    LGE_ACTION_CAMERA,
    LGE_ACTION_CHECKPOINT
} lge_action_type_t;
typedef struct {
    const char *text;
    int16_t target;
} lge_choice_t;
typedef struct {
    lge_action_type_t type;
    lge_condition_t condition;
    int32_t value;
    int16_t escape;
    int16_t yes, no; /* -1 means next instruction. */
    const char *node, *scene, *speaker, *text;
    float x, y;
    const lge_cue_t *cue;
    const lge_choice_t *choices;
    uint8_t choice_count;
    uint8_t text_speed; /* Unicode code points/second; 0 = instant. Export defaults to 30. */
} lge_action_t;
typedef struct {
    const char *id;
    const lge_action_t *actions;
    uint16_t count;
    bool blocking;
    bool cinematic;
    int16_t skip_to; /* -1 = cannot skip; explicit completion beat owns quest changes. */
} lge_script_def_t;
struct lge_event_page {
    lge_trigger_t trigger;
    uint16_t script;
    const lge_condition_t *when;
};
typedef struct {
    const lge_state_def_t *fields;
    uint16_t field_count;
    const lge_script_def_t *scripts;
    uint16_t script_count;
    uint32_t schema;
} lge_story_def_t;
typedef struct {
    const lge_script_def_t *script;
    uint16_t pc, owner, other;
    float wait_ms;
    bool dialog, battle, started, checkpoint_pending;
    bool tracking;
    uint16_t track_node; /* zero = camera, otherwise node index + 1 */
    float from_x, from_y, to_x, to_y, elapsed_ms, duration_ms;
} lge_script_runner_t;
typedef enum {
    LGE_CHECKPOINT_NONE, LGE_CHECKPOINT_SAVING, LGE_CHECKPOINT_SAVED, LGE_CHECKPOINT_FAILED
} lge_checkpoint_status_t;
/* Optional presentation gate. SAVING may return false to yield before IO; the
 * result event occurs only after the synchronous durable storage callback. */
typedef bool (*lge_checkpoint_feedback_t)(void *, lge_checkpoint_status_t);
typedef struct lge_story {
    struct lge_rpg *rpg;
    uint32_t revision;
    const lge_story_def_t *definition;
    int32_t values[LGE_STATE_MAX];
    lge_script_runner_t runners[LGE_SCRIPT_SLOTS];
    int8_t dialog_slot;
    uint8_t choice, previous;
    int8_t facing_x, facing_y;
    const char *warp_scene;
    float warp_x, warp_y;
    uint32_t rejected_starts;
    uint16_t page_offset, page_next, page_bottom;
    uint8_t page_columns, page_rows;
    bool page_final;
    uint16_t page_length, page_visible;
    float reveal_credit;
    uint32_t dialogue_revision;
    char page_text[1025];
    void *storage_context;
    bool (*storage_read)(void *, void *, size_t);
    bool (*storage_write)(void *, const void *, size_t);
    void *checkpoint_context;
    lge_checkpoint_feedback_t checkpoint_feedback;
} lge_story_t;
/* Cancel work tied to a retired pool member before its slot is reused. */
void lge_story_forget_node(lge_story_t *, lge_engine_t *, lge_node_t *);
void lge_story_init(lge_story_t *, const lge_story_def_t *);
void lge_story_enter(lge_story_t *, lge_engine_t *);
bool lge_story_start(lge_story_t *, lge_engine_t *, const char *script, lge_node_t *owner,
                     lge_node_t *other);
bool lge_story_signal(lge_story_t *, lge_engine_t *, lge_trigger_t, lge_node_t *,
                      lge_node_t *other);
void lge_story_step(lge_story_t *, lge_engine_t *, float seconds);
bool lge_story_skip(lge_story_t *, lge_engine_t *);
bool lge_story_blocking(const lge_story_t *);
const lge_action_t *lge_story_dialogue(const lge_story_t *);
bool lge_story_choose(lge_story_t *, unsigned choice);
bool lge_story_revealing(const lge_story_t *);
bool lge_state_get(const lge_story_t *, const char *, int32_t *out);
bool lge_state_set(lge_story_t *, const char *, int32_t);
bool lge_state_add(lge_story_t *, const char *, int32_t);
size_t lge_story_save_size(const lge_story_t *);
bool lge_story_save(const lge_story_t *, void *, size_t);
bool lge_story_restore(lge_story_t *, const void *, size_t);
#ifdef __cplusplus
}
#endif
#endif
