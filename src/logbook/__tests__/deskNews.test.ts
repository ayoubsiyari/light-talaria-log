import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyNewsFilter,
  classifyDay,
  countryFlag,
  dayBounds,
  formatStat,
  normalizeEvents,
  parseFilter,
  parseImpact,
  type DeskNewsItem,
} from '../deskNews';

describe('deskNews', () => {
  it('maps unix times onto today and tomorrow in local time', () => {
    const now = new Date(2026, 7, 20, 15, 0, 0);
    const today = dayBounds(now, 'today');
    const tomorrow = dayBounds(now, 'tomorrow');
    assert.equal(classifyDay(today.start + 3600, now), 'today');
    assert.equal(classifyDay(tomorrow.start + 3600, now), 'tomorrow');
    assert.equal(classifyDay(today.start - 10, now), null);
  });

  it('filters by day, kind, and impact', () => {
    const items: DeskNewsItem[] = [
      {
        kind: 'headlines',
        id: 'h1',
        day: 'today',
        time: 1,
        title: 'A',
        source: 'X',
        url: '',
      },
      {
        kind: 'calendar',
        id: 'e1',
        day: 'tomorrow',
        time: 2,
        title: 'CPI',
        country: 'US',
        impact: 'high',
        actual: '—',
        estimate: '—',
        prev: '—',
        flag: '🇺🇸',
      },
      {
        kind: 'calendar',
        id: 'e2',
        day: 'tomorrow',
        time: 3,
        title: 'Speaks',
        country: 'EU',
        impact: 'low',
        actual: '—',
        estimate: '—',
        prev: '—',
        flag: '🇪🇺',
      },
    ];
    const out = applyNewsFilter(items, {
      category: 'forex',
      days: ['tomorrow'],
      kinds: ['calendar'],
      impact: ['high'],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 'e1');
  });

  it('formats stats and country flags', () => {
    assert.equal(formatStat(null), '—');
    assert.equal(formatStat(2.4), '2.4');
    assert.equal(countryFlag('US'), '🇺🇸');
    assert.equal(countryFlag('UK'), '🇬🇧');
    assert.equal(countryFlag('EU'), '🇪🇺');
    assert.equal(countryFlag('USD'), '🇺🇸');
    assert.equal(countryFlag('EUR'), '🇪🇺');
  });

  it('parses impact aliases and restores a sane filter', () => {
    assert.equal(parseImpact('HIGH'), 'high');
    assert.equal(parseImpact('med'), 'medium');
    const f = parseFilter({ category: 'nope', days: [], kinds: ['calendar'] });
    assert.equal(f.category, 'forex');
    assert.deepEqual(f.days, ['today', 'tomorrow']);
    assert.deepEqual(f.kinds, ['calendar']);
    assert.deepEqual(f.impact, ['high', 'medium']);
  });

  it('normalizes calendar prints with Act / Fcst / Prev', () => {
    const now = new Date(2026, 7, 20, 15, 0, 0);
    const start = dayBounds(now, 'today').start;
    const time = new Date((start + 8 * 3600) * 1000).toISOString();
    const [row] = normalizeEvents(
      [
        {
          title: 'Unemployment Claims',
          country: 'USD',
          date: time,
          impact: 'Medium',
          forecast: '210K',
          previous: '209K',
        },
      ],
      now,
    );
    assert.ok(row);
    assert.equal(row.kind, 'calendar');
    assert.equal(row.country, 'USD');
    assert.equal(row.impact, 'medium');
    assert.equal(row.actual, '—');
    assert.equal(row.estimate, '210K');
    assert.equal(row.prev, '209K');
    assert.equal(row.day, 'today');
  });
});
