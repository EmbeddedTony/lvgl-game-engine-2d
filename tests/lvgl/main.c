#include "game.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static uint16_t buffer[320*240];
static uint16_t frame[320*240];
static unsigned flushes;
static unsigned button_clicks;
static void on_event(lge_engine_t *game,lge_event_t event,lge_node_t *node,void *user) {
    (void)game;(void)node;if(event==LGE_EVENT_CLICK){++button_clicks;if(user)assert(lge_view_request_scene((lge_view_t *)user,&game_scenes[0]));}
}
static void flush(lv_display_t *display,const lv_area_t *area,uint8_t *pixels) {
    const uint16_t *source=(const uint16_t *)pixels;
    for(int y=area->y1;y<=area->y2;++y) for(int x=area->x1;x<=area->x2;++x)
        frame[y*320+x]=*source++;
    ++flushes;lv_display_flush_ready(display);
}
int main(int argc,char **argv) {
    lv_init();lv_display_t *display=lv_display_create(320,240);
    lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display,buffer,NULL,sizeof(buffer),LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display,flush);
    static lge_view_t view;
    assert(game_create(&view,lv_screen_active(),0,NULL,NULL));
    for(unsigned i=0;i<10;++i){lv_tick_inc(17);lv_timer_handler();}
    assert(flushes>0&&view.engine.total==3);
    if(argc>1){
        FILE *f=fopen(argv[1],"wb");assert(f);fprintf(f,"P6\n320 240\n255\n");
        for(unsigned i=0;i<320*240;++i){uint16_t c=frame[i];unsigned char rgb[3]={(unsigned char)(((c>>11)&31)*255/31),(unsigned char)(((c>>5)&63)*255/63),(unsigned char)((c&31)*255/31)};fwrite(rgb,1,3,f);}fclose(f);
    }
    lge_set_input(&view.engine,LGE_INPUT_UP);
    for(unsigned i=0;i<100;++i){lv_tick_inc(17);lv_timer_handler();}
    assert(view.engine.score>=1);
    float y=lge_find(&view.engine,"player")->y;
    lge_pause(&view.engine,true);lv_tick_inc(100);lv_timer_handler();assert(lge_find(&view.engine,"player")->y==y);
    assert(lge_view_open(&view,&game_scenes[0]));assert(view.engine.score==0&&!view.engine.paused);
    for(unsigned i=0;i<3;++i){lv_tick_inc(17);lv_timer_handler();}
    uint16_t old_pixel=frame[40*320+40];
    lge_tilemap_t raw_map=*game_scenes[0].nodes[0].tilemap;
    uint8_t raw_cells[70];for(unsigned i=0;i<70;++i)raw_cells[i]=(i%3)+1;
    raw_map.runs=NULL;raw_map.run_count=0;raw_map.cells=raw_cells;
    lge_node_def_t raw_nodes[LGE_MAX_NODES];memcpy(raw_nodes,game_scenes[0].nodes,game_scenes[0].count*sizeof(raw_nodes[0]));raw_nodes[0].tilemap=&raw_map;
    lge_scene_def_t raw_scene=game_scenes[0];raw_scene.nodes=raw_nodes;
    assert(lge_view_open(&view,&raw_scene));for(unsigned i=0;i<3;++i){lv_tick_inc(17);lv_timer_handler();}
    assert(frame[40*320+40]!=old_pixel); /* RAW8 fallback actually draws, not just compiles. */
    lge_node_def_t button={.id="button",.name="Button",.kind=LGE_BUTTON,.width=80,.height=28,.visible=true,.text="Test",.color=0x91d8ba};
    lge_scene_def_t ui_scene={.id="ui",.name="UI",.width=320,.height=240,.objective="",.completion="",.nodes=&button,.count=1};
    assert(lge_view_open(&view,&ui_scene));view.engine.on_event=on_event;view.engine.user=&view;
    lv_obj_send_event(view.objects[0],LV_EVENT_CLICKED,NULL);assert(button_clicks==1);assert(view.engine.scene==&ui_scene);
    lge_pause(&view.engine,true);lv_obj_send_event(view.objects[0],LV_EVENT_CLICKED,NULL);assert(button_clicks==1);
    lv_tick_inc(17);lv_timer_handler();assert(view.engine.scene==&game_scenes[0]);
    lge_view_destroy(&view);lge_view_destroy(&view);
    const lge_node_def_t composed_nodes[]={
      {.id="group",.kind=LGE_INSTANCE,.x=10,.y=20,.width=1,.height=1,.visible=true},
      {.id="group/button",.kind=LGE_BUTTON,.parent=1,.x=5,.y=6,.width=80,.height=28,.visible=true,.text="Instance",.color=0x91d8ba,.ui_layer=true},
    };
    const lge_scene_def_t composed_scene={.id="composed",.width=320,.height=240,.nodes=composed_nodes,.count=2,.objective="",.completion=""};
    assert(lge_view_create(&view,lv_screen_active(),&composed_scene,NULL,on_event,NULL));
    assert(!view.objects[0] && view.objects[1]); /* Logical roots allocate no widgets. */
    lv_obj_update_layout(view.root);assert(lv_obj_get_x(view.objects[1])==15 && lv_obj_get_y(view.objects[1])==26);
    assert(lge_node_set_local_position(&view.engine.nodes[0],30,40));lge_view_sync(&view);
    lv_obj_update_layout(view.root);assert(lv_obj_get_x(view.objects[1])==35 && lv_obj_get_y(view.objects[1])==46);
    unsigned before_clicks=button_clicks;lge_node_set_visible(&view.engine.nodes[0],false);lge_view_sync(&view);
    lv_obj_send_event(view.objects[1],LV_EVENT_CLICKED,NULL);assert(button_clicks==before_clicks);
    lge_node_set_visible(&view.engine.nodes[0],true);lge_view_sync(&view);
    lv_obj_send_event(view.objects[1],LV_EVENT_CLICKED,NULL);assert(button_clicks==before_clicks+1);
    lge_view_destroy(&view);
    assert(!ui_is_ready()&&ui_game()==NULL);
    assert(ui_init()&&ui_is_ready());assert(!ui_init());
    assert(strcmp(ui_current_scene(),UI_SCENE_TITLE)==0);
    assert(strcmp(ui_current_sequence(),UI_SEQUENCE_JOURNEY)==0);
    assert(strcmp(ui_current_step(),UI_STEP_TITLE)==0);
    lv_obj_send_event(ui_find_object(UI_NODE_BEGIN_BUTTON),LV_EVENT_CLICKED,NULL);
    lv_obj_send_event(ui_find_object(UI_NODE_BEGIN_BUTTON),LV_EVENT_CLICKED,NULL);
    assert(strcmp(ui_current_scene(),UI_SCENE_TITLE)==0); /* Deferred; widgets survive callbacks. */
    assert(!ui_sequence_next()); /* Duplicate queued transitions do not skip the level. */
    lv_tick_inc(17);lv_timer_handler();
    assert(strcmp(ui_current_scene(),UI_SCENE_GROVE)==0);
    assert(strcmp(ui_current_step(),UI_STEP_GROVE)==0);
    ui_set_paused(true);assert(!ui_sequence_next());ui_set_paused(false);
    /* Accepted completion of the level advances to Results with the same dispatcher. */
    for(unsigned i=0;i<ui_game()->scene->count;++i) {
        lge_node_t *gem=&ui_game()->nodes[i];
        if(gem->definition->collectible) {
            assert(ui_node_set_position(UI_NODE_PLAYER,gem->x,gem->y));
            lv_tick_inc(17);lv_timer_handler();
        }
    }
    lv_tick_inc(17);lv_timer_handler();
    assert(strcmp(ui_current_scene(),UI_SCENE_RESULTS)==0);
    assert(strcmp(ui_current_step(),UI_STEP_RESULTS)==0);
    lv_obj_send_event(ui_find_object(UI_NODE_REPLAY_BUTTON),LV_EVENT_CLICKED,NULL);
    lv_tick_inc(17);lv_timer_handler();assert(strcmp(ui_current_step(),UI_STEP_TITLE)==0);
    assert(ui_sequence_next());ui_sequence_stop();
    lv_tick_inc(17);lv_timer_handler();assert(strcmp(ui_current_scene(),UI_SCENE_TITLE)==0);
    assert(ui_current_sequence()==NULL&&ui_current_step()==NULL);
    assert(!ui_sequence_start("missing")&&!ui_sequence_next());
    assert(ui_sequence_start(UI_SEQUENCE_JOURNEY));lv_tick_inc(17);lv_timer_handler();
    assert(ui_request_scene(UI_SCENE_GROVE));assert(!ui_sequence_next());
    lv_tick_inc(17);lv_timer_handler();assert(ui_current_sequence()==NULL);
    ui_deinit();
    const ui_config_t override={.start_scene=UI_SCENE_GROVE};
    assert(ui_init_with_config(&override));
    assert(ui_find_node(UI_NODE_PLAYER)&&ui_find_object(UI_NODE_TITLE));
    assert(ui_label_set_text(UI_NODE_TITLE,"READY"));
    assert(strcmp(lv_label_get_text(ui_find_object(UI_NODE_TITLE)),"READY")==0);
    assert(!ui_label_set_text(UI_NODE_SCORE,"invalid override"));
    assert(!ui_label_set_text("missing","text"));
    assert(ui_node_set_position(UI_NODE_PLAYER,120,150));
    assert(ui_node_set_visible(UI_NODE_PLAYER,false));
    lv_tick_inc(17);lv_timer_handler();assert(!ui_find_node(UI_NODE_PLAYER)->visible);
    ui_set_paused(true);assert(ui_is_paused());
    assert(!ui_request_scene("missing")&&!ui_request_scene(NULL));
    assert(ui_request_scene(UI_SCENE_GROVE));lv_tick_inc(17);lv_timer_handler();
    assert(!ui_is_paused()&&ui_find_node(UI_NODE_PLAYER)->visible&&ui_find_node(UI_NODE_PLAYER)->x==144);
    assert(ui_audio_play("missing")==0);ui_audio_complete(12345);
    ui_deinit();ui_deinit();assert(!ui_is_ready()&&!ui_find_object(UI_NODE_TITLE));
    /* Render and collide with value 255 using a one-byte cell and compact bits. */
    static const void * const atlas[255]={[254]=&game_image_0};
    static const uint8_t cells[]={0,255}, solid[32]={[31]=64};
    static const lge_tilemap_t large_bank={.tile_size=32,.columns=2,.rows=1,.tile_count=255,.tiles=atlas,.cells=cells,.solid_bits=solid};
    static const lge_node_def_t tile_nodes[]={
        {.id="large_bank",.kind=LGE_TILEMAP,.width=64,.height=32,.visible=true,.tilemap=&large_bank},
        {.id="mover",.kind=LGE_RECT,.width=8,.height=8,.visible=true,.player=true,.speed=600}
    };
    static const lge_scene_def_t tile_scene={.id="tile_255",.width=320,.height=240,.nodes=tile_nodes,.count=2};
    static lge_view_t tile_view;
    assert(lge_view_create(&tile_view,lv_screen_active(),&tile_scene,NULL,NULL,NULL));
    lv_tick_inc(17);lv_timer_handler();assert(frame[5*320+33]!=0);
    lge_view_set_collision_debug(&tile_view,true); lge_set_input(&tile_view.engine,LGE_INPUT_RIGHT);
    for(unsigned i=0;i<7;++i) {lv_tick_inc(17);lv_timer_handler();}
    assert(tile_view.engine.nodes[1].x==24);
    assert(frame[5*320+32]==(uint16_t)(((0x69&0xf8)<<8)|((0xd6&0xfc)<<3)|(0xa4>>3)));
    lge_view_destroy(&tile_view);
    /* Prebaked palette and RGBA art (the export path) stays crisp.
     * Compose subpixel parents first; never round simulation state. */
    static const uint8_t rgba_pixels[]={0,0,255,255, 0,255,0,255, 255,0,0,255, 255,255,255,255};
    static const uint8_t indexed_pixels[66]={
        0,0,255,255, 0,255,0,255, 255,0,0,255, 255,255,255,255,
        [64]=0x01, [65]=0x23
    };
    static const lv_image_dsc_t indexed_image={.header={.magic=LV_IMAGE_HEADER_MAGIC,.cf=LV_COLOR_FORMAT_I4,.w=2,.h=2,.stride=1},.data_size=sizeof(indexed_pixels),.data=indexed_pixels};
    uint8_t enlarged_indexed[96]; memcpy(enlarged_indexed,indexed_pixels,64);
    for(unsigned y0=0;y0<8;++y0) for(unsigned x0=0;x0<4;++x0)
        enlarged_indexed[64+y0*4+x0]=(uint8_t)(y0<4 ? (x0<2 ? 0x00 : 0x11) : (x0<2 ? 0x22 : 0x33));
    lv_image_dsc_t enlarged_image={.header={.magic=LV_IMAGE_HEADER_MAGIC,.cf=LV_COLOR_FORMAT_I4,.w=8,.h=8,.stride=4},.data_size=sizeof(enlarged_indexed),.data=enlarged_indexed};
    uint8_t enlarged_rgba[144];
    for(unsigned y0=0;y0<6;++y0) for(unsigned x0=0;x0<6;++x0)
        memcpy(enlarged_rgba+(y0*6+x0)*4,rgba_pixels+((y0/3)*2+x0/3)*4,4);
    lv_image_dsc_t rgba_image_baked={.header={.magic=LV_IMAGE_HEADER_MAGIC,.cf=LV_COLOR_FORMAT_ARGB8888,.w=6,.h=6,.stride=24},.data_size=sizeof(enlarged_rgba),.data=enlarged_rgba};
    const lge_node_def_t pixel_nodes[]={
        {.id="origin",.kind=LGE_GROUP,.x=10.25f,.y=10.25f,.width=1,.height=1,.visible=true},
        {.id="rgba",.kind=LGE_SPRITE,.parent=1,.x=1.25f,.y=1.25f,.width=6,.height=6,.visible=true,.image=&rgba_image_baked},
        {.id="indexed",.kind=LGE_SPRITE,.x=30.5f,.y=11.5f,.width=8,.height=8,.visible=true,.image=&enlarged_image},
        {.id="negative",.kind=LGE_SPRITE,.x=-0.5f,.y=40,.width=6,.height=6,.visible=true,.image=&rgba_image_baked},
        {.id="indexed_native",.kind=LGE_SPRITE,.x=50,.y=12,.width=2,.height=2,.visible=true,.image=&indexed_image}
    };
    const lge_scene_def_t pixel_scene={.id="pixels",.width=320,.height=240,.nodes=pixel_nodes,.count=5};
    static lge_view_t pixel_view;
    assert(lge_view_create(&pixel_view,lv_screen_active(),&pixel_scene,NULL,NULL,NULL));
    for(unsigned i=0;i<3;++i) {lv_tick_inc(17);lv_timer_handler();}
    const uint16_t expected[]={0xf800,0x07e0,0x001f,0xffff};
    for(unsigned y0=0;y0<6;++y0) for(unsigned x0=0;x0<6;++x0)
        assert(frame[(12+y0)*320+12+x0]==expected[(y0/3)*2+x0/3]);
    for(unsigned y0=0;y0<8;++y0) for(unsigned x0=0;x0<8;++x0) {
        uint16_t actual=frame[(12+y0)*320+31+x0], wanted=frame[(12+y0/4)*320+50+x0/4];
        if(actual!=wanted) fprintf(stderr,"Indexed pixel at %u,%u: got %04x expected %04x\n",x0,y0,actual,wanted);
        assert(actual==wanted);
    }
    assert(frame[40*320]==0xf800 && frame[40*320+1]==0xf800 && frame[40*320+2]==0x07e0);
    assert(pixel_view.engine.nodes[1].x==11.5f && pixel_view.engine.nodes[3].x==-0.5f);
    lge_view_destroy(&pixel_view);
    lv_display_delete(display);lv_deinit();
    printf("LVGL %d.%d.%d: exported C compiled, rendered %u flushes; movement, packed maps, widgets, ui_* API and authored Title/Level/Results sequence, automatic completion, click/loop, duplicate rejection, pause, cancel and branching passed.\n",LVGL_VERSION_MAJOR,LVGL_VERSION_MINOR,LVGL_VERSION_PATCH,flushes);
    return 0;
}
