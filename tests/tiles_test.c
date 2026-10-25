#include "lge.h"
#include <assert.h>
#include <stdio.h>

static void seek_test(void) {
    static uint16_t runs[600];
    static uint32_t seek[19];
    for (unsigned i = 0; i < 300; ++i) {
        runs[i * 2] = 300;
        runs[i * 2 + 1] = (uint16_t)(i % 3);
        if (!(i % 16)) seek[i / 16] = i * 300;
    }
    lge_tilemap_t map = {.columns=300,.rows=300,.runs=runs,.run_count=300,.run_seek=seek};
    lge_tile_cursor_t a = {0}, b = {0};
    for (unsigned i = 0; i < 90000; ++i) {
        assert(lge_tile_cursor_at(&a,&map,(int)(i%300),(int)(i/300)) == (i/300)%3);
        unsigned backwards = 89999 - i;
        assert(lge_tile_cursor_at(&b,&map,(int)(backwards%300),(int)(backwards/300)) == (backwards/300)%3);
        if (!(i % 31)) assert(lge_tile_at(&map,(int)(i%300),(int)(i/300)) == (i/300)%3);
    }
    assert(!lge_tile_cursor_at(&a,&map,-1,0));
    assert(!lge_tile_cursor_at(&a,&map,300,0));
    assert(!lge_tile_cursor_at(&a,&map,0,300));
    /* Same data without checkpoints: legacy streams and an interleaved second map. */
    lge_tilemap_t legacy = map; legacy.run_seek = NULL;
    for (unsigned i = 0; i < 90000; i += 97) {
        assert(lge_tile_cursor_at(&a,&legacy,(int)(i%300),(int)(i/300)) == (i/300)%3);
        assert(lge_tile_cursor_at(&a,&map,(int)(i%300),(int)(i/300)) == (i/300)%3);
    }
}

int main(void) {
    seek_test();
    static const void * const images[255]={0};
    static const uint8_t raw[]={0,0,255,0};
    static const uint16_t runs[]={2,0,1,255,1,0};
    uint8_t solid[32]={0}; solid[31]=64; solid[16]=1; /* Values 255 and 129. */
    lge_tilemap_t map={.tile_size=16,.columns=4,.rows=1,.tile_count=255,.tiles=images,.cells=raw,.solid_bits=solid,.solid_mask=UINT32_MAX};
    for(unsigned value=0;value<=256;++value) assert(lge_tile_is_solid(&map,(uint16_t)value)==(value==255 || value==129));
    assert(lge_tile_at(&map,2,0)==255 && !lge_tile_at(&map,-1,0));
    lge_node_def_t nodes[]={
        {.id="terrain",.kind=LGE_TILEMAP,.width=64,.height=16,.visible=true,.tilemap=&map},
        {.id="player",.kind=LGE_RECT,.width=8,.height=8,.visible=true,.player=true,.speed=600}
    };
    lge_scene_def_t scene={.id="tiles",.width=64,.height=32,.nodes=nodes,.count=2};
    lge_engine_t g; lge_init(&g,NULL,NULL,NULL); assert(lge_load(&g,&scene));
    lge_set_input(&g,LGE_INPUT_RIGHT); lge_update(&g,100); assert(g.nodes[1].x==24);
    map.cells=NULL; map.runs=runs; map.run_count=3;
    assert(lge_load(&g,&scene)); lge_set_input(&g,LGE_INPUT_RIGHT); lge_update(&g,100); assert(g.nodes[1].x==24);
    map.solid_bits=NULL; map.solid_mask=UINT32_C(1)<<31;
    assert(lge_tile_is_solid(&map,32) && !lge_tile_is_solid(&map,33) && !lge_tile_is_solid(&map,255));
    lge_destroy(&g);
    puts("Tiles C99: 255 tile types, compact collision bits, RAW8/RLE lookup, high-index collision and legacy masks passed.");
    return 0;
}
