#include "lge_story.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
static uint8_t saved[32];
static bool have_save;
static unsigned writes;
static bool feedback_ready;
static lge_checkpoint_status_t feedback_status;
static bool feedback(void *context, lge_checkpoint_status_t status) {
    (void)context;
    feedback_status=status;
    return status!=LGE_CHECKPOINT_SAVING || feedback_ready;
}
static bool read_save(void *context, void *out, size_t size) {
    (void)context;
    if (!have_save || size > sizeof(saved)) return false;
    memcpy(out, saved, size); return true;
}
static bool write_save(void *context, const void *in, size_t size) {
    (void)context;
    ++writes;
    if (size > sizeof(saved)) return false;
    memcpy(saved, in, size); have_save = true; return true;
}
static const lge_state_def_t fields[] = {{.id="progress",.initial=0,.min=0,.max=10,.persistent=true}};
static const lge_action_t scene_actions[] = {
    {.type=LGE_ACTION_CAMERA,.x=200,.y=180,.value=500},
    {.type=LGE_ACTION_MOVE,.node="player",.x=180,.y=110,.value=1000},
    {.type=LGE_ACTION_STATE_ADD,.condition={.key=0},.value=1},
    {.type=LGE_ACTION_END}
};
static const lge_action_t save_actions[] = {{.type=LGE_ACTION_CHECKPOINT,.value=1,.yes=1,.no=1},{.type=LGE_ACTION_END}};
static const lge_action_t load_actions[] = {{.type=LGE_ACTION_CHECKPOINT,.yes=1,.no=1},{.type=LGE_ACTION_END}};
static const lge_script_def_t scripts[] = {
    {.id="scene",.actions=scene_actions,.count=4,.blocking=true,.cinematic=true,.skip_to=2},
    {.id="save",.actions=save_actions,.count=2,.blocking=true,.skip_to=-1},
    {.id="load",.actions=load_actions,.count=2,.blocking=true,.skip_to=-1}
};
static const lge_story_def_t definition={.fields=fields,.field_count=1,.scripts=scripts,.script_count=3,.schema=42};
static const lge_node_def_t nodes[]={{.id="player",.kind=LGE_SPRITE,.width=32,.height=32,.visible=true,.player=true,.x=24,.y=40}};
static const lge_camera2d_def_t camera={.world_width=640,.world_height=480,.follow=1,.follow_y=true};
static const lge_scene_def_t scene={.id="room",.width=320,.height=240,.nodes=nodes,.count=1,.camera2d=&camera};
int main(void) {
    lge_engine_t game={0}; lge_story_t story;
    lge_init(&game,NULL,NULL,NULL); assert(lge_load(&game,&scene)); lge_story_init(&story,&definition);
    assert(lge_story_start(&story,&game,"scene",NULL,NULL));
    assert(!lge_story_skip(&story,&game));
    assert(!lge_story_start(&story,&game,"scene",&game.nodes[0],NULL));
    for (unsigned i=0;i<120 && lge_story_blocking(&story);++i) lge_story_step(&story,&game,1.0f/60);
    assert(!lge_story_blocking(&story) && !game.camera_override);
    assert(fabsf(game.nodes[0].x-180)<.001f && fabsf(game.nodes[0].y-110)<.001f);
    assert(game.nodes[0].velocity_x==0 && story.values[0]==1);
    assert(lge_story_start(&story,&game,"scene",NULL,NULL));
    lge_story_step(&story,&game,.25f); assert(game.camera_override);
    assert(lge_story_skip(&story,&game)); lge_story_step(&story,&game,1.0f/60);
    assert(story.values[0]==2 && !game.camera_override && !lge_story_blocking(&story));
    story.storage_read=read_save;story.storage_write=write_save;
    assert(lge_story_start(&story,&game,"save",NULL,NULL));
    lge_story_step(&story,&game,1.0f/60);lge_story_step(&story,&game,1.0f/60);assert(have_save);
    assert(lge_state_set(&story,"progress",7));
    assert(lge_story_start(&story,&game,"load",NULL,NULL));
    lge_story_step(&story,&game,1.0f/60);lge_story_step(&story,&game,1.0f/60);assert(story.values[0]==2);
    saved[12]^=1; assert(lge_state_set(&story,"progress",7));
    assert(lge_story_start(&story,&game,"load",NULL,NULL));lge_story_step(&story,&game,1.0f/60);assert(story.values[0]==7);
    lge_story_enter(&story,&game);
    story.checkpoint_feedback=feedback;
    unsigned before=writes;
    assert(lge_story_start(&story,&game,"save",NULL,NULL));
    for(unsigned i=0;i<120;i++) lge_story_step(&story,&game,1.0f/60);
    assert(writes==before && feedback_status==LGE_CHECKPOINT_SAVING);
    feedback_ready=true;
    lge_story_step(&story,&game,1.0f/60);
    assert(writes==before+1 && feedback_status==LGE_CHECKPOINT_SAVED);
    lge_story_step(&story,&game,1.0f/60);
    story.storage_write=NULL;
    assert(lge_story_start(&story,&game,"save",NULL,NULL));
    lge_story_step(&story,&game,1.0f/60);
    assert(feedback_status==LGE_CHECKPOINT_FAILED && writes==before+1);
    lge_story_step(&story,&game,1.0f/60);
    feedback_ready=false;
    assert(lge_story_start(&story,&game,"save",NULL,NULL));
    lge_story_step(&story,&game,1.0f/60);
    assert(feedback_status==LGE_CHECKPOINT_SAVING);
    lge_story_enter(&story,&game);
    assert(feedback_status==LGE_CHECKPOINT_FAILED && writes==before+1);
    lge_destroy(&game);
    puts("Cinematics C99/UBSan: modal staging, camera cleanup, exclusive director, safe completion skip and atomic persistent checkpoint callbacks passed.");
}
