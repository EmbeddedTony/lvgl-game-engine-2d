#include "debug_mailbox.h"
#include <string.h>
static void barrier(lge_swd_t *s) {
    s->backend.barrier();
}
void lge_swd_init(lge_swd_t *s, volatile uint32_t *wire, const lge_swd_backend_t *backend) {
    memset(s, 0, sizeof(*s));
    s->wire = wire;
    s->backend = *backend;
    for (unsigned i = 0; i < LGE_SWD_WORDS; i++)
        wire[i] = 0;
    barrier(s);
}
void lge_swd_poll(lge_swd_t *s, uint32_t now) {
    if (s->leased && (int32_t)(now - s->deadline) >= 0) {
        s->backend.release(s->backend.context);
        s->leased = false;
    }
    uint32_t request[32], sequence = s->wire[0];
    if (sequence && sequence != s->ack) {
        barrier(s);
        for (unsigned i = 0; i < 32; i++)
            request[i] = s->wire[i];
        barrier(s);
        if (s->wire[0] == sequence && request[0] == sequence && request[31] == sequence) {
            uint32_t op = request[1], lease = request[2];
            s->result = LGE_SWD_INVALID;
            if (op == LGE_SWD_RELEASE) {
                s->backend.release(s->backend.context);
                s->leased = false;
                s->result = LGE_SWD_OK;
            } else if (lease >= 100 && lease <= LGE_SWD_MAX_LEASE) {
                s->result = s->backend.execute(s->backend.context, op, request + 3);
                if (s->result == LGE_SWD_OK) {
                    s->deadline = now + lease;
                    s->leased = true;
                }
            }
            s->ack = sequence; /* Duplicate requests never execute twice. */
        }
    }
    uint32_t response[96] = {0};
    response[0] = LGE_SWD_MAGIC;
    response[1] = 1;
    response[2] = ++s->sequence; /* Always odd while publishing. */
    response[3] = s->ack;
    response[4] = s->result;
    response[5] = now;
    response[6] = s->leased ? s->deadline - now : 0;
    s->backend.snapshot(s->backend.context, response);
    response[95] = s->sequence + 1;
    s->wire[34] = s->sequence;
    barrier(s);
    for (unsigned i = 0; i < 96; i++)
        if (i != 2)
            s->wire[32 + i] = response[i];
    barrier(s);
    s->wire[34] = ++s->sequence;
}
