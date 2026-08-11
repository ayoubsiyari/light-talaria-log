/**
 * Plot contrast helpers. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contrastOn,
  contrastPlotMuted,
  contrastPlotText,
  ensureContrastText,
  isLightColor,
  relativeLuminance,
} from '@/chart/contrast';

describe('contrast', () => {
  it('detects light vs dark backgrounds', () => {
    assert.equal(isLightColor('#ffffff'), true);
    assert.equal(isLightColor('#000000'), false);
    assert.equal(isLightColor('#131722'), false);
    assert.equal(isLightColor('#f4f4f5'), true);
  });

  it('picks readable plot text for white and black', () => {
    assert.equal(contrastPlotText('#ffffff'), '#18181b');
    assert.equal(contrastPlotMuted('#ffffff'), '#52525b');
    assert.equal(contrastPlotText('#000000'), '#f4f6fb');
    assert.equal(contrastPlotMuted('#131722'), '#8b95a8');
    assert.equal(contrastOn('#ffffff'), '#0a0a0a');
    assert.equal(contrastOn('#1e3a8a'), '#ffffff');
  });

  it('replaces washed-out foreground against the plot bg', () => {
    // Dark-theme muted on white plot → force dark muted
    assert.equal(ensureContrastText('#8b95a8', '#ffffff', 'muted'), '#52525b');
    assert.equal(ensureContrastText('#f4f6fb', '#ffffff', 'text'), '#18181b');
    // Already contrasty — keep
    assert.equal(ensureContrastText('#18181b', '#ffffff', 'text'), '#18181b');
    assert.equal(ensureContrastText('#f4f6fb', '#000000', 'text'), '#f4f6fb');
  });

  it('parses rgb() backgrounds', () => {
    const lum = relativeLuminance('rgb(255, 255, 255)');
    assert.ok(lum != null && lum > 0.9);
  });
});
