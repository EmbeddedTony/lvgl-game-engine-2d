#include "lge.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

static unsigned starts, exits, clicks;
static void event(lge_engine_t *g,lge_event_t e,lge_node_t *n,void *user) {
    (void)n; (void)user;
    if(e==LGE_EVENT_START) ++starts;
    if(e==LGE_EVENT_EXIT) { assert(g->scene && lge_find(g,"actor/body")); ++exits; }
    if(e==LGE_EVENT_CLICK) ++clicks;
}
static void update(lge_engine_t *g,float dt,void *user) {
    (void)dt; (void)user;
    lge_find(g,"actor")->x+=2; /* Existing hooks can still write world position. */
}
static const lge_node_def_t nodes[]={
    {.id="actor",.kind=LGE_INSTANCE,.x=10,.y=20,.width=1,.height=1,.visible=true},
    {.id="actor/body",.kind=LGE_RECT,.parent=1,.x=3,.y=4,.width=8,.height=8,.visible=true},
    {.id="actor/button",.kind=LGE_BUTTON,.parent=2,.x=5,.y=6,.width=8,.height=8,.visible=true},
    {.id="hidden",.kind=LGE_GROUP,.x=50,.y=50,.width=1,.height=1,.visible=false},
    {.id="hidden/gem",.kind=LGE_RECT,.parent=4,.width=8,.height=8,.visible=true,.collectible=true},
};
static const lge_scene_def_t scene={.id="composed",.width=320,.height=240,.nodes=nodes,.count=5};
int main(void) {
    lge_engine_t g; lge_init(&g,NULL,event,NULL); assert(lge_load(&g,&scene));
    lge_node_t *root=lge_find(&g,"actor"), *body=lge_find(&g,"actor/body"), *button=lge_find(&g,"actor/button");
    assert(starts==1 && exits==0 && g.total==0);
    assert(body->x==13 && body->y==24 && button->x==18 && button->y==30);
    assert(lge_node_parent(button)==body && !lge_node_parent(root));
    assert(lge_node_set_position(root,30,40));
    assert(body->x==33 && body->y==44 && button->x==38 && button->y==50);
    lge_sync_hierarchy(&g); assert(button->x==38); /* No double application. */
    assert(lge_node_set_local_position(body,7,8)); assert(body->x==37 && button->x==42);
    assert(!lge_node_set_position(body,NAN,0) && !lge_node_set_local_position(body,INFINITY,0));
    lge_node_set_visible(root,false); assert(button->visible && !button->effective_visible);
    lge_click(button); assert(clicks==0);
    lge_node_set_visible(body,false); lge_node_set_visible(root,true); assert(!button->effective_visible);
    lge_node_set_visible(body,true); lge_click(button); assert(clicks==1);
    root->x+=4; g.on_update=update; lge_update(&g,17); assert(root->x==36 && body->x==43 && button->x==48);
    lge_node_def_t invalid=nodes[0]; invalid.parent=1;
    lge_scene_def_t bad=scene; bad.nodes=&invalid; bad.count=1;
    assert(!lge_load(&g,&bad) && g.scene==&scene && exits==0);
    assert(lge_load(&g,&scene)); assert(starts==2 && exits==1 && body->x==13);
    lge_destroy(&g); assert(exits==2); lge_destroy(&g); assert(exits==2);
    puts("Scene C99: scoped paths, parent transforms, visibility, direct hooks, invalid loads and EXIT/START lifecycle passed.");
    return 0;
}
