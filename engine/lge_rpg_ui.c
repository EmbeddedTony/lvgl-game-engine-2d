#include "lge_rpg.h"
#include <stdio.h>
#include <string.h>
static const lge_rpg_database_t *db(const lge_rpg_t *r) {
    return r->definition->database;
}
static const char *name(const lge_rpg_t *r, const lge_party_member_t *m) {
    return db(r)->actors[m->actor].name;
}
static void option(lge_rpg_option_t *o, lge_rpg_option_kind_t type, const char *text) {
    memset(o, 0, sizeof(*o));
    o->type = type;
    snprintf(o->label, sizeof(o->label), "%s", text);
}
unsigned lge_rpg_options(lge_rpg_t *r, lge_rpg_option_t out[8]) {
    if (!r || !r->menu_open || !out)
        return 0;
    unsigned n = 0;
    if (r->phase >= LGE_BATTLE_VICTORY) {
        option(out, LGE_RPG_OPTION_CONTINUE, "Continue");
        return 1;
    }
    if (r->phase == LGE_BATTLE_COMMAND &&
        (r->turn >= 4 || r->cursor >= r->order_count || r->turn != r->order[r->cursor]))
        return 0;
    if (r->menu == LGE_RPG_MENU_COMMAND) {
        const char *labels[] = {"Attack", "Skills", "Items", "Guard", "Escape"};
        for (unsigned i = 0; i < (r->definition->allow_flee ? 5u : 4u); ++i) {
            option(&out[n], LGE_RPG_OPTION_COMMAND, labels[i]);
            out[n++].action = (lge_battle_action_t)i;
        }
        return n;
    }
    if (r->menu == LGE_RPG_MENU_TARGETS) {
        const lge_rpg_skill_t *s = r->pending == LGE_RPG_SKILL && r->resource < db(r)->skill_count
                                       ? &db(r)->skills[r->resource]
                                       : NULL;
        const lge_rpg_item_t *item = r->pending == LGE_RPG_ITEM && r->resource < db(r)->item_count
                                         ? &db(r)->items[r->resource]
                                         : NULL;
        bool allied = item || (s && (s->target == LGE_TARGET_ALLY || (!s->target && s->healing)));
        for (unsigned i = 0; i < (allied ? r->count : r->enemy_count); ++i) {
            const lge_party_member_t *m = allied ? &r->party[i] : &r->enemies[i];
            if (item && item->revive ? m->hp != 0 : m->hp == 0)
                continue;
            option(&out[n], LGE_RPG_OPTION_TARGET, "");
            snprintf(out[n].label, sizeof(out[n].label), "%.18s / %u HP", name(r, m), m->hp);
            out[n++].target = (uint8_t)(i + (allied ? 0 : 4));
        }
        option(&out[n++], LGE_RPG_OPTION_BACK, "Back");
        return n;
    }
    /* Four resources per page; indices stay bounded without a temporary catalog. */
    unsigned total = 0;
    uint16_t indices[128];
    if (r->menu == LGE_RPG_MENU_SKILLS) {
        const lge_party_member_t *m = lge_party_member(r, r->turn);
        if (m) {
            const lge_rpg_actor_def_t *a = &db(r)->actors[m->actor];
            for (unsigned i = 0; i < a->skill_count; ++i) {
                const lge_rpg_skill_t *s = lge_rpg_skill(db(r), a->skills[i]);
                if (s)
                    indices[total++] = (uint16_t)(s - db(r)->skills);
            }
        }
    } else
        for (unsigned i = 0; i < db(r)->item_count; ++i)
            if (lge_inventory_count(r, db(r)->items[i].id) > 0)
                indices[total++] = (uint16_t)i;
    unsigned pages = total ? (total + 3) / 4 : 1;
    if (r->page >= pages)
        r->page = (uint8_t)(pages - 1);
    for (unsigned i = r->page * 4; i < total && i < (r->page + 1u) * 4; ++i) {
        unsigned index = indices[i];
        option(&out[n], r->menu == LGE_RPG_MENU_SKILLS ? LGE_RPG_OPTION_SKILL : LGE_RPG_OPTION_ITEM,
               "");
        out[n].resource = (uint16_t)index;
        if (r->menu == LGE_RPG_MENU_SKILLS)
            snprintf(out[n].label, sizeof(out[n].label), "%.18s / %u MP", db(r)->skills[index].name,
                     db(r)->skills[index].cost);
        else
            snprintf(out[n].label, sizeof(out[n].label), "%.18s x%ld", db(r)->items[index].name,
                     (long)lge_inventory_count(r, db(r)->items[index].id));
        ++n;
    }
    if (r->page) {
        option(&out[n], LGE_RPG_OPTION_PAGE, "Previous");
        out[n++].page = r->page - 1;
    }
    if (r->page + 1u < pages) {
        option(&out[n], LGE_RPG_OPTION_PAGE, "Next");
        out[n++].page = r->page + 1;
    }
    option(&out[n++], r->phase == LGE_BATTLE_NONE ? LGE_RPG_OPTION_CLOSE : LGE_RPG_OPTION_BACK,
           r->phase == LGE_BATTLE_NONE ? "Close" : "Back");
    return n;
}
bool lge_party_open(lge_rpg_t *r) {
    if (!r || r->phase != LGE_BATTLE_NONE || r->claimed || lge_story_blocking(r->story))
        return false;
    r->menu_open = true;
    r->menu = LGE_RPG_MENU_ITEMS;
    r->page = r->selected = 0;
    ++r->revision;
    return true;
}
bool lge_rpg_select(lge_rpg_t *r, unsigned index) {
    lge_rpg_option_t options[8];
    unsigned count = lge_rpg_options(r, options);
    if (index >= count)
        return false;
    lge_rpg_option_t *o = &options[index];
    r->selected = 0;
    ++r->revision;
    switch (o->type) {
    case LGE_RPG_OPTION_CONTINUE:
        return lge_battle_acknowledge(r);
    case LGE_RPG_OPTION_CLOSE:
        r->menu_open = false;
        return true;
    case LGE_RPG_OPTION_PAGE:
        r->page = o->page;
        return true;
    case LGE_RPG_OPTION_BACK:
        r->menu = r->phase == LGE_BATTLE_NONE ? LGE_RPG_MENU_ITEMS : LGE_RPG_MENU_COMMAND;
        r->page = 0;
        return true;
    case LGE_RPG_OPTION_COMMAND:
        if (o->action == LGE_RPG_GUARD || o->action == LGE_RPG_FLEE)
            return lge_battle_command(r, o->action, NULL, 0);
        r->pending = o->action;
        r->resource = UINT16_MAX;
        r->page = 0;
        r->menu = o->action == LGE_RPG_ATTACK  ? LGE_RPG_MENU_TARGETS
                  : o->action == LGE_RPG_SKILL ? LGE_RPG_MENU_SKILLS
                                               : LGE_RPG_MENU_ITEMS;
        return true;
    case LGE_RPG_OPTION_SKILL: {
        r->pending = LGE_RPG_SKILL;
        r->resource = o->resource;
        const lge_rpg_skill_t *s = &db(r)->skills[o->resource];
        if (s->target == LGE_TARGET_SELF || s->target == LGE_TARGET_ALL_ENEMIES ||
            s->target == LGE_TARGET_ALL_ALLIES)
            return lge_battle_command(r, LGE_RPG_SKILL, s->id, r->turn);
        r->menu = LGE_RPG_MENU_TARGETS;
        return true;
    }
    case LGE_RPG_OPTION_ITEM:
        r->pending = LGE_RPG_ITEM;
        r->resource = o->resource;
        r->menu = LGE_RPG_MENU_TARGETS;
        return true;
    case LGE_RPG_OPTION_TARGET: {
        const char *id = r->pending == LGE_RPG_SKILL && r->resource < db(r)->skill_count
                             ? db(r)->skills[r->resource].id
                         : r->pending == LGE_RPG_ITEM && r->resource < db(r)->item_count
                             ? db(r)->items[r->resource].id
                             : NULL;
        bool ok = r->phase != LGE_BATTLE_NONE ? lge_battle_command(r, r->pending, id, o->target)
                                              : lge_party_use_item(r, id, o->target);
        if (!ok) {
            if (r->log_count == 4) {
                memmove(r->logs[0], r->logs[1], 3 * 96);
                --r->log_count;
            }
            snprintf(r->logs[r->log_count++], 96, "No effect, invalid target or insufficient MP.");
        }
        if (r->phase == LGE_BATTLE_NONE) {
            r->menu = LGE_RPG_MENU_ITEMS;
            r->page = 0;
        }
        return ok;
    }
    }
    return false;
}
void lge_rpg_input(lge_rpg_t *r, uint8_t input, uint8_t pulse) {
    if (!r)
        return;
    uint8_t pressed = (uint8_t)((input & ~r->previous) | pulse);
    r->previous = input;
    if (r->phase == LGE_BATTLE_COMMAND)
        lge_battle_progress(r);
    if (pressed & 64) {
        if (!r->menu_open)
            lge_party_open(r);
        else if (r->phase == LGE_BATTLE_NONE)
            r->menu_open = false;
        else if (r->menu != LGE_RPG_MENU_COMMAND) {
            r->menu = LGE_RPG_MENU_COMMAND;
            r->page = r->selected = 0;
        }
        ++r->revision;
    }
    if (!r->menu_open)
        return;
    lge_rpg_option_t options[8];
    unsigned n = lge_rpg_options(r, options);
    if (!n)
        return;
    int delta = pressed & 2 ? 1 : pressed & 1 ? -1 : pressed & 8 ? 2 : pressed & 4 ? -2 : 0;
    if (delta) {
        r->selected = (uint8_t)(((int)r->selected + delta + (int)n * 2) % (int)n);
        ++r->revision;
    }
    if (pressed & 48)
        lge_rpg_select(r, r->selected < n ? r->selected : n - 1);
}
static void roster(const lge_rpg_t *r, const lge_party_member_t *m, unsigned count, char *out,
                   size_t size) {
    size_t at = 0;
    if (!size)
        return;
    out[0] = 0;
    for (unsigned i = 0; i < count && at < size; ++i) {
        int n = snprintf(out + at, size - at, "%s%.8s H%u M%u", i ? "\n" : "", name(r, &m[i]),
                         m[i].hp, m[i].mp);
        if (n < 0 || (size_t)n >= size - at)
            return;
        at += (size_t)n;
        for (unsigned j = 0; j < db(r)->status_count && at < size; ++j)
            if (m[i].statuses[j]) {
                n = snprintf(out + at, size - at, " %.3s", db(r)->statuses[j].name);
                if (n < 0 || (size_t)n >= size - at)
                    return;
                at += (size_t)n;
            }
    }
}
void lge_rpg_summary(const lge_rpg_t *r, char *title, size_t ts, char *party, size_t ps,
                     char *enemies, size_t es, char *log, size_t ls) {
    if (r->phase == LGE_BATTLE_NONE)
        snprintf(title, ts, "Party / %lu gold", (unsigned long)r->gold);
    else if (r->phase == LGE_BATTLE_COMMAND) {
        const lge_party_member_t *m = lge_party_member(r, r->turn);
        snprintf(title, ts, "R%u / %s's turn", r->round, m ? name(r, m) : "Battle");
    } else
        snprintf(title, ts, "%s",
                 r->phase == LGE_BATTLE_VICTORY  ? "Victory"
                 : r->phase == LGE_BATTLE_DEFEAT ? "Defeat"
                                                 : "Escaped");
    roster(r, r->party, r->count, party, ps);
    roster(r, r->enemies, r->enemy_count, enemies, es);
    unsigned n = r->log_count;
    snprintf(log, ls, "%s%s%s", n > 1 ? r->logs[n - 2] : "", n > 1 ? "\n" : "",
             n ? r->logs[n - 1] : "");
}
