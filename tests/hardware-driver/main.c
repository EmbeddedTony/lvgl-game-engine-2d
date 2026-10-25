#include "hardware_inputs_config.h"
#include "ui.h"
#include <assert.h>
#include <stdio.h>
GPIO_TypeDef test_c,test_d,test_f;
TIM_TypeDef test_timer;
ADC_TypeDef test_adc1,test_adc2;
static uint32_t now;
static unsigned calibrated,armed,ranks;
static ADC_HandleTypeDef *active_adc;
static lge_inputs_t bank;
const lge_dk_pin_t lge_dk_adc_pins[2]={
    {.channel=0,.port=GPIOC,.pin=GPIO_PIN_0,.adc=1,.adc_channel=ADC_CHANNEL_10},
    {.channel=1,.port=GPIOC,.pin=GPIO_PIN_2,.adc=1,.adc_channel=ADC_CHANNEL_12}};
const lge_dk_pin_t lge_dk_gpio_pins[1]={{.channel=2,.port=GPIOF,.pin=GPIO_PIN_1,.active_low=true,.pull=GPIO_PULLUP,.debounce_ms=20}};
uint32_t HAL_RCCEx_GetPeriphCLKFreq(uint32_t p){(void)p;return 200000000;}
uint32_t HAL_RCC_GetPCLK1Freq(void){return 150000000;}
void HAL_RCC_GetClockConfig(RCC_ClkInitTypeDef *c,uint32_t *l){c->APB1CLKDivider=RCC_APB1_DIV2;*l=0;}
void HAL_GPIO_Init(GPIO_TypeDef *p,GPIO_InitTypeDef *c){assert((p==GPIOC&&(c->Pin==GPIO_PIN_0||c->Pin==GPIO_PIN_2)&&c->Mode==GPIO_MODE_ANALOG)||(p==GPIOF&&c->Pin==GPIO_PIN_1&&c->Mode==GPIO_MODE_INPUT));}
int HAL_GPIO_ReadPin(GPIO_TypeDef *p,uint16_t pin){return (p->IDR&pin)?GPIO_PIN_SET:0;}
uint32_t HAL_GetTick(void){return now;}
void HAL_NVIC_SetPriority(int i,int p,int s){(void)i;assert(p==13);assert(!s);}
void HAL_NVIC_ClearPendingIRQ(int i){(void)i;}
void HAL_NVIC_EnableIRQ(int i){(void)i;}
void HAL_NVIC_DisableIRQ(int i){(void)i;}
int HAL_ADC_Init(ADC_HandleTypeDef *h){assert(h->Instance==ADC1&&h->Init.NbrOfConversion==2);active_adc=h;return HAL_OK;}
int HAL_ADC_ConfigChannel(ADC_HandleTypeDef *h,ADC_ChannelConfTypeDef *c){(void)h;assert(c->Channel==(ranks?ADC_CHANNEL_12:ADC_CHANNEL_10));assert(c->Rank==++ranks);return HAL_OK;}
int HAL_ADCEx_Calibration_Start(ADC_HandleTypeDef *h,uint32_t m){(void)h;(void)m;calibrated++;return HAL_OK;}
int HAL_ADC_Start_IT(ADC_HandleTypeDef *h){h->Instance->CR|=ADC_CR_ADEN;armed++;return HAL_OK;}
uint32_t HAL_ADC_GetValue(ADC_HandleTypeDef *h){return h->Instance->DR;}
extern void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *);
extern void HAL_ADC_ErrorCallback(ADC_HandleTypeDef *);
void HAL_ADC_IRQHandler(ADC_HandleTypeDef *h){HAL_ADC_ConvCpltCallback(h);}
bool ui_input_publish(const lge_input_sample_t *s,size_t n){return lge_inputs_publish(&bank,s,n);}
extern void TIM3_IRQHandler(void);
extern void ADC1_2_IRQHandler(void);
static void tick(uint32_t t){now=t;TIM3->SR|=TIM_SR_UIF;TIM3_IRQHandler();}
static int32_t raw(unsigned i){lge_input_value_t v;assert(lge_inputs_read(&bank,i,LGE_VALUE_INT,&v));return v.integer;}
int main(void){
    const lge_input_source_t source={256};
    const lge_input_def_t defs[]={
        {.id="x",.source=0,.type=LGE_VALUE_INT,.binding=LGE_INPUT_BIND_MOVE_X,.minimum=0,.center=2048,.maximum=4095,.press=.6f,.release=.4f},
        {.id="y",.source=0,.type=LGE_VALUE_INT,.minimum=0,.center=2048,.maximum=4095,.press=.6f,.release=.4f},
        {.id="button",.source=0,.type=LGE_VALUE_BOOL,.binding=LGE_INPUT_BIND_ACTION,.maximum=1,.press=.6f,.release=.4f}};
    assert(lge_inputs_init(&bank,defs,3,&source,1,NULL));
    TIM3->CR1=TIM_CR1_CEN;assert(!lge_h7_inputs_init());TIM3->CR1=0;
    GPIOF->IDR=GPIO_PIN_1;
    assert(lge_h7_inputs_init());assert(calibrated==1&&armed==1&&ranks==2);
    assert(TIM3->PSC==299&&TIM3->ARR==9999);
    tick(100);ADC1->DR=1111;ADC1_2_IRQHandler();lge_inputs_poll(&bank,100,1);
    assert(!lge_inputs_active(&bank,0)); /* No torn X/Y sequence. */
    ADC1->DR=2222;ADC1_2_IRQHandler();lge_inputs_poll(&bank,101,1);
    assert(raw(0)==1111&&raw(1)==2222);
    GPIOF->IDR=0;tick(110);tick(120);tick(130);
    GPIOF->IDR=GPIO_PIN_1;tick(140);tick(150);tick(160);
    lge_input_frame_t frame=lge_inputs_poll(&bank,170,69);
    assert(frame.pressed&16); /* Press+release survive a blocked render frame. */
    tick(180);HAL_ADC_ErrorCallback(active_adc);ADC1->DR=3999;ADC1_2_IRQHandler();ADC1_2_IRQHandler();
    lge_inputs_poll(&bank,181,1);assert(raw(0)==1111);
    tick(190);ADC1->DR=2001;ADC1_2_IRQHandler();ADC1->DR=2002;ADC1_2_IRQHandler();
    lge_inputs_poll(&bank,191,1);assert(raw(0)==2001&&raw(1)==2002);assert(lge_h7_input_faults>=2);
    GPIOF->IDR=0;tick(UINT32_MAX-10);tick(5);lge_inputs_poll(&bank,5,1);
    lge_input_value_t button;assert(lge_inputs_read(&bank,2,LGE_VALUE_BOOL,&button)&&!button.boolean);
    tick(10);lge_inputs_poll(&bank,10,5);assert(lge_inputs_read(&bank,2,LGE_VALUE_BOOL,&button)&&button.boolean);
    puts("Actual DK driver: ADC sequence publication, external-trigger timing, reserved peripheral ownership, GPIO debounce, tap latching and error resynchronization passed.");
}
