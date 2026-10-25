#include "checkpoint_journal.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
typedef struct {
    uint8_t flash[LGE_JOURNAL_BYTES];
    bool programmed[LGE_JOURNAL_BYTES/16],ecc[LGE_JOURNAL_BYTES/16];
    unsigned operations,programs,erases,cut,partial;
} flash_t;
static flash_t device,baseline;
static uint8_t input[492],output[492],previous[492];
static bool read_io(void *ctx,uint32_t at,void *out,size_t n) {
    flash_t *f=ctx; assert(at%16==0 && n%16==0 && at+n<=sizeof(f->flash));
    for(size_t i=at/16;i<(at+n)/16;i++) if(f->ecc[i]) return false;
    memcpy(out,f->flash+at,n); return true;
}
static bool program_io(void *ctx,uint32_t at,const uint8_t word[16]) {
    flash_t *f=ctx; assert(at%16==0 && at+16<=sizeof(f->flash));
    assert(!f->programmed[at/16]);
    for(unsigned i=0;i<16;i++) assert(f->flash[at+i]==255);
    bool fail=++f->operations==f->cut; ++f->programs;
    unsigned count=fail?f->partial:16;
    for(unsigned i=0;i<count;i++) f->flash[at+i]&=word[i];
    f->programmed[at/16]=true;
    f->ecc[at/16]=fail && count!=16;
    return !fail;
}
static bool erase_io(void *ctx,unsigned bank) {
    flash_t *f=ctx;assert(bank<2);
    bool fail=++f->operations==f->cut;++f->erases;
    unsigned count=fail?f->partial*512:LGE_JOURNAL_SECTOR_BYTES;
    unsigned base=bank*LGE_JOURNAL_SECTOR_BYTES;
    memset(f->flash+base,255,count);
    memset(f->programmed+base/16,0,count/16*sizeof(bool));
    memset(f->ecc+base/16,0,count/16*sizeof(bool));
    if(fail) f->ecc[(base+count)/16]=true;
    return !fail;
}
static lge_checkpoint_journal_t journal(void) {
    return (lge_checkpoint_journal_t){&device,read_io,program_io,erase_io,1234};
}
static void fresh(void) {memset(&device,0,sizeof(device));memset(device.flash,255,sizeof(device.flash));}
static void packet(unsigned seed) {for(unsigned i=0;i<sizeof(input);i++)input[i]=(uint8_t)(i*7+seed);}
static void save(unsigned seed) {
    packet(seed);lge_checkpoint_journal_t j=journal();assert(lge_checkpoint_write(&j,input,sizeof(input)));
}
static void load_equals(const uint8_t *p) {
    lge_checkpoint_journal_t j=journal();assert(lge_checkpoint_read(&j,output,sizeof(output)));assert(!memcmp(p,output,sizeof(output)));
}
static void sequence_at(uint32_t at,uint32_t sequence) {
    for(unsigned i=0;i<4;i++) device.flash[at+4+i]=(uint8_t)(sequence>>(8*i));
    uint32_t crc=lge_checkpoint_crc32(0,device.flash+at,16);
    crc=lge_checkpoint_crc32(crc,device.flash+at+16,sizeof(input));
    uint8_t *commit=device.flash+at+512;
    for(unsigned i=0;i<4;i++) {
        commit[4+i]=(uint8_t)(sequence>>(8*i));
        commit[8+i]=(uint8_t)(crc>>(8*i));
        commit[12+i]=(uint8_t)(~sequence>>(8*i));
    }
}
int main(void) {
    assert(lge_checkpoint_crc32(0,"123456789",9)==UINT32_C(0xcbf43926));
    assert(lge_checkpoint_crc32(lge_checkpoint_crc32(0,"1234",4),"56789",5)==UINT32_C(0xcbf43926));
    fresh();lge_checkpoint_journal_t j=journal();
    assert(!lge_checkpoint_read(&j,output,sizeof(output)));
    assert(!lge_checkpoint_write(&j,input,LGE_JOURNAL_MAX_PACKET+1));
    assert(!lge_checkpoint_write(&j,input,0));assert(device.operations==0);
    save(1);memcpy(previous,input,sizeof(input));load_equals(previous);
    unsigned wear=device.operations;save(1);assert(device.operations==wear);
    j.key=5678;assert(!lge_checkpoint_read(&j,output,sizeof(output)));
    assert(!lge_checkpoint_read(&j,output,sizeof(output)-1));
    for(unsigned i=2;i<70;i++)save(i);
    load_equals(input);assert(device.erases>=3 && device.erases<8);
    /* Restart with no retained driver state: all discovery comes from nonvolatile bytes. */
    memcpy(previous,input,sizeof(input));baseline=device;
    packet(200);device.operations=0;assert(lge_checkpoint_write(&j,input,sizeof(input)));
    unsigned ops=device.operations;assert(ops>2);
    /* Every program boundary, every partial 128-bit write, and torn ECC reads. */
    for(unsigned cut=1;cut<=ops;cut++)for(unsigned partial=0;partial<16;partial++) {
        device=baseline;device.operations=0;device.cut=cut;device.partial=partial;j=journal();
        assert(!lge_checkpoint_write(&j,input,sizeof(input)));
        load_equals(previous);
        device.cut=0;assert(lge_checkpoint_write(&j,input,sizeof(input)));load_equals(input);
    }
    /* Force garbage collection, including interrupted erase of the inactive sector. */
    fresh();for(unsigned i=1;i<=30;i++)save(i);baseline=device;memcpy(previous,input,sizeof(input));packet(201);
    for(unsigned partial=0;partial<16;partial++) {
        device=baseline;device.operations=0;device.cut=1;device.partial=partial;j=journal();
        assert(!lge_checkpoint_write(&j,input,sizeof(input)));load_equals(previous);
        device.cut=0;assert(lge_checkpoint_write(&j,input,sizeof(input)));load_equals(input);
    }
    /* CRC failures fall back to the previous complete commit. */
    fresh();save(10);memcpy(previous,input,sizeof(input));save(20);
    device.flash[528+16+33]^=1;load_equals(previous);
    fresh();save(40);save(41);sequence_at(0,UINT32_MAX);sequence_at(528,0);load_equals(input);
    /* An IO error after a fully written commit may leave either old or new state,
     * but never a mixed packet. Retrying recognizes the durable commit. */
    fresh();save(42);device.operations=0;device.cut=33;device.partial=16;packet(43);j=journal();
    assert(!lge_checkpoint_write(&j,input,sizeof(input)));load_equals(input);
    device.cut=0;wear=device.operations;assert(lge_checkpoint_write(&j,input,sizeof(input)));assert(device.operations==wear);
    /* Unknown contents and unreadable erased words are reclaimable only via erase. */
    fresh();memset(device.flash,0x5a,sizeof(device.flash));memset(device.programmed,1,sizeof(device.programmed));
    save(33);load_equals(input);assert(device.erases==1);
    fresh();device.ecc[0]=true;save(34);load_equals(input);assert(device.erases==1);
    /* The maximum packet remains bounded; all-ones payload words need no program. */
    static uint8_t large[LGE_JOURNAL_MAX_PACKET],back[LGE_JOURNAL_MAX_PACKET];
    fresh();memset(large,255,sizeof(large));j=journal();assert(lge_checkpoint_write(&j,large,sizeof(large)));
    assert(device.programs==2);assert(lge_checkpoint_read(&j,back,sizeof(back)));assert(!memcmp(large,back,sizeof(back)));
    puts("Checkpoint journal C99/UBSan: cold reconstruction, exact IO bounds, CRC fallback, namespace isolation, wear skipping, rollover and exhaustive torn program/erase recovery passed.");
    return 0;
}
