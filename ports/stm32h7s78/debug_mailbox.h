#ifndef LGE_DEBUG_MAILBOX_H
#define LGE_DEBUG_MAILBOX_H
#include <stdint.h>
#include <stdbool.h>
/* SWD ABI v1, little-endian uint32_t. Host owns words 0..31; firmware owns
 * 32..127. Request: sequence, opcode, lease_ms, args[28], sequence again.
 * Commit word 0 last. Response: magic, version, seqlock, ack, result, time,
 * remaining lease, application snapshot, matching seqlock at word 95. */
#define LGE_SWD_MAGIC UINT32_C(0x4c475357)
#define LGE_SWD_WORDS 128
#define LGE_SWD_RESPONSE 32
#define LGE_SWD_OK 0
#define LGE_SWD_INVALID 1
#define LGE_SWD_UNSUPPORTED 2
#define LGE_SWD_MAX_LEASE 120000
#define LGE_SWD_INPUT 1
#define LGE_SWD_PAUSE 2
#define LGE_SWD_RESUME 3
#define LGE_SWD_RELEASE 4
#define LGE_SWD_RELOAD 5
#define LGE_SWD_WARP 6
typedef struct {
    void *context;
    uint32_t (*execute)(void *, uint32_t, const uint32_t *);
    void (*release)(void *);
    void (*snapshot)(void *, uint32_t *);
    void (*barrier)(void);
} lge_swd_backend_t;
typedef struct {
    volatile uint32_t *wire;
    lge_swd_backend_t backend;
    uint32_t ack, result, deadline, sequence;
    bool leased;
} lge_swd_t;
void lge_swd_init(lge_swd_t *, volatile uint32_t *, const lge_swd_backend_t *);
void lge_swd_poll(lge_swd_t *, uint32_t now_ms);
#endif
