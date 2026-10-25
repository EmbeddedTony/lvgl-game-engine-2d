#include "lge_story.h"
#include <assert.h>
#include <limits.h>
#include <float.h>
#include <stdio.h>
#include <string.h>
static const lge_state_def_t fields[] = {
    {.id = "hp", .initial = 3, .min = 0, .max = 3, .persistent = true},
    {.id = "temporary", .initial = -2, .min = -10, .max = 10}};
static const lge_action_t loop[] = {
    {.type = LGE_ACTION_STATE_ADD, .condition = {.key = 0}, .value = 1},
    {.type = LGE_ACTION_JUMP, .yes = 0}};
static const lge_action_t say[] = {
    {.type = LGE_ACTION_SAY,
     .speaker = "Guide",
     .text = "Hello traveller! A long story with words and a Unicode ending: 你好. This should "
             "wrap safely without cutting a UTF-8 code point."}};
static const lge_script_def_t scripts[] = {
    {.id = "loop", .actions = loop, .count = 2},
    {.id = "say", .actions = say, .count = 1, .blocking = true}};
static const lge_action_t typed[] = {
    {.type=LGE_ACTION_SAY,.speaker="Guide",.text="Aé🙂 é!",.text_speed=30},
    {.type=LGE_ACTION_SAY,.speaker="Guide",.text="Next message.",.text_speed=30}
};
static void test_reveal(lge_story_t *s, lge_engine_t *g) {
    const lge_script_def_t script={.id="typed",.actions=typed,.count=2,.blocking=true};
    const lge_story_def_t definition={.scripts=&script,.script_count=1};
    lge_story_init(s,&definition);lge_story_enter(s,g);
    assert(lge_story_start(s,g,"typed",&g->nodes[0],NULL));
    lge_story_step(s,g,0);assert(lge_story_revealing(s) && s->page_visible==0);
    lge_story_step(s,g,1.0f/60);assert(s->page_visible==0);
    lge_story_step(s,g,1.0f/60);assert(s->page_visible==1);
    lge_story_step(s,g,1.0f/30);assert(s->page_visible==3);
    lge_story_step(s,g,1.0f/30);assert(s->page_visible==7); /* Whole emoji, never partial UTF-8. */
    g->paused=true;lge_story_step(s,g,10);assert(s->page_visible==7);g->paused=false;
    assert(lge_story_choose(s,0));assert(s->page_visible==s->page_length);
    assert(lge_story_dialogue(s)==&typed[0]);
    assert(lge_story_choose(s,0));lge_story_step(s,g,0);
    assert(lge_story_dialogue(s)==&typed[1] && s->page_visible==0);
    lge_story_step(s,g,FLT_MAX);assert(!lge_story_revealing(s));
    assert(lge_story_choose(s,0));lge_story_step(s,g,0);assert(!lge_story_dialogue(s));
}
static const lge_story_def_t def = {
    .fields = fields, .field_count = 2, .scripts = scripts, .script_count = 2, .schema = 123};
int main(void) {
    lge_story_t s;
    lge_story_init(&s, &def);
    int32_t value;
    assert(lge_state_add(&s, "hp", INT32_MAX));
    assert(lge_state_get(&s, "hp", &value) && value == 3);
    assert(lge_state_add(&s, "hp", INT32_MIN));
    assert(lge_state_get(&s, "hp", &value) && value == 0);
    assert(!lge_state_get(&s, "missing", &value));
    uint8_t saved[20], bad[20];
    assert(lge_story_save_size(&s) == 20);
    assert(lge_story_save(&s, saved, sizeof(saved)));
    lge_state_set(&s, "hp", 3);
    lge_state_set(&s, "temporary", 9);
    memcpy(bad, saved, sizeof(saved));
    bad[12] ^= 1;
    assert(!lge_story_restore(&s, bad, sizeof(bad)));
    assert(lge_state_get(&s, "hp", &value) && value == 3);
    assert(!lge_story_restore(&s, saved, 19));
    assert(lge_story_restore(&s, saved, sizeof(saved)));
    assert(s.values[0] == 0 && s.values[1] == -2);
    lge_node_def_t nodes[9];
    for (unsigned i = 0; i < 9; ++i)
        nodes[i] = (lge_node_def_t){
            .id = "actor", .kind = LGE_RECT, .width = 16, .height = 16, .visible = true};
    lge_scene_def_t scene = {.nodes = nodes, .count = 9, .width = 160, .height = 128};
    lge_engine_t g;
    lge_init(&g, NULL, NULL, NULL);
    assert(lge_load(&g, &scene));
    lge_story_enter(&s, &g);
    for (unsigned i = 0; i < 8; ++i)
        assert(lge_story_start(&s, &g, "loop", &g.nodes[i], NULL));
    assert(!lge_story_start(&s, &g, "loop", &g.nodes[8], NULL));
    assert(s.rejected_starts == 1);
    for (unsigned i = 0; i < 100; ++i)
        lge_story_step(&s, &g, LGE_FIXED_SECONDS);
    assert(s.values[0] == 3);
    lge_story_enter(&s, &g);
    assert(lge_story_start(&s, &g, "say", &g.nodes[0], NULL));
    lge_story_step(&s, &g, LGE_FIXED_SECONDS);
    assert(lge_story_dialogue(&s) && g.simulation_blocked);
    unsigned pages = 0;
    char all[1024] = "";
    while (lge_story_dialogue(&s)) {
        assert(strlen(s.page_text) < 1000);
        strcat(all, s.page_text);
        assert(lge_story_choose(&s, 0));
        lge_story_step(&s, &g, LGE_FIXED_SECONDS);
        assert(++pages < 20);
    }
    assert(pages > 1 && strstr(all, "你好"));
    assert(!g.simulation_blocked);
    test_reveal(&s,&g);
    puts("Story C99/UBSan: bounded loops/concurrency, saturating state, atomic checksummed saves, "
         "transient reset, UTF-8 pagination/typewriter, reveal-then-advance and modal release passed.");
    return 0;
}
