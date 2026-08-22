import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mentorInsights, MENTOR_MIN_TRADES } from '../mentorInsights';
import { fixtureTenTrades } from './fixture';

describe('mentorInsights', () => {
  it('stays quiet without enough trades', () => {
    assert.deepEqual(
      mentorInsights(fixtureTenTrades().slice(0, MENTOR_MIN_TRADES - 1)),
      [],
    );
  });

  it('calls out revenge like the marketing line', () => {
    const findings = mentorInsights(fixtureTenTrades(), 'all', 1_800_000_000);
    const revenge = findings.find((f) => f.id.startsWith('tag-loss-revenge'));
    assert.ok(revenge, `expected revenge finding, got ${findings.map((f) => f.id).join(',')}`);
    assert.match(revenge.headline, /62%|100%|down/i);
    assert.match(revenge.headline, /revenge/i);
    assert.match(revenge.evidence, /40%/);
    assert.match(revenge.evidence, /76%/);
    assert.equal(revenge.severity, 'warn');
  });
});
