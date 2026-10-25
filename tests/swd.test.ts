import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseArguments } from '../src/cli/arguments';

test('SWD CLI has explicit input/capture contracts and development build switches', () => {
  const parsed = parseArguments([
    'board',
    'input',
    '--build-report',
    '/tmp/build-report.json',
    '--serial',
    '1234ABCD5678',
    '--actions',
    'up,jump',
    '--duration-ms',
    '2500',
  ]);
  assert.equal(parsed.command, 'board.input');
  assert.deepEqual(parsed.params, {
    buildReport: '/tmp/build-report.json',
    serial: '1234ABCD5678',
    actions: 'up,jump',
    durationMs: 2500,
  });
  assert.equal(
    parseArguments(['build', '--debug-swd', '--output', '/tmp/build']).params
      .debugSwd,
    true,
  );
  assert.throws(
    () => parseArguments(['board', 'warp', '--address', '0x08000000']),
    /Unknown option/,
  );
});

test('PSRAM workaround selects linear XSPI1 reads before cache startup and rejects a changed vendor entry', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import ast
from pathlib import Path
script=ast.parse(Path('scripts/build-stm32h7s78.py').read_text())
fn=next(n for n in script.body if isinstance(n,ast.FunctionDef) and n.name=='prepare_psram_linear_reads')
scope={}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'builder','exec'),scope)
source='int main(void) {\\n  /* MPU Configuration--------------------------------------------------------*/\\n  MPU_Config();\\n  SCB_EnableDCache();\\n  MX_LTDC_Init();\\n}'
prepared=scope['prepare_psram_linear_reads'](source)
assert prepared.index('CLEAR_BIT(XSPI1->DCR2, XSPI_DCR2_WRAPSIZE)') < prepared.index('SCB_EnableDCache')
assert 'XSPI2' not in prepared and 'HAL_FLASH' not in prepared
assert 'PRESCALER' not in prepared and 'SCB_DisableDCache' not in prepared
assert 'if (XSPI1->SR & XSPI_SR_BUSY) Error_Handler()' in prepared
try: scope['prepare_psram_linear_reads']('unknown entry')
except RuntimeError: pass
else: raise AssertionError('Unknown startup accepted')
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});
