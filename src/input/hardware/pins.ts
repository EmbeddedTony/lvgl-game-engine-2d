/** Verified against ST UM3289 rev 4, table 22/27. This is the DK board pinout,
 * not a generic STM32 alternate-function picker. Keep display/debug/memory out. */
export const dkPinoutSource =
  'https://www.st.com/resource/en/user_manual/um3289-discovery-kit-with-stm32h7s7l8-mcu-stmicroelectronics.pdf';
export interface DkPin {
  id: string;
  label: string;
  connector: string;
  adc?: { instance: 1 | 2; channel: number };
  blocked?: string;
  note?: string;
  builtIn?: boolean;
}
export const dkPins: readonly DkPin[] = [
  { id: 'PC0', label: 'A0', connector: 'CN11 pin 1', adc: { instance: 1, channel: 10 } },
  { id: 'PC2', label: 'A1', connector: 'CN11 pin 2', adc: { instance: 1, channel: 12 } },
  { id: 'PC3', label: 'A2', connector: 'CN11 pin 3', adc: { instance: 1, channel: 13 } },
  { id: 'PF12', label: 'A3', connector: 'CN11 pin 4', adc: { instance: 1, channel: 6 } },
  {
    id: 'PF13',
    label: 'A4',
    connector: 'CN11 pin 5',
    adc: { instance: 2, channel: 2 },
    note: 'Factory routing: SB26 ON, SB27 OFF. A4 must not be rerouted to touch SDA/PB9.',
  },
  {
    id: 'PC1',
    label: 'A5',
    connector: 'CN11 pin 6',
    blocked: 'Shared Ethernet MDC / selectable I²C routing; use A0–A4.',
  },
  { id: 'PF1', label: 'D2', connector: 'CN14 pin 3' },
  { id: 'PD12', label: 'D3', connector: 'CN14 pin 4' },
  { id: 'PF2', label: 'D4', connector: 'CN14 pin 5' },
  { id: 'PD13', label: 'D5', connector: 'CN14 pin 6' },
  { id: 'PD15', label: 'D6', connector: 'CN14 pin 7' },
  { id: 'PF3', label: 'D7', connector: 'CN14 pin 8' },
  { id: 'PF4', label: 'D8', connector: 'CN15 pin 1' },
  { id: 'PF6', label: 'D9', connector: 'CN15 pin 2' },
  { id: 'PC13', label: 'Blue B2 button', connector: 'On board', builtIn: true },
  { id: 'PE7', label: 'D0', connector: 'CN14 pin 1', blocked: 'Shared UART7 / STMod+ module.' },
  { id: 'PE8', label: 'D1', connector: 'CN14 pin 2', blocked: 'Shared UART7 / STMod+ module.' },
  {
    id: 'PF8',
    label: 'D10',
    connector: 'CN15 pin 3',
    blocked: 'Shared SPI4 chip select / module.',
  },
  { id: 'PE14', label: 'D11', connector: 'CN15 pin 4', blocked: 'Shared SPI4 / STMod+ module.' },
  { id: 'PE13', label: 'D12', connector: 'CN15 pin 5', blocked: 'Shared SPI4 / STMod+ module.' },
  {
    id: 'PE12',
    label: 'D13',
    connector: 'CN15 pin 6',
    blocked: 'Shared SPI4 clock and board LED.',
  },
  {
    id: 'PB9',
    label: 'D14 · touch SDA',
    connector: 'CN15 pin 9',
    blocked: 'Required by the touchscreen I²C bus.',
  },
  {
    id: 'PB6',
    label: 'D15 · touch SCL',
    connector: 'CN15 pin 10',
    blocked: 'Required by the touchscreen I²C bus.',
  },
  { id: 'PD0', label: 'ST-LINK RX', connector: 'Reserved', blocked: 'Reserved for ST-LINK VCP.' },
  {
    id: 'PD1',
    label: 'ST-LINK TX',
    connector: 'Reserved',
    blocked: 'Reserved for live input monitoring.',
  },
  {
    id: 'PA13',
    label: 'SWDIO',
    connector: 'Reserved',
    blocked: 'Required to program and debug the board.',
  },
  {
    id: 'PA14',
    label: 'SWCLK',
    connector: 'Reserved',
    blocked: 'Required to program and debug the board.',
  },
];
export const dkPin = (id: string) => dkPins.find((p) => p.id === id);
export const pinLabel = (id: string) => {
  const p = dkPin(id);
  return p ? `${p.label} · ${p.id} · ${p.connector}` : id;
};
