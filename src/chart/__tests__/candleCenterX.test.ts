/**
 * Candle X must stay continuous during camera moves (no per-frame pixel snap).
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

describe('drawSeries candle X', () => {
  it('does not pixel-round bar centers (vibration seam)', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, '../series/drawSeries.ts'), 'utf8');
    // Strip line comments so the explanatory note does not false-positive.
    const code = src.replace(/\/\/.*$/gm, '');
    assert.equal(
      /Math\.round\(\s*x\s*\)\s*\+\s*0\.5/.test(code),
      false,
      'candle xMid must not use Math.round(x)+0.5',
    );
    assert.equal(
      /Math\.round\(\s*indexToX/.test(code),
      false,
      'volume xMid must not Math.round(indexToX(...))',
    );
    assert.match(code, /const xMid = x;/);
  });
});
