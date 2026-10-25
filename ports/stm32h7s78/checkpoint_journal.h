#ifndef LGE_CHECKPOINT_JOURNAL_H
#define LGE_CHECKPOINT_JOURNAL_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Two caller-owned erase sectors. Offsets never refer to boot or application code.
 * IO is synchronous on the LVGL owner thread; false reads include ECC failures. */
#define LGE_JOURNAL_SECTOR_BYTES 8192u
#define LGE_JOURNAL_BYTES (2u * LGE_JOURNAL_SECTOR_BYTES)
#define LGE_JOURNAL_MAX_PACKET 4096u
typedef struct {
    void *context;
    bool (*read)(void *, uint32_t offset, void *, size_t);
    bool (*program)(void *, uint32_t offset, const uint8_t word[16]);
    bool (*erase)(void *, unsigned sector);
    uint32_t key;
} lge_checkpoint_journal_t;

uint32_t lge_checkpoint_crc32(uint32_t crc, const void *data, size_t size);
bool lge_checkpoint_read(const lge_checkpoint_journal_t *, void *, size_t);
bool lge_checkpoint_write(const lge_checkpoint_journal_t *, const void *, size_t);
#endif
