#ifndef LGE_MELEE_H
#define LGE_MELEE_H
#include "lge.h"
#define LGE_MELEE_MAX 8
/* All mutable storage is optional/caller-owned. No allocation during attacks. */
typedef struct lge_melee_def {
    uint16_t reach, width, windup, active, recovery, damage;
    uint8_t mask;
    bool lock_movement;
} lge_melee_def_t;
typedef struct {
    uint16_t node, tick;
    bool swinging;
    uint32_t hits[4];
} lge_melee_actor_t;
typedef struct {
    lge_node_t *attacker, *target;
    uint16_t damage;
} lge_melee_hit_t;
typedef struct lge_melee {
    lge_melee_actor_t actors[LGE_MELEE_MAX];
    uint8_t count;
    lge_melee_hit_t hit;
    bool in_hit;
} lge_melee_t;
void lge_melee_init(lge_engine_t *, lge_melee_t *);
void lge_melee_prepare(lge_engine_t *);
void lge_melee_step(lge_engine_t *);
bool lge_melee_start(lge_node_t *);
bool lge_melee_active(const lge_node_t *);
bool lge_melee_locked(const lge_node_t *);
float lge_melee_time(const lge_node_t *);
const lge_melee_hit_t *lge_melee_hit(const lge_engine_t *);
#endif
