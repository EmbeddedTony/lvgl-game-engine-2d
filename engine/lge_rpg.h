#ifndef LGE_RPG_H
#define LGE_RPG_H
#include "lge_gameplay.h"
#include "lge_story.h"
#ifdef __cplusplus
extern "C" {
#endif
#define LGE_PARTY_MAX 4
#define LGE_ENEMY_MAX 4
#define LGE_STATUS_MAX 16
#define LGE_RPG_OPTIONS_MAX 8
#define LGE_RPG_LOG_LINES 4
#define LGE_RPG_LOG_BYTES 96
/* Definitions stay in flash; only one optional session context is needed. */
typedef struct {
    uint16_t actor;
    uint8_t level;
} lge_party_member_def_t;
typedef struct {
    const lge_rpg_database_t *database;
    const lge_party_member_def_t *members;
    uint8_t count;
    uint32_t gold, seed, schema;
    bool allow_flee;
} lge_party_def_t;
typedef struct {
    uint16_t actor, hp, mp;
    uint8_t level;
    uint32_t xp;
    uint8_t statuses[LGE_STATUS_MAX];
    uint16_t fresh;
    bool guard;
} lge_party_member_t;
typedef enum {
    LGE_BATTLE_NONE,
    LGE_BATTLE_COMMAND,
    LGE_BATTLE_VICTORY,
    LGE_BATTLE_DEFEAT,
    LGE_BATTLE_ESCAPED
} lge_battle_phase_t;
typedef enum {
    LGE_RPG_ATTACK,
    LGE_RPG_SKILL,
    LGE_RPG_ITEM,
    LGE_RPG_GUARD,
    LGE_RPG_FLEE
} lge_battle_action_t;
typedef enum {
    LGE_RPG_MENU_COMMAND,
    LGE_RPG_MENU_SKILLS,
    LGE_RPG_MENU_ITEMS,
    LGE_RPG_MENU_TARGETS
} lge_rpg_menu_t;
typedef struct lge_rpg {
    const lge_party_def_t *definition;
    lge_story_t *story;
    lge_party_member_t party[LGE_PARTY_MAX], enemies[LGE_ENEMY_MAX];
    uint8_t count, enemy_count, order[8], order_count, cursor, turn;
    uint16_t round;
    uint32_t gold, rng, revision;
    lge_battle_phase_t phase, result;
    bool claimed, menu_open;
    lge_rpg_menu_t menu;
    uint8_t page, selected, previous;
    lge_battle_action_t pending;
    uint16_t resource; /* Database index, never an allocated string. */
    char logs[LGE_RPG_LOG_LINES][LGE_RPG_LOG_BYTES];
    uint8_t log_count;
} lge_rpg_t;
bool lge_rpg_init(lge_rpg_t *, const lge_party_def_t *, lge_story_t *);
const lge_party_member_t *lge_party_member(const lge_rpg_t *,
                                           unsigned index); /* 0..3 allies, 4..7 enemies. */
bool lge_party_add(lge_rpg_t *, const char *actor, unsigned level);
bool lge_party_remove(lge_rpg_t *, unsigned slot);
bool lge_party_rest(lge_rpg_t *);
int32_t lge_inventory_count(const lge_rpg_t *, const char *item);
bool lge_party_use_item(lge_rpg_t *, const char *item, unsigned target);
bool lge_battle_start(lge_rpg_t *, const char *encounter);
bool lge_battle_command(lge_rpg_t *, lge_battle_action_t, const char *resource, unsigned target);
void lge_battle_progress(
    lge_rpg_t *); /* Bounded to 32 automatic activations; yields to next tick. */
bool lge_battle_acknowledge(lge_rpg_t *);
void lge_battle_cancel(lge_rpg_t *);
bool lge_rpg_blocking(const lge_rpg_t *);
uint32_t lge_rpg_random(lge_rpg_t *);
/* Pure bounded menu model; renderer and hardware input use the same commands. */
typedef enum {
    LGE_RPG_OPTION_COMMAND,
    LGE_RPG_OPTION_SKILL,
    LGE_RPG_OPTION_ITEM,
    LGE_RPG_OPTION_TARGET,
    LGE_RPG_OPTION_PAGE,
    LGE_RPG_OPTION_BACK,
    LGE_RPG_OPTION_CLOSE,
    LGE_RPG_OPTION_CONTINUE
} lge_rpg_option_kind_t;
typedef struct {
    char label[64];
    lge_rpg_option_kind_t type;
    lge_battle_action_t action;
    uint16_t resource;
    uint8_t target, page;
} lge_rpg_option_t;
unsigned lge_rpg_options(lge_rpg_t *, lge_rpg_option_t out[LGE_RPG_OPTIONS_MAX]);
bool lge_party_open(lge_rpg_t *);
bool lge_rpg_select(lge_rpg_t *, unsigned option);
void lge_rpg_input(lge_rpg_t *, uint8_t input, uint8_t pressed);
void lge_rpg_summary(const lge_rpg_t *, char *title, size_t, char *party, size_t, char *enemies,
                     size_t, char *log, size_t);
/* Idle-session saves include party, HP/MP/XP/statuses/gold/RNG and story inventory.
 * No pointers, padding, combat stacks or storage drivers are serialized. */
size_t lge_session_save_size(const lge_story_t *, const lge_rpg_t *);
bool lge_session_save(const lge_story_t *, const lge_rpg_t *, void *, size_t);
bool lge_session_restore(lge_story_t *, lge_rpg_t *, const void *, size_t);
#ifdef __cplusplus
}
#endif
#endif
