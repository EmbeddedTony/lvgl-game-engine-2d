#ifndef LGE_H7_CHECKPOINT_FLASH_H
#define LGE_H7_CHECKPOINT_FLASH_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
bool lge_h7_checkpoint_init(void);
bool lge_h7_checkpoint_read(void *, void *, size_t);
bool lge_h7_checkpoint_write(void *, const void *, size_t);
void lge_h7_checkpoint_busfault(uint32_t *frame);
#endif
