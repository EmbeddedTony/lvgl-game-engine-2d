#include "debug_mailbox.h"
#include <assert.h>
#include <stdio.h>
static volatile uint32_t wire[LGE_SWD_WORDS];
static unsigned calls, releases, barriers, tear_at;
static uint32_t result;
static uint32_t command(void *ctx, uint32_t op, const uint32_t *args) {
    (void)ctx;
    assert(op == LGE_SWD_INPUT);
    assert(args[0] == 4);
    calls++;
    return result;
}
static void release(void *ctx) {
    (void)ctx;
    releases++;
}
static void snapshot(void *ctx, uint32_t *r) {
    (void)ctx;
    r[11] = 123;
}
static void barrier(void) {
    if (++barriers == tear_at)
        wire[0]++;
}
static void request(uint32_t sequence, uint32_t lease) {
    wire[0] = 0;
    wire[1] = LGE_SWD_INPUT;
    wire[2] = lease;
    wire[3] = 4;
    wire[31] = sequence;
    wire[0] = sequence;
}
int main(void) {
    lge_swd_t s;
    const lge_swd_backend_t backend = {NULL, command, release, snapshot, barrier};
    lge_swd_init(&s, wire, &backend);
    lge_swd_poll(&s, 100);
    assert(wire[32] == LGE_SWD_MAGIC && wire[33] == 1 && wire[34] == wire[127] && !(wire[34] & 1));
    request(1, 1000);
    wire[31] = 0;
    lge_swd_poll(&s, 100);
    assert(!calls && !s.ack);
    wire[31] = 1;
    lge_swd_poll(&s, 100);
    assert(calls == 1 && s.ack == 1 && s.leased && wire[38] == 1000);
    lge_swd_poll(&s, 1099);
    assert(calls == 1 && !releases && wire[38] == 1);
    lge_swd_poll(&s, 1100);
    assert(releases == 1 && !s.leased && wire[38] == 0);
    lge_swd_poll(&s, 1200);
    assert(releases == 1 && calls == 1); /* At most once. */
    request(2, 120001);
    lge_swd_poll(&s, 1200);
    assert(s.result == LGE_SWD_INVALID && calls == 1 && !s.leased);
    result = LGE_SWD_UNSUPPORTED;
    request(3, 1000);
    lge_swd_poll(&s, 1200);
    assert(calls == 2 && !s.leased);
    result = 0;
    request(4, 500);
    tear_at = barriers + 2;
    lge_swd_poll(&s, 1200);
    assert(calls == 2 && s.ack == 3);
    tear_at = 0;
    request(5, 500);
    lge_swd_poll(&s, UINT32_MAX - 200);
    assert(calls == 3 && s.leased);
    lge_swd_poll(&s, 298);
    assert(s.leased);
    lge_swd_poll(&s, 299);
    assert(!s.leased && releases == 2);
    request(6, 500);
    lge_swd_poll(&s, 1000);
    assert(s.leased);
    request(7, 500);
    wire[1] = LGE_SWD_RELEASE;
    lge_swd_poll(&s, 1100);
    assert(!s.leased && releases == 3);
    assert(wire[34] == wire[127] && !(wire[34] & 1) && wire[43] == 123);
    puts("SWD mailbox: torn/duplicate/rejected requests, lease expiry, wraparound and coherent "
         "publication passed.");
}
