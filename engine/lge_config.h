#ifndef LGE_CONFIG_H
#define LGE_CONFIG_H
/* Generic ports fall back; verified board builds can require their configured backend. */
#ifndef LGE_ACCELERATION_STRICT
#define LGE_ACCELERATION_STRICT 0
#endif
#ifndef LGE_CHECKPOINT_BYTES
#define LGE_CHECKPOINT_BYTES 4096
#endif
#endif
