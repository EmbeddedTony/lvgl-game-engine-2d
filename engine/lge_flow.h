#ifndef LGE_FLOW_H
#define LGE_FLOW_H
#include <stdbool.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Immutable generated data. One scene is instantiated at a time. */
typedef enum { LGE_FLOW_MANUAL, LGE_FLOW_COMPLETE, LGE_FLOW_CLICK } lge_flow_trigger_t;
typedef struct {
    const char *id;
    uint16_t scene;
    lge_flow_trigger_t advance;
    const char *button;
} lge_flow_step_t;
typedef struct {
    const char *id;
    const lge_flow_step_t *steps;
    uint16_t count;
    bool loop;
    int16_t end_scene; /* -1 holds the last scene when finished. */
} lge_flow_sequence_t;
typedef struct {
    const lge_flow_sequence_t *sequence, *pending_sequence;
    uint16_t step, pending_step;
    int32_t pending_scene;
    bool pending;
} lge_flow_t;
void lge_flow_init(lge_flow_t *);
bool lge_flow_start(lge_flow_t *, const lge_flow_sequence_t *);
bool lge_flow_go(lge_flow_t *, uint16_t scene);
bool lge_flow_next(lge_flow_t *);
bool lge_flow_signal(lge_flow_t *, lge_flow_trigger_t, const char *button);
/* Commit only after a queued scene begins opening, before its START hook. */
void lge_flow_commit(lge_flow_t *);
void lge_flow_stop(lge_flow_t *);
#ifdef __cplusplus
}
#endif
#endif
