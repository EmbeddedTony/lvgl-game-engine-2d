/* Real exported campaign + LVGL: save-before-paint, failure and scene lifetimes. */
#include "ui.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static uint16_t pixels[800*480], buffer[800*40];
static uint8_t saved[492];
static unsigned writes, saving_frames;
static bool fail_write;
static lv_obj_t *label(lv_obj_t *parent, const char *text) {
    if(lv_obj_check_type(parent,&lv_label_class) && strcmp(lv_label_get_text(parent),text)==0)
        return parent;
    for(unsigned i=0;i<lv_obj_get_child_count(parent);++i) {
        lv_obj_t *found=label(lv_obj_get_child(parent,(int)i),text);
        if(found) return found;
    }
    return NULL;
}
static void flush(lv_display_t *display,const lv_area_t *area,uint8_t *data) {
    const uint16_t *source=(const uint16_t *)data;
    for(int y=area->y1;y<=area->y2;++y)
        for(int x=area->x1;x<=area->x2;++x) pixels[y*800+x]=*source++;
    if(lv_display_flush_is_last(display) && ui_checkpoint_status()==LGE_CHECKPOINT_SAVING)
        ++saving_frames;
    lv_display_flush_ready(display);
}
static void tick(void) { lv_tick_inc(17);lv_timer_handler(); }
static void frame(const char *path) {
    FILE *out=fopen(path,"wb");assert(out);
    fputs("P6\n800 480\n255\n",out);
    for(unsigned i=0;i<800*480;++i) {
        unsigned p=pixels[i];
        const unsigned char rgb[3]={(unsigned char)((p>>11)*255/31),
            (unsigned char)(((p>>5)&63)*255/63),(unsigned char)((p&31)*255/31)};
        assert(fwrite(rgb,1,3,out)==3);
    }
    assert(fclose(out)==0);
}
static bool read_save(void *context,void *out,size_t size) {
    (void)context;if(size!=sizeof(saved) || !writes) return false;
    memcpy(out,saved,size);return true;
}
static bool write_save(void *context,const void *data,size_t size) {
    (void)context;
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVING);
    assert(saving_frames>0 && size==sizeof(saved));
    assert(label(lv_screen_active(),"Saving...\nKeep power on"));
    ++writes;
    if(fail_write) return false;
    memcpy(saved,data,size);return true;
}
int main(int argc,char **argv) {
    assert(argc==4);
    lv_init();
    lv_display_t *display=lv_display_create(800,480);
    lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display,buffer,NULL,sizeof(buffer),LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display,flush);
    unsigned event_count=lv_display_get_event_count(display);
    ui_config_t config={.start_scene="area_0",.storage_read=read_save,.storage_write=write_save};
    assert(ui_init_with_config(&config));
    assert(ui_state_set("intro_0",1));
    for(unsigned i=0;i<5;++i) tick();
    assert(ui_script_start("rest_0","rest_lamp"));
    for(unsigned i=0;i<100 && ui_checkpoint_status()!=LGE_CHECKPOINT_SAVING;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVING && writes==0);
    for(unsigned i=0;i<3;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVING && saving_frames>0 && writes==0);
    frame(argv[1]);
    for(unsigned i=0;i<100 && ui_checkpoint_status()!=LGE_CHECKPOINT_SAVED;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVED && writes==1);
    for(unsigned i=0;i<3;++i) tick();
    assert(label(lv_screen_active(),"Saved\nSafe to power off"));
    frame(argv[2]);
    uint8_t previous[sizeof(saved)];memcpy(previous,saved,sizeof(saved));
    assert(ui_state_set("intro_1",1));
    assert(ui_request_scene("area_4"));
    for(unsigned i=0;i<6;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVED);
    assert(label(lv_screen_active(),"Saved\nSafe to power off") && writes==1);
    for(unsigned i=0;i<190;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_NONE && writes==1);
    fail_write=true;saving_frames=0;
    assert(ui_script_start("rest_4","rest_lamp"));
    for(unsigned i=0;i<200 && ui_checkpoint_status()!=LGE_CHECKPOINT_FAILED;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_FAILED && writes==2);
    assert(memcmp(previous,saved,sizeof(saved))==0);
    for(unsigned i=0;i<3;++i) tick();
    assert(label(lv_screen_active(),"Not saved\nTry a rest lamp"));
    assert(!label(lv_screen_active(),"Saved\nSafe to power off"));
    frame(argv[3]);
    ui_deinit();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_NONE);
    assert(lv_display_get_event_count(display)==event_count);
    /* Interrupting a prepared save must never produce a success indication. */
    assert(ui_init_with_config(&config));
    assert(ui_state_set("intro_0",1));
    for(unsigned i=0;i<5;++i) tick();
    assert(ui_script_start("rest_0","rest_lamp"));
    for(unsigned i=0;i<100 && ui_checkpoint_status()!=LGE_CHECKPOINT_SAVING;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_SAVING);
    assert(ui_request_scene("area_4"));
    for(unsigned i=0;i<3;++i) tick();
    assert(ui_checkpoint_status()==LGE_CHECKPOINT_FAILED && writes==2);
    ui_deinit();
    assert(lv_display_get_event_count(display)==event_count);
    lv_display_delete(display);
    puts("Real LVGL checkpoint feedback: Saving painted before IO; verified success only, scene continuity, expiry, failed/cancelled saves and listener cleanup passed.");
}
