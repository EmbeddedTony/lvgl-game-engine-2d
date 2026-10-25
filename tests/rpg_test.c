#include "lge_rpg.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static const lge_state_def_t fields[] = {
    {.id = "potions", .initial = 3, .min = 0, .max = 99, .persistent = true}};
static const lge_story_def_t story_def = {.fields = fields, .field_count = 1, .schema = 123};
static const char *const skills[] = {"mend"};
static const lge_rpg_skill_t spells[] = {{.id = "mend",
                                          .name = "Mend",
                                          .healing = true,
                                          .power = 3,
                                          .cost = 1,
                                          .accuracy = 100,
                                          .target = LGE_TARGET_SELF}};
static const lge_rpg_actor_def_t actors[] = {
    {.id = "hero", .name = "Hero", .hp = 10, .attack = 1, .defense = 99, .speed = 1},
    {.id = "healer",
     .name = "Healer",
     .hp = 7,
     .attack = 1,
     .speed = 2,
     .mp = 2,
     .skills = skills,
     .skill_count = 1}};
static const lge_rpg_item_t items[] = {
    {.id = "potion", .name = "Potion", .heal = 4, .stack_key = 1}};
static const lge_rpg_encounter_entry_t entries[] = {
    {.actor = "healer", .weight = 1, .min_level = 1, .max_level = 1}};
static const lge_rpg_encounter_t encounters[] = {
    {.id = "fight", .entries = entries, .count = 1, .enemy_count = 1}};
static const lge_rpg_database_t database = {.actors = actors,
                                            .actor_count = 2,
                                            .skills = spells,
                                            .skill_count = 1,
                                            .items = items,
                                            .item_count = 1,
                                            .encounters = encounters,
                                            .encounter_count = 1};
static const lge_party_member_def_t members[] = {{.actor = 0, .level = 1}};
static const lge_party_def_t party_def = {
    .database = &database, .members = members, .count = 1, .seed = 1, .schema = 456};
int main(void) {
    lge_story_t story;
    lge_story_init(&story, &story_def);
    lge_rpg_t r;
    assert(lge_rpg_init(&r, &party_def, &story));
    assert(!lge_party_use_item(&r, "potion", 0));
    assert(lge_inventory_count(&r, "potion") == 3);
    assert(lge_battle_start(&r, "fight"));
    assert(r.turn == 0 && r.party[0].hp == 9);
    r.enemies[0].hp = 3;
    assert(lge_battle_command(&r, LGE_RPG_GUARD, NULL, 0));
    assert(r.enemies[0].hp == 6 && r.enemies[0].mp == 1);
    assert(!lge_party_remove(&r, 0));
    assert(lge_session_save_size(&story, &r) == 0);
    lge_battle_cancel(&r);
    assert(lge_party_rest(&r));
    r.party[0].hp = 2;
    uint8_t bytes[128];
    size_t n = lge_session_save_size(&story, &r);
    assert(lge_session_save(&story, &r, bytes, n));
    r.party[0].hp = 1;
    assert(lge_session_restore(&story, &r, bytes, n) && r.party[0].hp == 2);
    bytes[n - 1] ^= 1;
    assert(!lge_session_restore(&story, &r, bytes, n) && r.party[0].hp == 2);
    assert(lge_party_use_item(&r, "potion", 0) && r.party[0].hp == 6 &&
           lge_inventory_count(&r, "potion") == 2);
    printf("RPG C99/UBSan: odd-HP healing threshold, guarded turns, inventory consumption and "
           "idle/atomic saves passed. Session: %zu bytes.\n",
           sizeof(r));
    return 0;
}
