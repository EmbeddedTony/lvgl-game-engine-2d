#include "lge_rpg.h"
#include <string.h>
static uint32_t get32(const uint8_t *p) {
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static unsigned get16(const uint8_t *p) {
    return (unsigned)p[0] | (unsigned)p[1] << 8;
}
static void put32(uint8_t *p, uint32_t v) {
    for (unsigned i = 0; i < 4; ++i)
        p[i] = (uint8_t)(v >> (i * 8));
}
static void put16(uint8_t *p, unsigned v) {
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
}
static uint32_t checksum(const uint8_t *p, size_t size) {
    uint32_t h = UINT32_C(2166136261);
    for (size_t i = 0; i < size; ++i)
        h = (h ^ p[i]) * UINT32_C(16777619);
    return h;
}
size_t lge_session_save_size(const lge_story_t *s, const lge_rpg_t *r) {
    if (!r)
        return lge_story_save_size(s);
    if (r->phase != LGE_BATTLE_NONE || r->claimed)
        return 0;
    return 20 + lge_story_save_size(s) + 12 + 28 * r->count;
}
bool lge_session_save(const lge_story_t *s, const lge_rpg_t *r, void *out, size_t size) {
    if (!r)
        return lge_story_save(s, out, size);
    size_t expected = lge_session_save_size(s, r), story = lge_story_save_size(s);
    if (!out || !expected || size != expected)
        return false;
    uint8_t *p = out;
    put32(p, UINT32_C(0x3252474c));
    put32(p + 4, r->definition->schema);
    put32(p + 8, (uint32_t)story);
    put32(p + 12, 12 + 28 * r->count);
    if (!lge_story_save(s, p + 16, story))
        return false;
    uint8_t *q = p + 16 + story;
    put32(q, r->gold);
    put32(q + 4, r->rng);
    put32(q + 8, r->count);
    q += 12;
    for (unsigned i = 0; i < r->count; ++i) {
        const lge_party_member_t *m = &r->party[i];
        put16(q, m->actor);
        put16(q + 2, m->level);
        put16(q + 4, m->hp);
        put16(q + 6, m->mp);
        put32(q + 8, m->xp);
        memcpy(q + 12, m->statuses, 16);
        q += 28;
    }
    put32(p + size - 4, checksum(p, size - 4));
    return true;
}
bool lge_session_restore(lge_story_t *s, lge_rpg_t *r, const void *in, size_t size) {
    if (!r)
        return lge_story_restore(s, in, size);
    if (!in || size < 64 || r->phase != LGE_BATTLE_NONE || r->claimed)
        return false;
    const uint8_t *p = in;
    uint32_t story = get32(p + 8), payload = get32(p + 12);
    if (get32(p) != UINT32_C(0x3252474c) || get32(p + 4) != r->definition->schema || story < 16 ||
        story > size - 20 || payload != size - 20 - story || payload < 40 ||
        get32(p + size - 4) != checksum(p, size - 4))
        return false;
    const uint8_t *q = p + 16 + story;
    uint32_t gold = get32(q), rng = get32(q + 4), count = get32(q + 8);
    if (gold > 1000000 || !rng || !count || count > 4 || payload != 12 + 28 * count)
        return false;
    q += 12;
    lge_party_member_t members[4];
    memset(members, 0, sizeof(members));
    const lge_rpg_database_t *d = r->definition->database;
    for (unsigned i = 0; i < count; ++i, q += 28) {
        lge_party_member_t *m = &members[i];
        m->actor = (uint16_t)get16(q);
        unsigned level = get16(q + 2);
        m->level = (uint8_t)level;
        m->hp = (uint16_t)get16(q + 4);
        m->mp = (uint16_t)get16(q + 6);
        m->xp = get32(q + 8);
        memcpy(m->statuses, q + 12, 16);
        if (m->actor >= d->actor_count || level < 1 || level > 100 || m->xp > 1000000)
            return false;
        lge_rpg_stats_t max;
        lge_rpg_stats(&d->actors[m->actor], level, &max);
        if (m->hp > max.hp || m->mp > max.mp)
            return false;
        for (unsigned j = 0; j < 16; ++j)
            if (m->statuses[j] > (j < d->status_count ? d->statuses[j].turns : 0))
                return false;
    }
    if (!lge_story_restore(s, p + 16, story))
        return false;
    lge_battle_cancel(r);
    memcpy(r->party, members, sizeof(members));
    r->count = (uint8_t)count;
    r->gold = gold;
    r->rng = rng;
    ++r->revision;
    return true;
}
