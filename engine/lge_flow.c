#include "lge_flow.h"
#include <string.h>
void lge_flow_init(lge_flow_t *f) { memset(f,0,sizeof(*f)); }
static bool queue(lge_flow_t *f,const lge_flow_sequence_t *s,uint16_t step,int32_t scene) {
    if(f->pending) return false;
    f->pending_sequence=s; f->pending_step=step; f->pending_scene=scene; f->pending=true;
    return true;
}
bool lge_flow_start(lge_flow_t *f,const lge_flow_sequence_t *s) {
    return s && s->count && s->steps && queue(f,s,0,s->steps[0].scene);
}
bool lge_flow_go(lge_flow_t *f,uint16_t scene) { return queue(f,NULL,0,scene); }
bool lge_flow_next(lge_flow_t *f) {
    const lge_flow_sequence_t *s=f->sequence;
    if(!s || f->pending || f->step>=s->count) return false;
    uint16_t next=(uint16_t)(f->step+1);
    if(next>=s->count) {
        if(s->loop) next=0;
        else return queue(f,NULL,0,s->end_scene);
    }
    return queue(f,s,next,s->steps[next].scene);
}
bool lge_flow_signal(lge_flow_t *f,lge_flow_trigger_t trigger,const char *button) {
    const lge_flow_sequence_t *s=f->sequence;
    if(!s || f->step>=s->count || trigger==LGE_FLOW_MANUAL) return false;
    const lge_flow_step_t *step=&s->steps[f->step];
    if(step->advance!=trigger) return false;
    if(trigger==LGE_FLOW_CLICK && (!button || !step->button || strcmp(button,step->button))) return false;
    return lge_flow_next(f);
}
void lge_flow_commit(lge_flow_t *f) {
    if(!f->pending) return;
    f->sequence=f->pending_sequence; f->step=f->pending_step; f->pending=false;
    f->pending_sequence=NULL;
}
void lge_flow_stop(lge_flow_t *f) { lge_flow_init(f); }
