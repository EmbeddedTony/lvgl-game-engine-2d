/* Exercise the board lock contract with a real producer thread and owner poller. */
#include "lge_inputs.h"
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static bool done;
static lge_inputs_t bank;
static uintptr_t enter(void *context) {
    assert(context == &mutex);
    assert(pthread_mutex_lock(context) == 0);
    return 0;
}
static void leave(void *context, uintptr_t token) {
    (void)token;
    assert(pthread_mutex_unlock(context) == 0);
}
static void *producer(void *unused) {
    (void)unused;
    for (int32_t i = 1; i <= 100000; i++) {
        const lge_input_sample_t pair[] = {{0, LGE_VALUE_INT, {.integer = i}},
                                           {1, LGE_VALUE_INT, {.integer = -i}}};
        assert(lge_inputs_publish(&bank, pair, 2));
    }
    enter(&mutex);
    done = true;
    leave(&mutex, 0);
    return NULL;
}
int main(void) {
    const lge_input_source_t source[] = {{256}};
    const lge_input_def_t definitions[] = {{.id = "x",
                                            .type = LGE_VALUE_INT,
                                            .minimum = -100000,
                                            .maximum = 100000,
                                            .press = .6f,
                                            .release = .4f},
                                           {.id = "y",
                                            .type = LGE_VALUE_INT,
                                            .minimum = -100000,
                                            .maximum = 100000,
                                            .press = .6f,
                                            .release = .4f}};
    const lge_input_lock_t lock = {&mutex, enter, leave};
    assert(lge_inputs_init(&bank, definitions, 2, source, 1, &lock));
    pthread_t worker;
    assert(pthread_create(&worker, NULL, producer, NULL) == 0);
    for (;;) {
        lge_inputs_poll(&bank, 1, 1);
        lge_input_value_t x, y;
        if (lge_inputs_read(&bank, 0, LGE_VALUE_INT, &x)) {
            assert(lge_inputs_read(&bank, 1, LGE_VALUE_INT, &y));
            assert(x.integer + y.integer == 0);
        }
        enter(&mutex);
        bool finished = done;
        leave(&mutex, 0);
        if (finished)
            break;
    }
    assert(pthread_join(worker, NULL) == 0);
    lge_inputs_poll(&bank, 1, 1);
    lge_input_value_t last;
    assert(lge_inputs_read(&bank, 0, LGE_VALUE_INT, &last) && last.integer == 100000);
    assert(pthread_mutex_destroy(&mutex) == 0);
    puts("Typed inputs: 100,000 concurrent producer batches preserved coherent owner snapshots.");
    return 0;
}
