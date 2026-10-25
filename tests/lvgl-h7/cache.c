#include "engine/lge_tile_cache.h"
#include <assert.h>
#include <string.h>
static uint8_t pixels[2 * LGE_TILE_CACHE_SLOT_BYTES + 64] __attribute__((aligned(32)));
static unsigned waits, publications;
static bool fail_publish;
static void wait_reads(void *context) { assert(context == &waits); ++waits; }
static bool publish(void *context, const void *data, size_t size) {
    assert(context == &waits && waits && data && size <= LGE_TILE_CACHE_SLOT_BYTES);
    ++publications;
    return !fail_publish;
}
void test_terrain_cache(void) {
    uint8_t colors[2][32 * 32 * 4];
    for (unsigned i = 0; i < 2; ++i)
        for (unsigned p = 0; p < 32 * 32; ++p) {
            colors[i][p * 4] = (uint8_t)(p * 13 + i);
            colors[i][p * 4 + 1] = (uint8_t)(p / 32);
            colors[i][p * 4 + 2] = (uint8_t)(p % 32);
            colors[i][p * 4 + 3] = 255;
        }
    lv_image_dsc_t images[2];
    for (unsigned i = 0; i < 2; ++i)
        images[i] = (lv_image_dsc_t){
            .header = {.magic=LV_IMAGE_HEADER_MAGIC,.cf=LV_COLOR_FORMAT_XRGB8888,
                       .w=32,.h=32,.stride=128},.data=colors[i],.data_size=sizeof(colors[i])};
    const void *tiles[] = {&images[0], &images[1]};
    uint8_t cells[12 * 4];
    for (unsigned i = 0; i < sizeof(cells); ++i) cells[i] = (i % 2) + 1;
    lge_tilemap_t map = {.tile_size=32,.columns=12,.rows=4,.tile_count=2,.tiles=tiles,.cells=cells};
    memset(pixels, 0xcd, sizeof(pixels));
    lge_tile_cache_config_t config = {.pixels=pixels+32,.bytes=2*LGE_TILE_CACHE_SLOT_BYTES,
        .context=&waits,.begin_write=wait_reads,.publish=publish};
    assert(lge_tile_cache_config_valid(&config));
    lge_tile_cache_config_t bad = config; bad.bytes=1;
    assert(!lge_tile_cache_create(&bad));
    bad=config;bad.pixels=pixels+1;assert(!lge_tile_cache_create(&bad));
    bad=config;bad.publish=NULL;assert(!lge_tile_cache_create(&bad));
    lge_tile_cache_t *cache = lge_tile_cache_create(&config);
    assert(cache);
    lge_tile_cache_begin(cache);
    lge_tile_cache_prepare(cache,&map,0,11,0,3);
    assert(lge_tile_cache_stats(cache)->builds == 2);
    assert(!lge_tile_cache_image(cache,&map,8,0));
    const lv_image_dsc_t *image=lge_tile_cache_image(cache,&map,1,1);
    assert(image && image->header.w == 128 && image->header.h == 128);
    for (unsigned y=0;y<128;y++) for(unsigned x=0;x<128;x++) {
        unsigned tile=cells[(y/32)*12+x/32]-1;
        assert(!memcmp(image->data+(y*128+x)*4,colors[tile]+((y%32)*32+x%32)*4,4));
    }
    /* An under-sized visible working set must not thrash on each sync. */
    for(unsigned frame=0;frame<20;frame++) {
        lge_tile_cache_begin(cache);lge_tile_cache_pin(cache,&map,0,11,0,3);
        lge_tile_cache_prepare(cache,&map,0,11,0,3);
    }
    assert(lge_tile_cache_stats(cache)->builds == 2);
    lge_tile_cache_begin(cache);lge_tile_cache_pin(cache,&map,4,11,0,3);
    lge_tile_cache_prepare(cache,&map,4,11,0,3);
    assert(lge_tile_cache_stats(cache)->builds == 3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    assert(lge_tile_cache_image(cache,&map,4,0) && lge_tile_cache_image(cache,&map,8,0));
    lge_tile_cache_clear(cache);
    assert(!lge_tile_cache_image(cache,&map,4,0));
    fail_publish=true;
    lge_tile_cache_begin(cache);lge_tile_cache_prepare(cache,&map,0,3,0,3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    assert(lge_tile_cache_stats(cache)->failures == 1);
    fail_publish=false;
    cells[0]=0;
    lge_tile_cache_prepare(cache,&map,0,3,0,3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    cells[0]=1;images[0].header.cf=LV_COLOR_FORMAT_ARGB8888;
    lge_tile_cache_prepare(cache,&map,0,3,0,3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    images[0].header.cf=LV_COLOR_FORMAT_XRGB8888;
    const lge_tile_animation_t animation = {.count=1};
    const lge_tile_animation_t *animations[] = {&animation,NULL};
    map.animations=animations;
    lge_tile_cache_prepare(cache,&map,0,3,0,3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    map.animations=NULL;map.columns=3;map.rows=2;
    lge_tile_cache_prepare(cache,&map,0,200,0,200);
    image=lge_tile_cache_image(cache,&map,0,0);
    assert(image && image->header.w == 96 && image->header.h == 64);
    assert(publications == 5);
    lge_tile_cache_destroy(cache);
    for(unsigned i=0;i<32;i++) {
        assert(pixels[i]==0xcd);
        assert(pixels[sizeof(pixels)-32+i]==0xcd);
    }
    /* Display-native precision is exact at RGB565 output; no filtering or
     * blending occurs in the cache. Faded layers are tested through LVGL. */
    memset(pixels,0xcd,sizeof(pixels));
    config.bytes=LGE_TILE_CACHE_RGB565_SLOT_BYTES;
    config.color_format=LV_COLOR_FORMAT_RGB565;
    cache=lge_tile_cache_create(&config);assert(cache);
    assert(lge_tile_cache_stats(cache)->slots==1);
    lge_tile_cache_begin(cache);lge_tile_cache_prepare(cache,&map,0,2,0,1);
    image=lge_tile_cache_image(cache,&map,0,0);
    assert(image && image->header.cf==LV_COLOR_FORMAT_RGB565 && image->header.stride==96*2);
    for(unsigned y=0;y<64;y++)for(unsigned x=0;x<96;x++) {
        unsigned tile=cells[(y/32)*3+x/32]-1;
        const uint8_t *c=colors[tile]+((y%32)*32+x%32)*4;
        uint16_t expected=(uint16_t)(((c[2]>>3)<<11)|((c[1]>>2)<<5)|(c[0]>>3)),actual;
        memcpy(&actual,image->data+(y*96+x)*2,2);assert(actual==expected);
    }
    unsigned builds=lge_tile_cache_stats(cache)->builds;
    lge_tile_cache_set_enabled(cache,false);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    lge_tile_cache_prepare(cache,&map,0,2,0,1);
    assert(lge_tile_cache_stats(cache)->builds==builds);
    lge_tile_cache_set_enabled(cache,true);
    assert(lge_tile_cache_image(cache,&map,0,0));
    lge_tile_cache_destroy(cache);
    for(unsigned i=0;i<32;i++) {
        assert(pixels[i]==0xcd);
        assert(pixels[32+config.bytes+i]==0xcd);
    }
    /* A fixed ring atlas must reject pinned aliases instead of sampling stale
     * world coordinates. Only off-screen cells can be replaced after wrap. */
    memset(pixels,0xcd,sizeof(pixels));
    config.bytes=2*LGE_TILE_CACHE_SLOT_BYTES;config.atlas=true;
    map.columns=12;map.rows=4;
    cache=lge_tile_cache_create(&config);assert(cache);
    assert(lge_tile_cache_stats(cache)->atlas_edge==256);
    lge_tile_cache_begin(cache);lge_tile_cache_prepare(cache,&map,0,7,0,3);
    builds=lge_tile_cache_stats(cache)->builds;assert(builds==2);
    lge_tile_cache_prepare(cache,&map,8,11,0,3);
    assert(!lge_tile_cache_image(cache,&map,8,0));
    assert(lge_tile_cache_stats(cache)->builds==builds);
    lge_tile_cache_begin(cache);lge_tile_cache_pin(cache,&map,4,11,0,3);
    lge_tile_cache_prepare(cache,&map,4,11,0,3);
    assert(!lge_tile_cache_image(cache,&map,0,0));
    image=lge_tile_cache_image(cache,&map,8,0);assert(image);
    assert(image->header.w==256 && image->header.stride==512);
    for(unsigned y=0;y<128;y++)for(unsigned x=0;x<128;x++) {
        unsigned tile=cells[(y/32)*12+8+x/32]-1;
        const uint8_t *c=colors[tile]+((y%32)*32+x%32)*4;
        uint16_t expected=(uint16_t)(((c[2]>>3)<<11)|((c[1]>>2)<<5)|(c[0]>>3)),actual;
        memcpy(&actual,image->data+y*512+x*2,2);assert(actual==expected);
    }
    lge_tilemap_t other=map;
    builds=lge_tile_cache_stats(cache)->builds;
    lge_tile_cache_prepare(cache,&other,0,3,0,3);
    assert(!lge_tile_cache_image(cache,&other,0,0));
    assert(lge_tile_cache_stats(cache)->builds==builds);
    lge_tile_cache_clear(cache);
    lge_tile_cache_begin(cache);lge_tile_cache_prepare(cache,&other,0,3,0,3);
    assert(lge_tile_cache_image(cache,&other,0,0));
    lge_tile_cache_destroy(cache);
    for(unsigned i=0;i<32;i++) {
        assert(pixels[i]==0xcd);
        assert(pixels[sizeof(pixels)-32+i]==0xcd);
    }
}
