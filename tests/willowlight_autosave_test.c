/* Run the actual exported campaign VM against the production flash journal.
 * Graphics/HAL are outside this test; the immutable authored scripts are not mocked. */
#include "lge_story.h"
#include "lge_rpg.h"
#include "checkpoint_journal.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

extern const lge_story_def_t game_story;
static uint8_t flash[LGE_JOURNAL_BYTES];
static unsigned programs, erases, saves;
static bool unavailable, failure_shown;
static lge_checkpoint_journal_t journal;
static lge_story_t story;
static lge_engine_t game;
static const lge_node_def_t nodes[] = {
    {.id="player", .kind=LGE_SPRITE, .visible=true, .player=true, .width=32, .height=64},
    {.id="companion", .kind=LGE_SPRITE, .visible=true, .width=32, .height=64}
};
static const lge_scene_def_t scene = {
    .id="test", .width=800, .height=480, .nodes=nodes, .count=2
};
static bool read_io(void *context, uint32_t offset, void *out, size_t size) {
    (void)context;
    assert(offset + size <= sizeof(flash));
    memcpy(out, flash + offset, size);
    return true;
}
static bool program_io(void *context, uint32_t offset, const uint8_t word[16]) {
    (void)context;
    assert(offset % 16 == 0 && offset + 16 <= sizeof(flash));
    if (unavailable) return false;
    for (unsigned i=0; i<16; ++i) {
        assert(flash[offset+i] == 255);
        flash[offset+i] = word[i];
    }
    ++programs;
    return true;
}
static bool erase_io(void *context, unsigned bank) {
    (void)context;
    assert(bank < 2);
    if (unavailable) return false;
    memset(flash + bank * LGE_JOURNAL_SECTOR_BYTES, 255, LGE_JOURNAL_SECTOR_BYTES);
    ++erases;
    return true;
}
static bool read_save(void *context, void *out, size_t size) {
    return lge_checkpoint_read(context, out, size);
}
static bool write_save(void *context, const void *in, size_t size) {
    ++saves;
    return lge_checkpoint_write(context, in, size);
}
static int32_t value(const char *key) {
    int32_t v;
    assert(lge_state_get(&story, key, &v));
    return v;
}
static void set(const char *key, int32_t v) { assert(lge_state_set(&story, key, v)); }
static void reset_session(void) {
    lge_story_init(&story, &game_story);
    story.storage_context = &journal;
    story.storage_read = read_save;
    story.storage_write = write_save;
    lge_story_enter(&story, &game);
}
static void drain(void) {
    for (unsigned i=0; i<20000; ++i) {
        const lge_action_t *dialogue = lge_story_dialogue(&story);
        if (dialogue) {
            if (dialogue->speaker && strcmp(dialogue->speaker, "AUTOSAVE") == 0)
                failure_shown = true;
            assert(lge_story_choose(&story, 0));
        }
        lge_story_step(&story, &game, 1.0f/60);
        if (story.warp_scene || !lge_story_blocking(&story)) return;
    }
    assert(!"campaign did not settle");
}
static void run(const char *id) {
    assert(lge_story_start(&story, &game, id, NULL, NULL));
    drain();
}
static void cold_continue(const char *destination) {
    unsigned before = programs;
    reset_session();
    run("continue");
    assert(story.warp_scene && strcmp(story.warp_scene, destination) == 0);
    assert(programs == before);
    lge_story_enter(&story, &game);
}
int main(void) {
    memset(flash, 255, sizeof(flash));
    journal = (lge_checkpoint_journal_t){NULL, read_io, program_io, erase_io, game_story.schema};
    lge_init(&game, NULL, NULL, NULL);
    assert(lge_load(&game, &scene));
    reset_session();
    assert(lge_session_save_size(&story, NULL) == 492);
    run("arrival_0");
    cold_continue("area_0");
    assert(value("intro_0") == 1 && saves == 1);
    run("arrival_0");
    assert(saves == 1);

    unsigned quests = 0;
    for (unsigned i=0; i<game_story.field_count; ++i) {
        const char *id = game_story.fields[i].id;
        if (strncmp(id, "q_", 2) != 0) continue;
        char script[80];
        assert(snprintf(script, sizeof(script), "quest_%s", id+2) > 0);
        set(id, 2);
        unsigned before = saves;
        run(script);
        assert(saves == before + 1 && value(id) == 3);
        int32_t witnesses = value("witnesses"), tonics = value("tonics");
        run(script);
        assert(saves == before + 1 && value("witnesses") == witnesses);
        unsigned writes = programs;
        run("continue");
        assert(value(id) == 3 && value("tonics") == tonics && programs == writes);
        lge_story_enter(&story, &game);
        ++quests;
    }
    assert(quests == 8);
    for (unsigned ci=0; ci<6; ++ci) {
        char key[80], script[80], destination[32];
        set("chapter", (int32_t)ci);
        snprintf(key, sizeof(key), "seal_%u", ci); set(key, 1);
        snprintf(key, sizeof(key), "knots_%u", ci); set(key, 3);
        snprintf(script, sizeof(script), "resolution_%u", ci);
        unsigned before = saves;
        assert(lge_story_start(&story, &game, script, NULL, NULL));
        lge_story_step(&story, &game, 1.0f/60);
        if (ci < 5) assert(lge_story_skip(&story, &game));
        drain();
        assert(saves == before + 1 && value("chapter") == (int32_t)ci+1);
        if (ci < 5) snprintf(destination, sizeof(destination), "area_%u", ci*4+4);
        else strcpy(destination, "shore");
        assert(story.warp_scene && strcmp(story.warp_scene, destination) == 0);
        cold_continue(destination);
        assert(value("chapter") == (int32_t)ci+1);
    }
    run("epilogue");
    cold_continue("shore");
    assert(value("epilogue_seen") == 1);
    assert(erases == 1); /* Sixteen commits: one rotation, not one erase per save. */
    /* A duplicate manual checkpoint incurs neither program nor erase. */
    uint8_t packet[492];
    assert(lge_session_save(&story, NULL, packet, sizeof(packet)));
    unsigned before = programs;
    assert(lge_checkpoint_write(&journal, packet, sizeof(packet)) && programs == before);
    /* A failed later milestone leaves Continue on the previous committed ending. */
    set("chapter", 0); set("seal_0", 1); set("knots_0", 3);
    unavailable = true;
    run("resolution_0");
    assert(failure_shown && story.warp_scene);
    unavailable = false;
    cold_continue("shore");
    assert(value("chapter") == 6 && value("epilogue_seen") == 1);
    lge_destroy(&game);
    printf("Campaign C99/UBSan: 8 quest rewards, 6 pre-warp chapter saves, skip/cold Continue, epilogue, journal rollover, deduplication and failed-save recovery passed (%u erases).\n", erases);
}
