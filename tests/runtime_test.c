#include "lge.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

static unsigned events[5], plays, stops, pauses, gain_updates, updates;
static bool reject;
static float last_gain;
static bool play_audio(void *ctx,uint32_t voice,const lge_cue_t *cue,float gain) {
    (void)ctx;(void)voice;assert(cue);++plays;last_gain=gain;return !reject;
}
static void stop_audio(void *ctx,uint32_t voice) {(void)ctx;assert(voice);++stops;}
static void pause_audio(void *ctx,bool p) {(void)ctx;(void)p;++pauses;}
static void gain_audio(void *ctx,uint32_t voice,float gain) {(void)ctx;assert(voice);last_gain=gain;++gain_updates;}
static void event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *u) {(void)g;(void)n;(void)u;++events[e];}
static void update(lge_engine_t *g,float dt,void *u) {(void)g;(void)u;assert(fabsf(dt-1.0f/60)<.0001f);++updates;}
static const lge_cue_t pickup={.id="pickup",.uri="assets/audio/pickup.wav",.sample_rate=22050,.channels=1,.bus=LGE_BUS_SFX,.gain=.8f,.priority=10};
static const lge_node_def_t nodes[]={
    {.id="player",.kind=LGE_SPRITE,.width=8,.height=8,.visible=true,.player=true,.speed=600},
    {.id="gem",.kind=LGE_SPRITE,.x=20,.width=8,.height=8,.visible=true,.collectible=true,.cue=&pickup},
    {.id="wall",.kind=LGE_RECT,.x=40,.width=1,.height=80,.visible=true,.solid=true},
    {.id="button",.kind=LGE_BUTTON,.y=60,.width=20,.height=10,.visible=true,.cue=&pickup},
};
static const lge_scene_def_t scene={.id="test",.width=100,.height=80,.nodes=nodes,.count=4};
int main(void) {
    lge_engine_t g;
    lge_audio_backend_t backend={NULL,play_audio,stop_audio,pause_audio,gain_audio};
    lge_init(&g,&backend,event,NULL);g.on_update=update;
    assert(lge_load(&g,&scene));assert(events[LGE_EVENT_START]==1);
    lge_set_input(&g,LGE_INPUT_RIGHT);lge_update(&g,100);
    assert(fabsf(g.nodes[0].x-32)<.001f); /* 1px wall cannot be tunnelled at 600px/s. */
    assert(g.score==1&&g.complete&&!g.nodes[1].visible);
    assert(events[LGE_EVENT_COLLECT]==1&&events[LGE_EVENT_COMPLETE]==1&&plays==1&&updates==6);
    lge_update(&g,1000);assert(g.nodes[0].x==32&&g.score==1&&updates==12);
    lge_pause(&g,true);unsigned before=updates;lge_set_input(&g,LGE_INPUT_LEFT);lge_update(&g,100);
    assert(updates==before&&g.nodes[0].x==32);assert(!lge_audio_play(&g,&pickup));
    lge_click(&g.nodes[3]);assert(events[LGE_EVENT_CLICK]==0);
    lge_pause(&g,false);assert(g.input==0&&pauses==2);lge_click(&g.nodes[3]);assert(events[LGE_EVENT_CLICK]==1);
    lge_audio_stop_all(&g);assert(stops==2);
    lge_cue_t invalid_gain=pickup;invalid_gain.gain=NAN;
    unsigned plays_before_invalid=plays;
    assert(!lge_audio_play(&g,&invalid_gain)&&plays==plays_before_invalid);
    uint32_t first=lge_audio_play(&g,&pickup);lge_audio_complete(&g,first);
    uint32_t second=lge_audio_play(&g,&pickup);assert(first!=second);
    lge_audio_complete(&g,first);assert(g.voices[0].handle==second);
    lge_audio_set_bus(&g,LGE_BUS_SFX,.5f);lge_audio_set_master(&g,.5f);
    assert(fabsf(last_gain-.2f)<.0001f&&gain_updates>=2);
    lge_audio_stop_all(&g);
    lge_cue_t high=pickup;high.priority=200;
    for(unsigned i=0;i<LGE_MAX_VOICES;++i)assert(lge_audio_play(&g,&high));
    assert(!lge_audio_play(&g,&pickup));unsigned old_stops=stops;
    assert(lge_audio_play(&g,&high));assert(stops==old_stops+1);
    assert(lge_load(&g,&scene));assert(g.score==0&&!g.complete&&g.nodes[1].visible);
    for(unsigned i=0;i<LGE_MAX_VOICES;++i)assert(!g.voices[i].handle);
    reject=true;assert(!lge_audio_play(&g,&pickup));reject=false;
    assert(!lge_load(&g,NULL)&&g.scene==&scene);
    lge_set_input(&g,LGE_INPUT_RIGHT|LGE_INPUT_DOWN);lge_update(&g,16);lge_update(&g,1);
    assert(fabsf(g.nodes[0].x-7.0710678f)<.001f&&fabsf(g.nodes[0].y-7.0710678f)<.001f);
    lge_override_input(&g,true,LGE_INPUT_LEFT);
    lge_set_input(&g,LGE_INPUT_RIGHT);assert(lge_input(&g)==LGE_INPUT_LEFT);
    float controlled_x=g.nodes[0].x;lge_update(&g,17);assert(g.nodes[0].x<controlled_x);
    lge_pause(&g,true);lge_pause(&g,false);assert(g.input_overridden&&lge_input(&g)==LGE_INPUT_LEFT);
    lge_override_input(&g,false,0);assert(!g.input_overridden&&!lge_input(&g)&&!g.pressed_input);
    static const uint16_t runs[]={2,0,1,1,1,0};static const void * const tiles[]={NULL};
    static const lge_tilemap_t map={.tile_size=16,.columns=4,.rows=1,.tile_count=1,.tiles=tiles,.runs=runs,.run_count=3,.solid_mask=1};
    lge_node_def_t tiled_nodes[]={
      {.id="map",.kind=LGE_TILEMAP,.width=64,.height=16,.visible=true,.tilemap=&map},
      {.id="p",.width=8,.height=8,.visible=true,.player=true,.speed=600}
    };
    lge_scene_def_t tiled={.id="tiled",.width=64,.height=32,.nodes=tiled_nodes,.count=2};
    assert(lge_tile_at(&map,2,0)==1&&lge_tile_at(&map,3,0)==0&&lge_tile_at(&map,-1,0)==0);
    assert(lge_load(&g,&tiled));lge_set_input(&g,LGE_INPUT_RIGHT);lge_update(&g,100);assert(g.nodes[1].x==24);
    static const uint8_t raw[]={0,0,1,0};lge_tilemap_t raw_map=map;raw_map.runs=NULL;raw_map.cells=raw;
    tiled_nodes[0].tilemap=&raw_map;assert(lge_load(&g,&tiled));lge_set_input(&g,LGE_INPUT_RIGHT);lge_update(&g,100);assert(g.nodes[1].x==24);
    assert(lge_find(&g,"p")==&g.nodes[1]&&lge_find(&g,"missing")==NULL);
    lge_pause(&g,true);lge_destroy(&g);assert(!g.scene&&!g.paused);
    lge_destroy(&g); /* Repeated teardown is safe. */
    lge_init(&g,&backend,event,NULL);assert(lge_load(&g,&scene));
    uint32_t previous_instance=lge_audio_play(&g,&pickup);lge_destroy(&g);
    lge_init(&g,&backend,event,NULL);assert(lge_load(&g,&scene));
    uint32_t recreated=lge_audio_play(&g,&pickup);assert(recreated!=previous_instance);
    lge_audio_complete(&g,previous_instance);assert(g.voices[0].handle==recreated);lge_destroy(&g);
    printf("Runtime: movement, thin-wall/tile collision, collection, fixed-step, pause/retry, hooks, audio lifecycle and stale tokens passed.\n");
    return 0;
}
