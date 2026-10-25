/* Host-only peripheral seam. Production uses the real ST HAL, separately
 * compiled by the M7 build. These stubs exercise the actual board driver. */
#ifndef TEST_HW_HAL_H
#define TEST_HW_HAL_H
#include <stdint.h>
typedef struct { uint32_t IDR; } GPIO_TypeDef;
typedef struct { uint32_t CR1,CR2,PSC,ARR,EGR,SR,CNT,DIER; } TIM_TypeDef;
typedef struct { uint32_t CR,DR; } ADC_TypeDef;
extern GPIO_TypeDef test_c,test_d,test_f;
extern TIM_TypeDef test_timer;
extern ADC_TypeDef test_adc1,test_adc2;
#define GPIOC (&test_c)
#define GPIOD (&test_d)
#define GPIOF (&test_f)
#define TIM3 (&test_timer)
#define ADC1 (&test_adc1)
#define ADC2 (&test_adc2)
#define GPIO_PIN_0 1u
#define GPIO_PIN_1 2u
#define GPIO_PIN_2 4u
#define GPIO_PIN_13 (1u<<13)
#define GPIO_PIN_SET 1
#define GPIO_MODE_ANALOG 3u
#define GPIO_MODE_INPUT 0u
#define GPIO_NOPULL 0u
#define GPIO_PULLUP 1u
#define GPIO_PULLDOWN 2u
#define ADC_CR_ADEN 1u
#define TIM_SR_UIF 1u
#define TIM_CR1_CEN 1u
#define TIM_CR1_ARPE 128u
#define TIM_EGR_UG 1u
#define TIM_CR2_MMS_1 32u
#define TIM_DIER_UIE 1u
#define ADC1_2_IRQn 38
#define TIM3_IRQn 52
#define RCC_APB1_DIV1 1u
#define RCC_APB1_DIV2 2u
#define RCC_TIMPRES_DISABLE 0u
#define RCC_PERIPHCLK_ADC 1u
#define ADC_CLOCK_ASYNC_DIV16 16u
#define ADC_RESOLUTION_12B 12u
#define ADC_DATAALIGN_RIGHT 0u
#define ADC_SCAN_ENABLE 1u
#define ADC_EOC_SINGLE_CONV 1u
#define ADC_EXTERNALTRIG_T3_TRGO 3u
#define ADC_EXTERNALTRIGCONVEDGE_RISING 1u
#define ADC_SAMPLING_MODE_NORMAL 0u
#define ADC_CONVERSIONDATA_DR 0u
#define ADC_OVR_DATA_PRESERVED 1u
#define ADC_REGULAR_RANK_1 1u
#define ADC_REGULAR_RANK_2 2u
#define ADC_REGULAR_RANK_3 3u
#define ADC_REGULAR_RANK_4 4u
#define ADC_REGULAR_RANK_5 5u
#define ADC_SAMPLETIME_247CYCLES_5 247u
#define ADC_SINGLE_ENDED 0u
#define ADC_OFFSET_NONE 0u
#define ADC_CHANNEL_10 10u
#define ADC_CHANNEL_12 12u
#define HAL_OK 0
typedef struct {uint32_t Pin,Mode,Pull;} GPIO_InitTypeDef;
typedef struct {uint32_t APB1CLKDivider;} RCC_ClkInitTypeDef;
typedef struct {uint32_t ClockPrescaler,Resolution,DataAlign,ScanConvMode,EOCSelection,NbrOfConversion,ExternalTrigConv,ExternalTrigConvEdge,SamplingMode,ConversionDataManagement,Overrun;} ADC_InitTypeDef;
typedef struct {ADC_TypeDef *Instance;ADC_InitTypeDef Init;} ADC_HandleTypeDef;
typedef struct {uint32_t Channel,Rank,SamplingTime,SingleDiff,OffsetNumber;} ADC_ChannelConfTypeDef;
#define __HAL_RCC_ADC12_CLK_ENABLE() ((void)0)
#define __HAL_RCC_TIM3_CLK_ENABLE() ((void)0)
#define __HAL_RCC_GPIOC_CLK_ENABLE() ((void)0)
#define __HAL_RCC_GPIOD_CLK_ENABLE() ((void)0)
#define __HAL_RCC_GPIOF_CLK_ENABLE() ((void)0)
#define __HAL_RCC_GET_TIMCLKPRESCALER() 0u
#define __DMB() ((void)0)
uint32_t HAL_RCCEx_GetPeriphCLKFreq(uint32_t);
uint32_t HAL_RCC_GetPCLK1Freq(void);
void HAL_RCC_GetClockConfig(RCC_ClkInitTypeDef *,uint32_t *);
void HAL_GPIO_Init(GPIO_TypeDef *,GPIO_InitTypeDef *);
int HAL_GPIO_ReadPin(GPIO_TypeDef *,uint16_t);
uint32_t HAL_GetTick(void);
void HAL_NVIC_SetPriority(int,int,int);
void HAL_NVIC_ClearPendingIRQ(int);
void HAL_NVIC_EnableIRQ(int);
void HAL_NVIC_DisableIRQ(int);
int HAL_ADC_Init(ADC_HandleTypeDef *);
int HAL_ADC_ConfigChannel(ADC_HandleTypeDef *,ADC_ChannelConfTypeDef *);
int HAL_ADCEx_Calibration_Start(ADC_HandleTypeDef *,uint32_t);
int HAL_ADC_Start_IT(ADC_HandleTypeDef *);
uint32_t HAL_ADC_GetValue(ADC_HandleTypeDef *);
void HAL_ADC_IRQHandler(ADC_HandleTypeDef *);
#endif
