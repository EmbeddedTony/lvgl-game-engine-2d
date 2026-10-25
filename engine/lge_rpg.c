#include "lge_rpg.h"
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
static unsigned minimum(unsigned a, unsigned b) {
    return a < b ? a : b;
}
static unsigned maximum(unsigned a, unsigned b) {
    return a > b ? a : b;
}
static bool active(const lge_rpg_t *r) {
    return r && r->phase != LGE_BATTLE_NONE;
}
static const lge_rpg_database_t *db(const lge_rpg_t *r) {
    return r->definition->database;
}
static lge_party_member_t *fighter(lge_rpg_t *r, unsigned i) {
    return i < 4 ? (i < r->count ? &r->party[i] : NULL)
                 : (i - 4 < r->enemy_count ? &r->enemies[i - 4] : NULL);
}
const lge_party_member_t *lge_party_member(const lge_rpg_t *r, unsigned i) {
    return r ? fighter((lge_rpg_t *)r, i) : NULL;
}
static const lge_rpg_actor_def_t *actor(const lge_rpg_t *r, const lge_party_member_t *m) {
    return &db(r)->actors[m->actor];
}
static lge_rpg_stats_t stats(const lge_rpg_t *r, const lge_party_member_t *m) {
    lge_rpg_stats_t s = {0};
    lge_rpg_stats(actor(r, m), m->level, &s);
    return s;
}
static uint32_t experience(unsigned level) {
    return 10u * level * (level - 1);
}
static void message(lge_rpg_t *r, const char *format, ...) {
    if (r->log_count == LGE_RPG_LOG_LINES) {
        memmove(r->logs[0], r->logs[1], (LGE_RPG_LOG_LINES - 1) * LGE_RPG_LOG_BYTES);
        --r->log_count;
    }
    va_list args;
    va_start(args, format);
    vsnprintf(r->logs[r->log_count++], LGE_RPG_LOG_BYTES, format, args);
    va_end(args);
    ++r->revision;
}
static void initialize_member(const lge_rpg_t *r, lge_party_member_t *m, unsigned index,
                              unsigned level) {
    memset(m, 0, sizeof(*m));
    m->actor = (uint16_t)index;
    m->level = (uint8_t)level;
    m->xp = experience(level);
    lge_rpg_stats_t s = stats(r, m);
    m->hp = s.hp;
    m->mp = s.mp;
}
bool lge_rpg_init(lge_rpg_t *r, const lge_party_def_t *d, lge_story_t *story) {
    if (!r || !d || !story || !d->database || !story->definition || !d->members || !d->count ||
        d->count > 4 || !d->seed || d->gold > 1000000)
        return false;
    const lge_rpg_database_t *data = d->database;
    if ((data->item_count && !data->items) || (data->skill_count && !data->skills) ||
        (data->encounter_count && !data->encounters) || !data->actors || !data->actor_count ||
        data->actor_count > 128 || data->skill_count > 128 || data->item_count > 128 ||
        data->encounter_count > 128 || data->status_count > 16 ||
        (data->status_count && !data->statuses))
        return false;
    for (unsigned i = 0; i < d->count; ++i)
        if (d->members[i].actor >= data->actor_count || !d->members[i].level ||
            d->members[i].level > 100)
            return false;
    for (unsigned i = 0; i < data->status_count; ++i)
        if (!data->statuses[i].id || !data->statuses[i].name ||
            (unsigned)data->statuses[i].kind > LGE_STATUS_SLOW || data->statuses[i].potency > 100 ||
            !data->statuses[i].turns || data->statuses[i].turns > 9)
            return false;
    for (unsigned i = 0; i < data->item_count; ++i)
        if (data->items[i].stack_key > story->definition->field_count ||
            data->items[i].cure > data->status_count ||
            (data->items[i].revive && !data->items[i].heal))
            return false;
    for (unsigned i = 0; i < data->skill_count; ++i)
        if (data->skills[i].status > data->status_count || data->skills[i].status_chance > 100 ||
            (unsigned)data->skills[i].target > LGE_TARGET_ALL_ALLIES)
            return false;
    memset(r, 0, sizeof(*r));
    r->definition = d;
    r->story = story;
    r->count = d->count;
    r->gold = d->gold;
    r->rng = d->seed;
    for (unsigned i = 0; i < r->count; ++i)
        initialize_member(r, &r->party[i], d->members[i].actor, d->members[i].level);
    story->rpg = r;
    return true;
}
uint32_t lge_rpg_random(lge_rpg_t *r) {
    uint32_t x = r->rng;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return r->rng = x;
}
bool lge_rpg_blocking(const lge_rpg_t *r) {
    return r && (active(r) || r->menu_open || r->claimed);
}
static unsigned effective(const lge_rpg_t *r, const lge_party_member_t *m, unsigned key) {
    lge_rpg_stats_t s = stats(r, m);
    unsigned v = key == 0 ? s.attack : key == 1 ? s.defense : s.speed;
    for (unsigned i = 0; i < db(r)->status_count; ++i)
        if (m->statuses[i]) {
            const lge_status_def_t *d = &db(r)->statuses[i];
            if ((key == 0 && d->kind == LGE_STATUS_ATTACK_UP) ||
                (key == 1 && d->kind == LGE_STATUS_DEFENSE_UP))
                v = minimum(9999, v + v * d->potency / 100);
            if (key == 2 && d->kind == LGE_STATUS_SLOW)
                v = v * (100 - d->potency) / 100;
        }
    return v;
}
static bool finish(lge_rpg_t *r) {
    unsigned alive = 0, enemies = 0;
    for (unsigned i = 0; i < r->count; ++i)
        alive += r->party[i].hp > 0;
    for (unsigned i = 0; i < r->enemy_count; ++i)
        enemies += r->enemies[i].hp > 0;
    if (!alive) {
        r->phase = r->result = LGE_BATTLE_DEFEAT;
        message(r, "The party was defeated.");
        return true;
    }
    if (enemies)
        return false;
    r->phase = r->result = LGE_BATTLE_VICTORY;
    uint32_t xp = 0, gold = 0;
    for (unsigned i = 0; i < r->enemy_count; ++i) {
        xp += actor(r, &r->enemies[i])->experience;
        gold += actor(r, &r->enemies[i])->gold;
    }
    unsigned share = xp / alive;
    for (unsigned i = 0; i < r->count; ++i)
        if (r->party[i].hp) {
            lge_party_member_t *m = &r->party[i];
            lge_rpg_stats_t before = stats(r, m);
            m->xp = minimum(1000000, m->xp + share);
            while (m->level < 100 && m->xp >= experience(m->level + 1))
                ++m->level;
            lge_rpg_stats_t after = stats(r, m);
            m->hp = (uint16_t)minimum(after.hp, m->hp + after.hp - before.hp);
            m->mp = (uint16_t)minimum(after.mp, m->mp + after.mp - before.mp);
        }
    r->gold = minimum(1000000, r->gold + gold);
    message(r, "Victory! %u XP each / %u gold.", share, (unsigned)gold);
    return true;
}
static void end_turn(lge_rpg_t *r, lge_party_member_t *m) {
    for (unsigned i = 0; i < db(r)->status_count; ++i)
        if (m->statuses[i] && !(m->fresh & (1u << i))) {
            const lge_status_def_t *d = &db(r)->statuses[i];
            unsigned amount = d->potency ? maximum(1, stats(r, m).hp * d->potency / 100) : 0;
            if (m->hp && d->kind == LGE_STATUS_POISON) {
                m->hp = (uint16_t)(m->hp > amount ? m->hp - amount : 0);
                message(r, "%s takes %u poison.", actor(r, m)->name, amount);
            }
            if (m->hp && d->kind == LGE_STATUS_REGEN)
                m->hp = (uint16_t)minimum(stats(r, m).hp, m->hp + amount);
            --m->statuses[i];
        }
    m->fresh = 0;
    ++r->revision;
}
static void next_round(lge_rpg_t *r) {
    if (r->round < 65535)
        ++r->round;
    r->order_count = 0;
    r->cursor = 0;
    for (unsigned i = 0; i < 8; ++i) {
        lge_party_member_t *m = fighter(r, i);
        if (!m || !m->hp)
            continue;
        unsigned pos = r->order_count;
        while (pos > 0 && effective(r, m, 2) > effective(r, fighter(r, r->order[pos - 1]), 2)) {
            r->order[pos] = r->order[pos - 1];
            --pos;
        }
        r->order[pos] = (uint8_t)i;
        ++r->order_count;
    }
}
static bool target_valid(lge_rpg_t *r, unsigned from, unsigned target, bool allied, bool dead) {
    lge_party_member_t *m = fighter(r, target);
    return m && (((from < 4) == (target < 4)) == allied) && (dead ? m->hp == 0 : m->hp > 0);
}
static int32_t inventory(const lge_rpg_t *r, const lge_rpg_item_t *item) {
    return item && item->stack_key && item->stack_key <= r->story->definition->field_count
               ? r->story->values[item->stack_key - 1] > 0 ? r->story->values[item->stack_key - 1]
                                                           : 0
               : 0;
}
int32_t lge_inventory_count(const lge_rpg_t *r, const char *id) {
    return r ? inventory(r, lge_rpg_item(db(r), id)) : 0;
}
static bool item_effect(lge_rpg_t *r, const lge_rpg_item_t *item, unsigned target) {
    if (!item || target >= r->count || inventory(r, item) < 1)
        return false;
    lge_party_member_t *m = &r->party[target];
    if (item->revive != (m->hp == 0))
        return false;
    lge_rpg_stats_t max = stats(r, m);
    unsigned hp = minimum(max.hp, m->hp + item->heal), mp = minimum(max.mp, m->mp + item->mp_heal),
             was = item->cure ? m->statuses[item->cure - 1] : 0;
    if (hp == m->hp && mp == m->mp && !was)
        return false;
    m->hp = (uint16_t)hp;
    m->mp = (uint16_t)mp;
    if (item->cure)
        m->statuses[item->cure - 1] = 0;
    const lge_state_def_t *field = &r->story->definition->fields[item->stack_key - 1];
    lge_state_add(r->story, field->id, -1);
    message(r, "%s used %s.", actor(r, m)->name, item->name);
    return true;
}
bool lge_party_use_item(lge_rpg_t *r, const char *id, unsigned target) {
    return r && !active(r) && item_effect(r, lge_rpg_item(db(r), id), target);
}
bool lge_party_rest(lge_rpg_t *r) {
    if (!r || active(r))
        return false;
    for (unsigned i = 0; i < r->count; ++i) {
        lge_party_member_t *m = &r->party[i];
        lge_rpg_stats_t s = stats(r, m);
        m->hp = s.hp;
        m->mp = s.mp;
        memset(m->statuses, 0, sizeof(m->statuses));
        m->guard = false;
        m->fresh = 0;
    }
    message(r, "The party is rested.");
    return true;
}
bool lge_party_add(lge_rpg_t *r, const char *id, unsigned level) {
    if (!r || active(r) || r->count >= 4 || !level || level > 100)
        return false;
    const lge_rpg_actor_def_t *a = lge_rpg_actor(db(r), id);
    if (!a)
        return false;
    initialize_member(r, &r->party[r->count++], (unsigned)(a - db(r)->actors), level);
    ++r->revision;
    return true;
}
bool lge_party_remove(lge_rpg_t *r, unsigned slot) {
    if (!r || active(r) || r->count <= 1 || slot >= r->count)
        return false;
    memmove(&r->party[slot], &r->party[slot + 1], (r->count - slot - 1) * sizeof(r->party[0]));
    --r->count;
    ++r->revision;
    return true;
}
static lge_rpg_target_t mode(const lge_rpg_skill_t *s) {
    return s->target ? s->target : s->healing ? LGE_TARGET_ALLY : LGE_TARGET_ENEMY;
}
static bool apply(lge_rpg_t *r, unsigned source, lge_battle_action_t action, const char *resource,
                  unsigned target) {
    lge_party_member_t *m = fighter(r, source);
    if (!m || !m->hp)
        return false;
    if (action == LGE_RPG_GUARD) {
        m->guard = true;
        message(r, "%s guards.", actor(r, m)->name);
        return true;
    }
    if (action == LGE_RPG_ITEM)
        return source < 4 && item_effect(r, lge_rpg_item(db(r), resource), target);
    if (action == LGE_RPG_FLEE) {
        if (source >= 4 || !r->definition->allow_flee)
            return false;
        unsigned speed = 0;
        for (unsigned i = 0; i < r->enemy_count; ++i)
            speed = maximum(speed, effective(r, &r->enemies[i], 2));
        int chance = 50 + (int)effective(r, m, 2) - (int)speed;
        if (chance < 25)
            chance = 25;
        if (chance > 90)
            chance = 90;
        if (lge_rpg_random(r) % 100 < (unsigned)chance) {
            r->phase = r->result = LGE_BATTLE_ESCAPED;
            message(r, "The party escaped.");
        } else
            message(r, "Could not escape.");
        return true;
    }
    const lge_rpg_skill_t *skill = action == LGE_RPG_SKILL ? lge_rpg_skill(db(r), resource) : NULL;
    if (action == LGE_RPG_SKILL) {
        if (!skill || m->mp < skill->cost)
            return false;
        bool known = false;
        for (unsigned i = 0; i < actor(r, m)->skill_count; ++i)
            if (strcmp(actor(r, m)->skills[i], resource) == 0)
                known = true;
        if (!known)
            return false;
    } else if (action != LGE_RPG_ATTACK)
        return false;
    uint8_t targets[8];
    unsigned count = 0;
    if (skill) {
        lge_rpg_target_t t = mode(skill);
        bool ally = t == LGE_TARGET_ALLY || t == LGE_TARGET_ALL_ALLIES;
        if (t == LGE_TARGET_SELF)
            targets[count++] = (uint8_t)source;
        else if (t == LGE_TARGET_ALL_ENEMIES || t == LGE_TARGET_ALL_ALLIES) {
            for (unsigned i = 0; i < 8; ++i)
                if (target_valid(r, source, i, ally, false))
                    targets[count++] = (uint8_t)i;
        } else if (target_valid(r, source, target, ally, false))
            targets[count++] = (uint8_t)target;
    } else if (target_valid(r, source, target, false, false))
        targets[count++] = (uint8_t)target;
    if (!count)
        return false;
    if (skill)
        m->mp -= skill->cost;
    for (unsigned i = 0; i < count; ++i) {
        lge_party_member_t *t = fighter(r, targets[i]);
        unsigned attack = effective(r, m, 0), defense = effective(r, t, 1);
        if (lge_rpg_random(r) % 100 >= (skill ? skill->accuracy : 100)) {
            message(r, "%s missed %s.", actor(r, m)->name, actor(r, t)->name);
            continue;
        }
        unsigned amount;
        if (skill) {
            lge_rpg_skill_t accurate = *skill;
            accurate.accuracy = 100;
            amount = lge_rpg_skill_amount(&accurate, (uint16_t)attack, (uint16_t)defense, 0);
        } else {
            int hit = 4 + (int)attack - (int)defense / 2;
            amount = (unsigned)(hit < 1 ? 1 : hit > 9999 ? 9999 : hit);
        }
        if (skill && skill->healing)
            t->hp = (uint16_t)minimum(stats(r, t).hp, t->hp + amount);
        else {
            if (t->guard)
                amount = maximum(1, (amount + 1) / 2);
            t->hp = (uint16_t)(t->hp > amount ? t->hp - amount : 0);
        }
        message(r, "%s %s: %s %s%u HP.", actor(r, m)->name, skill ? skill->name : "attacks",
                actor(r, t)->name, skill && skill->healing ? "+" : "-", amount);
        if (skill && skill->status && t->hp && lge_rpg_random(r) % 100 < skill->status_chance) {
            unsigned si = skill->status - 1;
            t->statuses[si] = db(r)->statuses[si].turns;
            if (targets[i] == source)
                t->fresh |= (uint16_t)(1u << si);
        }
    }
    ++r->revision;
    return true;
}
static int lowest(lge_rpg_t *r, bool ally) {
    int best = -1;
    for (unsigned i = ally ? 0 : 4; i < (ally ? 4 : 8); ++i) {
        lge_party_member_t *m = fighter(r, i);
        if (m && m->hp && (best < 0 || m->hp < fighter(r, (unsigned)best)->hp))
            best = (int)i;
    }
    return best;
}
void lge_battle_progress(lge_rpg_t *r) {
    if (!r || r->phase != LGE_BATTLE_COMMAND)
        return;
    for (unsigned budget = 0; budget < 32; ++budget) {
        if (finish(r))
            return;
        if (r->cursor >= r->order_count)
            next_round(r);
        r->turn = r->order[r->cursor];
        lge_party_member_t *m = fighter(r, r->turn);
        if (!m->hp) {
            ++r->cursor;
            continue;
        }
        m->guard = false;
        bool stun = false;
        for (unsigned i = 0; i < db(r)->status_count; ++i)
            if (db(r)->statuses[i].kind == LGE_STATUS_STUN && m->statuses[i])
                stun = true;
        if (stun) {
            message(r, "%s is stunned.", actor(r, m)->name);
            end_turn(r, m);
            ++r->cursor;
            continue;
        }
        if (r->turn < 4)
            return;
        const lge_rpg_skill_t *skill = NULL;
        for (unsigned i = 0; i < actor(r, m)->skill_count; ++i) {
            const lge_rpg_skill_t *s = lge_rpg_skill(db(r), actor(r, m)->skills[i]);
            if (s && s->cost <= m->mp && (!s->healing || m->hp * 2u < stats(r, m).hp)) {
                skill = s;
                break;
            }
        }
        int target = lowest(r, !(skill && skill->healing));
        if (!apply(r, r->turn, skill ? LGE_RPG_SKILL : LGE_RPG_ATTACK, skill ? skill->id : NULL,
                   (unsigned)target))
            apply(r, r->turn, LGE_RPG_ATTACK, NULL, (unsigned)lowest(r, true));
        end_turn(r, m);
        ++r->cursor;
    }
}
bool lge_battle_start(lge_rpg_t *r, const char *id) {
    if (!r || active(r) || r->claimed)
        return false;
    const lge_rpg_encounter_t *table = lge_rpg_encounter(db(r), id);
    if (!table)
        return false;
    bool alive = false;
    for (unsigned i = 0; i < r->count; ++i)
        alive |= r->party[i].hp > 0;
    if (!alive)
        return false;
    unsigned count = table->enemy_count ? table->enemy_count : 1;
    if (count > 4)
        return false;
    lge_party_member_t enemies[4];
    for (unsigned i = 0; i < count; ++i) {
        uint8_t level;
        uint32_t roll = lge_rpg_random(r), level_roll = lge_rpg_random(r);
        const char *actor_id = lge_rpg_choose(table, roll, level_roll, &level);
        const lge_rpg_actor_def_t *a = lge_rpg_actor(db(r), actor_id);
        if (!a)
            return false;
        initialize_member(r, &enemies[i], (unsigned)(a - db(r)->actors), level);
    }
    memcpy(r->enemies, enemies, count * sizeof(enemies[0]));
    r->enemy_count = (uint8_t)count;
    for (unsigned i = 0; i < r->count; ++i) {
        r->party[i].guard = false;
        r->party[i].fresh = 0;
    }
    r->phase = LGE_BATTLE_COMMAND;
    r->result = LGE_BATTLE_NONE;
    r->round = 0;
    r->log_count = 0;
    r->menu = LGE_RPG_MENU_COMMAND;
    r->menu_open = true;
    r->page = r->selected = r->previous = 0;
    next_round(r);
    message(r, "An encounter begins.");
    lge_battle_progress(r);
    return true;
}
bool lge_battle_command(lge_rpg_t *r, lge_battle_action_t action, const char *resource,
                        unsigned target) {
    if (!r || r->phase != LGE_BATTLE_COMMAND || r->cursor >= r->order_count ||
        r->turn != r->order[r->cursor] || r->turn >= 4 ||
        !apply(r, r->turn, action, resource, target))
        return false;
    if (r->phase == LGE_BATTLE_COMMAND) {
        end_turn(r, fighter(r, r->turn));
        ++r->cursor;
        lge_battle_progress(r);
    }
    r->menu = LGE_RPG_MENU_COMMAND;
    r->page = r->selected = 0;
    ++r->revision;
    return true;
}
bool lge_battle_acknowledge(lge_rpg_t *r) {
    if (!r || r->phase < LGE_BATTLE_VICTORY)
        return false;
    r->phase = LGE_BATTLE_NONE;
    r->menu_open = false;
    r->enemy_count = 0;
    r->menu = LGE_RPG_MENU_COMMAND;
    r->page = r->selected = 0;
    ++r->revision;
    return true;
}
void lge_battle_cancel(lge_rpg_t *r) {
    if (!r)
        return;
    r->phase = r->result = LGE_BATTLE_NONE;
    r->claimed = r->menu_open = false;
    r->enemy_count = 0;
    for (unsigned i = 0; i < r->count; ++i) {
        r->party[i].fresh = 0;
        r->party[i].guard = false;
    }
    ++r->revision;
}
