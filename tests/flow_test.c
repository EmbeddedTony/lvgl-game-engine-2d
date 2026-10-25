#include "lge_flow.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static const lge_flow_step_t steps[]={
    {"intro",0,LGE_FLOW_CLICK,"continue"},
    {"level",1,LGE_FLOW_COMPLETE,NULL},
    {"revisit",0,LGE_FLOW_MANUAL,NULL}
};
int main(void) {
    lge_flow_t f; lge_flow_init(&f);
    lge_flow_sequence_t seq={"chapter",steps,3,false,-1};
    assert(!lge_flow_next(&f) && !lge_flow_start(&f,NULL));
    assert(lge_flow_start(&f,&seq));assert(!f.sequence&&f.pending);
    assert(!lge_flow_start(&f,&seq)&&!lge_flow_go(&f,2));
    lge_flow_commit(&f);assert(f.sequence==&seq&&f.step==0);
    assert(!lge_flow_signal(&f,LGE_FLOW_CLICK,"wrong"));
    assert(!lge_flow_signal(&f,LGE_FLOW_COMPLETE,NULL));
    assert(lge_flow_signal(&f,LGE_FLOW_CLICK,"continue"));
    assert(!lge_flow_signal(&f,LGE_FLOW_CLICK,"continue")&&!lge_flow_next(&f));
    assert(f.step==0&&f.pending_step==1&&f.pending_scene==1);lge_flow_commit(&f);
    assert(lge_flow_signal(&f,LGE_FLOW_COMPLETE,NULL));lge_flow_commit(&f);
    assert(f.step==2&&f.sequence->steps[f.step].scene==0); /* Repeated scene, distinct stable step. */
    assert(!lge_flow_signal(&f,LGE_FLOW_MANUAL,NULL));
    assert(lge_flow_next(&f)&&f.pending_scene==-1);lge_flow_commit(&f);assert(!f.sequence);
    seq.loop=true;assert(lge_flow_start(&f,&seq));lge_flow_commit(&f);
    for(unsigned i=0;i<3;++i){assert(lge_flow_next(&f));lge_flow_commit(&f);}assert(f.step==0&&f.sequence==&seq);
    seq.loop=false;seq.end_scene=7;
    for(unsigned i=0;i<3;++i){assert(lge_flow_next(&f));if(i==2)assert(f.pending_scene==7);lge_flow_commit(&f);}assert(!f.sequence);
    assert(lge_flow_start(&f,&seq));lge_flow_stop(&f);assert(!f.pending&&!f.sequence);
    seq.count=0;assert(!lge_flow_start(&f,&seq));
    assert(lge_flow_go(&f,4));lge_flow_commit(&f);assert(!f.sequence);
    puts("Flow C99: stable sequence steps, triggers, first queued transition, reuse, loop, hold, end scene and stop passed.");
    return 0;
}
