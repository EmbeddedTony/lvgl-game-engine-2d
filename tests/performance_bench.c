/* Host microbenchmark: measures lookup CPU work, not board FPS or DMA/GPU speed. */
#include "lge.h"
#include <assert.h>
#include <stdio.h>
#include <time.h>
static uint16_t runs[2048];
static uint32_t seek[64];
static volatile unsigned checksum;
static double sample(const lge_tilemap_t *map) {
    clock_t start = clock();
    unsigned sum = 0;
    for (unsigned i=0;i<200000;++i) {
        unsigned at = (i * 7919u) % 16384;
        sum += lge_tile_at(map, (int)(at % 128), (int)(at / 128));
    }
    checksum = sum;
    return (double)(clock()-start)*1000/CLOCKS_PER_SEC;
}
int main(void) {
    for(unsigned i=0;i<1024;++i) {
        runs[i*2]=16; runs[i*2+1]=(uint16_t)(i%3);
        if(!(i%16)) seek[i/16]=i*16;
    }
    lge_tilemap_t legacy={.columns=128,.rows=128,.runs=runs,.run_count=1024}, indexed=legacy;
    indexed.run_seek=seek;
    double old=0, next=0;
    for(unsigned i=0;i<3;++i) {
        old+=sample(&legacy); unsigned before=checksum;
        next+=sample(&indexed); assert(checksum==before);
    }
    printf("{\"queries_per_trial\":200000,\"trials\":3,\"legacy_ms\":%.3f,\"indexed_ms\":%.3f,\"ratio\":%.2f,\"seek_flash_bytes\":%zu,\"cursor_bytes_host\":%zu,\"decompressed_ram_bytes\":0}\n",
        old/3,next/3,old/next,sizeof(seek),sizeof(lge_tile_cursor_t));
}
