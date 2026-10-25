#ifndef LGE_DK_HARDWARE_INPUTS_H
#define LGE_DK_HARDWARE_INPUTS_H
#include "stm32h7rsxx_hal.h"
#include <stdbool.h>
#include <stdint.h>
typedef struct {
    uint8_t channel;
    GPIO_TypeDef *port;
    uint16_t pin;
    uint8_t adc;
    uint32_t adc_channel, pull;
    bool active_low;
    uint16_t debounce_ms;
} lge_dk_pin_t;
/* Call once on the owner thread, after ui_init installs the ISR publication lock.
 * Owns TIM3 and selected ADC instances. No flash/options/boot/storage writes. */
bool lge_h7_inputs_init(void);
extern volatile uint32_t lge_h7_input_faults;
#endif
