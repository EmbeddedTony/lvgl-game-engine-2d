#ifndef LGE_GAMEPLAY_H
#define LGE_GAMEPLAY_H
#include "lge.h"
#ifdef __cplusplus
extern "C" {
#endif
#define LGE_MAX_PROJECTILES 64
/* Immutable pattern tables live in flash. Angles: degrees clockwise, 0=right. */
typedef enum { LGE_PATTERN_FAN, LGE_PATTERN_RING, LGE_PATTERN_AIMED } lge_pattern_mode_t;
typedef struct lge_pattern {
    const char *id;
    lge_pattern_mode_t mode;
    uint8_t count, radius, mask;
    uint16_t damage;
    uint32_t color;
    float angle, spread, rotation, speed, interval, lifetime;
} lge_pattern_t;
typedef struct lge_projectile {
    float x, y, vx, vy, remaining;
    const lge_pattern_t *pattern;
    uint16_t owner; /* Scene node index, valid until scene exit. */
} lge_projectile_t;
typedef struct lge_projectiles {
    lge_projectile_t slots[LGE_MAX_PROJECTILES];
    uint32_t dropped; /* Saturating count; overflow drops new bullets. */
    uint8_t capacity;
} lge_projectiles_t;
/* Pool is caller-owned, optional, and reset on scene load. Never allocated per shot. */
void lge_projectiles_init(lge_engine_t *, lge_projectiles_t *, uint8_t capacity);
void lge_projectiles_step(lge_engine_t *);
bool lge_emitter_set_enabled(lge_node_t *, bool enabled);
unsigned lge_projectiles_count(const lge_engine_t *);
const lge_projectile_t *lge_projectile_hit(const lge_engine_t *); /* Callback lifetime only. */

typedef enum {
    LGE_STATUS_POISON,
    LGE_STATUS_REGEN,
    LGE_STATUS_STUN,
    LGE_STATUS_ATTACK_UP,
    LGE_STATUS_DEFENSE_UP,
    LGE_STATUS_SLOW
} lge_status_kind_t;
typedef struct {
    const char *id, *name;
    lge_status_kind_t kind;
    uint8_t potency, turns;
} lge_status_def_t;
typedef enum {
    LGE_TARGET_DEFAULT,
    LGE_TARGET_ENEMY,
    LGE_TARGET_ALLY,
    LGE_TARGET_SELF,
    LGE_TARGET_ALL_ENEMIES,
    LGE_TARGET_ALL_ALLIES
} lge_rpg_target_t;
typedef struct {
    const char *id, *name, *description, *icon, *stack;
    const void *image;
    uint32_t price;
    uint16_t heal, mp_heal, stack_key; /* stack_key = story field index+1; 0 application-owned. */
    uint8_t cure;                      /* status index+1. */
    bool revive;
} lge_rpg_item_t;
typedef struct {
    const char *id, *name, *description;
    bool healing;
    uint16_t power, cost;
    uint8_t accuracy, status, status_chance; /* status index+1. */
    lge_rpg_target_t target;
} lge_rpg_skill_t;
typedef struct {
    const char *id, *name, *sprite;
    const void *image;
    uint16_t hp, attack, defense, speed;
    uint8_t hp_growth, attack_growth, defense_growth, speed_growth;
    const char *const *skills;
    uint8_t skill_count;
    uint32_t experience, gold;
    uint16_t mp;
    uint8_t mp_growth;
} lge_rpg_actor_def_t;
typedef struct {
    const char *actor;
    uint8_t weight, min_level, max_level;
} lge_rpg_encounter_entry_t;
typedef struct {
    const char *id, *name;
    const lge_rpg_encounter_entry_t *entries;
    uint8_t count, enemy_count; /* 0 means one enemy for older records. */
} lge_rpg_encounter_t;
typedef struct {
    const lge_rpg_item_t *items;
    uint16_t item_count;
    const lge_rpg_skill_t *skills;
    uint16_t skill_count;
    const lge_rpg_actor_def_t *actors;
    uint16_t actor_count;
    const lge_rpg_encounter_t *encounters;
    uint16_t encounter_count;
    const lge_status_def_t *statuses;
    uint8_t status_count;
} lge_rpg_database_t;
typedef struct {
    uint16_t hp, attack, defense, speed, mp;
} lge_rpg_stats_t;
const lge_rpg_item_t *lge_rpg_item(const lge_rpg_database_t *, const char *id);
const lge_rpg_skill_t *lge_rpg_skill(const lge_rpg_database_t *, const char *id);
const lge_rpg_actor_def_t *lge_rpg_actor(const lge_rpg_database_t *, const char *id);
const lge_rpg_encounter_t *lge_rpg_encounter(const lge_rpg_database_t *, const char *id);
bool lge_rpg_stats(const lge_rpg_actor_def_t *, unsigned level, lge_rpg_stats_t *out);
/* Deterministic integer mechanics; game code owns HP/MP, turns and storage. */
uint16_t lge_rpg_skill_amount(const lge_rpg_skill_t *, uint16_t attack, uint16_t defense,
                              uint32_t roll);
const char *lge_rpg_choose(const lge_rpg_encounter_t *, uint32_t roll, uint32_t level_roll,
                           uint8_t *level);
#ifdef __cplusplus
}
#endif
#endif
