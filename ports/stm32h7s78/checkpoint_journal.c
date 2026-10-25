#include "checkpoint_journal.h"
#include <string.h>

#define HEADER_MAGIC UINT32_C(0x314a474c)
#define COMMIT_MAGIC UINT32_C(0x3143474c)
typedef struct { uint32_t offset, sequence, size, key; bool valid; } record_t;
typedef struct {
    record_t latest, matching;
    uint32_t end[2];
    bool blocked[2];
} scan_t;
static uint32_t get32(const uint8_t *p) {
    return (uint32_t)p[0] | (uint32_t)p[1]<<8 | (uint32_t)p[2]<<16 | (uint32_t)p[3]<<24;
}
static void put32(uint8_t *p, uint32_t n) {
    for (unsigned i=0;i<4;i++) p[i]=(uint8_t)(n>>(8*i));
}
uint32_t lge_checkpoint_crc32(uint32_t crc, const void *data, size_t size) {
    const uint8_t *p=data;
    crc=~crc;
    for (size_t i=0;i<size;i++) {
        crc^=p[i];
        for(unsigned bit=0;bit<8;bit++) crc=(crc>>1)^(UINT32_C(0xedb88320)&(0u-(crc&1u)));
    }
    return ~crc;
}
static uint32_t padded(uint32_t n) { return (n+15u)&~15u; }
static bool erased(const uint8_t word[16]) {
    for(unsigned i=0;i<16;i++) if(word[i]!=255) return false;
    return true;
}
static bool newer(uint32_t a, uint32_t b) { return a!=b && a-b<UINT32_C(0x80000000); }
static bool valid_io(const lge_checkpoint_journal_t *j, const void *p, size_t size) {
    return j && j->read && j->program && j->erase && p && size>=16 && size<=LGE_JOURNAL_MAX_PACKET;
}
static bool payload(const lge_checkpoint_journal_t *j, record_t r, uint32_t *crc, uint8_t *out,
                    const uint8_t *compare) {
    uint8_t word[16];
    for(uint32_t n=0;n<r.size;n+=16) {
        size_t count=r.size-n<16?r.size-n:16;
        if(!j->read(j->context,r.offset+16+n,word,16)) return false;
        if(crc) *crc=lge_checkpoint_crc32(*crc,word,count);
        if(compare && memcmp(compare+n,word,count)) return false;
        if(out) memcpy(out+n,word,count);
    }
    return true;
}
static bool scan(const lge_checkpoint_journal_t *j, size_t size, scan_t *s) {
    memset(s,0,sizeof(*s));
    for(unsigned bank=0;bank<2;bank++) {
        uint32_t base=bank*LGE_JOURNAL_SECTOR_BYTES, limit=base+LGE_JOURNAL_SECTOR_BYTES;
        for(uint32_t at=base;at+16<=limit;at+=16) {
            uint8_t header[16],commit[16];
            if(!j->read(j->context,at,header,16)) {s->blocked[bank]=true;continue;}
            if(erased(header)) continue;
            s->end[bank]=at-base+16;
            record_t r={at,get32(header+4),get32(header+8),get32(header+12),true};
            if(get32(header)!=HEADER_MAGIC || r.size<16 || r.size>LGE_JOURNAL_MAX_PACKET ||
               padded(r.size)+32>limit-at) {s->blocked[bank]=true;continue;}
            uint32_t end=at+padded(r.size)+32,crc=lge_checkpoint_crc32(0,header,16);
            bool ok=j->read(j->context,end-16,commit,16) && get32(commit)==COMMIT_MAGIC &&
                get32(commit+4)==r.sequence && get32(commit+12)==~r.sequence &&
                payload(j,r,&crc,NULL,NULL) && crc==get32(commit+8);
            s->end[bank]=end-base;
            if(!ok) s->blocked[bank]=true;
            else {
                if(!s->latest.valid || newer(r.sequence,s->latest.sequence)) s->latest=r;
                if(r.key==j->key && r.size==size &&
                   (!s->matching.valid || newer(r.sequence,s->matching.sequence))) s->matching=r;
            }
            at=end-16;
        }
    }
    return true;
}
bool lge_checkpoint_read(const lge_checkpoint_journal_t *j, void *out, size_t size) {
    if(!valid_io(j,out,size)) return false;
    scan_t s;
    scan(j,size,&s);
    return s.matching.valid && payload(j,s.matching,NULL,out,NULL);
}
static bool program_checked(const lge_checkpoint_journal_t *j, uint32_t at, const uint8_t word[16]) {
    uint8_t verify[16];
    return j->program(j->context,at,word) && j->read(j->context,at,verify,16) && !memcmp(word,verify,16);
}
bool lge_checkpoint_write(const lge_checkpoint_journal_t *j, const void *data, size_t size) {
    if(!valid_io(j,data,size)) return false;
    scan_t s;
    scan(j,size,&s);
    if(s.matching.valid && payload(j,s.matching,NULL,NULL,data)) return true; /* No redundant wear. */
    uint32_t span=padded((uint32_t)size)+32;
    unsigned bank=s.latest.valid?s.latest.offset/LGE_JOURNAL_SECTOR_BYTES:0;
    if(s.blocked[bank] || span>LGE_JOURNAL_SECTOR_BYTES-s.end[bank]) {
        if(s.latest.valid) bank^=1;
        if(!j->erase(j->context,bank)) return false; /* Never erase the latest committed record. */
        s.end[bank]=0;
    }
    uint32_t at=bank*LGE_JOURNAL_SECTOR_BYTES+s.end[bank];
    uint32_t sequence=s.latest.valid?s.latest.sequence+1u:1u;
    uint8_t word[16];
    put32(word,HEADER_MAGIC); put32(word+4,sequence); put32(word+8,(uint32_t)size); put32(word+12,j->key);
    uint32_t crc=lge_checkpoint_crc32(0,word,16);
    if(!program_checked(j,at,word)) return false;
    crc=lge_checkpoint_crc32(crc,data,size);
    for(uint32_t n=0;n<size;n+=16) {
        size_t count=size-n<16?size-n:16;
        memset(word,255,16); memcpy(word,(const uint8_t *)data+n,count);
        /* An erased all-ones flashword must never be programmed just for padding/ECC. */
        if(!erased(word) && !program_checked(j,at+16+n,word)) return false;
    }
    put32(word,COMMIT_MAGIC); put32(word+4,sequence); put32(word+8,crc); put32(word+12,~sequence);
    if(!program_checked(j,at+span-16,word)) return false;
    /* Success means durable commit AND exact payload readback, not a queued request. */
    scan(j,size,&s);
    return s.matching.valid && s.matching.sequence==sequence && payload(j,s.matching,NULL,NULL,data);
}
