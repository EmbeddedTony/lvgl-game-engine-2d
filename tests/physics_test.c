#include "lge.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

static unsigned enters, exits;
static void event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *user) {
    (void)user;
    if(e==LGE_EVENT_AREA_ENTER || e==LGE_EVENT_AREA_EXIT) {
        assert(n && g->event_other && g->event_other!=n);
        assert(lge_area_contains(n,g->event_other)==(e==LGE_EVENT_AREA_ENTER));
        if(e==LGE_EVENT_AREA_ENTER) ++enters; else ++exits;
    }
}
static void frames(lge_engine_t *g,unsigned count) { for(unsigned i=0;i<count;++i) lge_update(g,100); }
int main(void) {
    lge_engine_t g; lge_init(&g,NULL,event,NULL);
    lge_physics_def_t character={.body=LGE_BODY_CHARACTER,.motion=LGE_MOTION_CODE,.box={5,5,10,10},
        .layer=LGE_LAYER_PLAYER,.mask=LGE_LAYER_WORLD,.velocity_x=1200};
    lge_node_def_t nodes[]={
        {.id="player",.kind=LGE_SPRITE,.y=20,.width=20,.height=20,.visible=true,.physics=&character},
        {.id="wall",.kind=LGE_RECT,.x=40,.width=1,.height=100,.visible=true,.solid=true}
    };
    lge_scene_def_t scene={.id="physics",.width=320,.height=240,.nodes=nodes,.count=2};
    assert(lge_load(&g,&scene)); lge_update(&g,34);
    assert(g.nodes[0].x==25 && g.nodes[0].on_wall && g.nodes[0].velocity_x==0);
    lge_box_t bounds=lge_node_bounds(&g.nodes[0]); assert(bounds.x==30 && bounds.width==10);
    assert(!lge_body_set_velocity(&g.nodes[0],NAN,0) && !lge_body_set_velocity(&g.nodes[0],1201,0));
    assert(!lge_body_set_velocity(&g.nodes[1],20,0));
    character.mask=LGE_LAYER_ENEMY;
    assert(lge_load(&g,&scene)); lge_update(&g,100); assert(fabsf(g.nodes[0].x-120)<.001f);
    character=(lge_physics_def_t){.body=LGE_BODY_CHARACTER,.motion=LGE_MOTION_PLATFORMER,
        .layer=LGE_LAYER_PLAYER,.mask=255,.gravity=600,.jump_speed=200,.world_bounds=true};
    nodes[0].x=20; nodes[0].y=0; nodes[0].width=10; nodes[0].height=10; nodes[0].player=true; nodes[0].speed=80;
    nodes[1].x=0; nodes[1].y=80; nodes[1].width=320; nodes[1].height=1;
    assert(lge_load(&g,&scene)); frames(&g,10);
    assert(g.nodes[0].y==70 && g.nodes[0].on_floor);
    lge_set_input(&g,LGE_INPUT_ACTION); lge_update(&g,17);
    assert(g.nodes[0].y<70 && g.nodes[0].velocity_y<0 && !g.nodes[0].on_floor);
    frames(&g,10); assert(g.nodes[0].y==70 && g.nodes[0].on_floor); /* Held input never auto-rejumps. */
    assert(lge_body_jump(&g.nodes[0],220)); assert(!lge_body_jump(&g.nodes[0],220));
    lge_pause(&g,true); float y=g.nodes[0].y; frames(&g,10); assert(g.nodes[0].y==y);
    lge_pause(&g,false); frames(&g,10); assert(g.nodes[0].y==70);

    /* A 1px area must emit both transitions when crossed within a single tick. */
    character=(lge_physics_def_t){.body=LGE_BODY_CHARACTER,.motion=LGE_MOTION_CODE,.layer=2,.mask=1,.velocity_x=1200};
    static const lge_physics_def_t sensor={.body=LGE_BODY_AREA,.layer=64,.mask=2};
    static const lge_physics_def_t hurt={.body=LGE_BODY_AREA,.layer=16,.mask=2};
    lge_node_def_t sensed[]={
        {.id="actor",.kind=LGE_SPRITE,.width=2,.height=2,.visible=true,.physics=&character},
        {.id="actor_hurt",.kind=LGE_AREA,.width=2,.height=2,.visible=true,.parent=1,.physics=&hurt},
        {.id="gate",.kind=LGE_AREA,.x=25,.width=1,.height=10,.visible=true,.physics=&sensor}
    };
    scene.nodes=sensed; scene.count=3; enters=exits=0;
    assert(lge_load(&g,&scene)); lge_update(&g,34);
    assert(enters==1 && exits==1 && !g.event_other && fabsf(g.nodes[0].x-40)<.001f);
    assert(fabsf(g.nodes[1].x-40)<.001f && !lge_area_contains(&g.nodes[2],&g.nodes[0]));
    assert(lge_node_set_position(&g.nodes[0],25,0));
    assert(lge_body_set_velocity(&g.nodes[0],0,0)); lge_update(&g,17);
    assert(enters==2 && lge_area_contains(&g.nodes[2],&g.nodes[0]));
    lge_node_set_visible(&g.nodes[0],false); lge_update(&g,17);
    assert(exits==2 && !lge_nodes_overlap(&g.nodes[2],&g.nodes[0]));
    lge_node_set_visible(&g.nodes[0],true); lge_update(&g,17); assert(enters==3);
    lge_physics_def_t broken=character; broken.gravity=INFINITY; sensed[0].physics=&broken;
    assert(!lge_load(&g,&scene)); sensed[0].physics=&character;
    assert(lge_load(&g,&scene) && !lge_area_contains(&g.nodes[2],&g.nodes[0]));
    /* Geometry queries must narrow both maps, not just one map's outer bounds. */
    static const uint8_t cells_a[]={1,0}, cells_b[]={0,1};
    static const void *tiles[]={NULL};
    static const lge_tilemap_t map_a={.tile_size=8,.columns=2,.rows=1,.tile_count=1,.tiles=tiles,.cells=cells_a,.solid_mask=1};
    static const lge_tilemap_t map_b={.tile_size=8,.columns=2,.rows=1,.tile_count=1,.tiles=tiles,.cells=cells_b,.solid_mask=1};
    lge_node_def_t maps[]={
        {.id="map_a",.kind=LGE_TILEMAP,.width=16,.height=8,.visible=true,.tilemap=&map_a},
        {.id="map_b",.kind=LGE_TILEMAP,.width=16,.height=8,.visible=true,.tilemap=&map_b}
    };
    scene.nodes=maps; scene.count=2; assert(lge_load(&g,&scene));
    assert(!lge_nodes_overlap(&g.nodes[0],&g.nodes[1]) && !lge_nodes_overlap(&g.nodes[1],&g.nodes[0]));
    assert(lge_node_set_position(&g.nodes[1],-8,0));
    assert(lge_nodes_overlap(&g.nodes[0],&g.nodes[1]) && lge_nodes_overlap(&g.nodes[1],&g.nodes[0]));

    /* Grid input finishes a released tap at an exact tile; sweeping still blocks walls. */
    character=(lge_physics_def_t){.body=LGE_BODY_CHARACTER,.motion=LGE_MOTION_GRID,.layer=2,.mask=1,.grid_size=16,.world_bounds=true};
    lge_physics_def_t platform={.body=LGE_BODY_STATIC,.layer=1,.one_way=false};
    lge_node_def_t grid[]={
        {.id="hero",.kind=LGE_RECT,.x=32,.y=64,.width=16,.height=16,.visible=true,.player=true,.speed=72,.physics=&character},
        {.id="wall",.kind=LGE_RECT,.x=64,.y=64,.width=16,.height=16,.visible=true,.physics=&platform}
    };
    scene.nodes=grid;scene.count=2;assert(lge_load(&g,&scene));lge_set_input(&g,LGE_INPUT_RIGHT);lge_update(&g,17);lge_set_input(&g,0);frames(&g,5);assert(fabsf(g.nodes[0].x-48)<.001f);
    lge_set_input(&g,LGE_INPUT_RIGHT);frames(&g,5);assert(fabsf(g.nodes[0].x-48)<.001f);
    /* Rising through a one-way surface, then landing on its top. */
    character.motion=LGE_MOTION_CODE;character.velocity_y=-240;character.gravity=600;
    grid[0].y=104;grid[1].x=16;grid[1].y=96;grid[1].width=100;grid[1].height=4;platform.one_way=true;
    assert(lge_load(&g,&scene));float highest=104;for(unsigned i=0;i<90;++i){lge_update(&g,17);highest=fminf(highest,g.nodes[0].y);}assert(highest<80 && fabsf(g.nodes[0].y-80)<.01f && g.nodes[0].on_floor);
    /* Coyote grace and a buffered jump are controller policy, independent of draw FPS. */
    character.motion=LGE_MOTION_PLATFORMER;character.velocity_y=0;character.jump_speed=240;character.coyote_ms=100;character.buffer_ms=100;
    assert(lge_load(&g,&scene));g.nodes[0].on_floor=true;lge_update(&g,17);g.nodes[0].on_floor=false;lge_set_input(&g,LGE_INPUT_ACTION);lge_update(&g,17);assert(g.nodes[0].velocity_y<0);
    lge_destroy(&g);
    printf("Physics C99: custom bounds, swept walls, masks, gravity, jump edges, floor state, narrow sensors, grid taps, one-way platforms, jump grace, hierarchy, pause and scene reset passed. Engine storage: %zu bytes on host.\n",sizeof(g));
    return 0;
}
