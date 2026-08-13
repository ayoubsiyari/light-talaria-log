import { describe, expect, it } from 'vitest';
import { mergeBarsByTime } from '@/session/mergeBarsByTime';
import type { ChartBar } from '@/types/bar';

function bar(time: number): ChartBar {
  return { time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
}

describe('mergeBarsByTime', () => {
  it('keeps tip runway when left-pad history arrives', () => {
    const tip = [bar(100), bar(101), bar(102), bar(103)];
    const history = [bar(90), bar(91), bar(92)];
    const out = mergeBarsByTime(tip, history);
    expect(out.map((b) => b.time)).toEqual([90, 91, 92, 100, 101, 102, 103]);
  });

  it('does not drop newer tip when incoming window ends earlier', () => {
    const withRunway = [bar(100), bar(101), bar(102), bar(150), bar(151)];
    const leftPadOnly = [bar(80), bar(81), bar(100), bar(101), bar(102)];
    const out = mergeBarsByTime(withRunway, leftPadOnly);
    expect(out[out.length - 1]!.time).toBe(151);
    expect(out[0]!.time).toBe(80);
  });

  it('tip-biases the cap', () => {
    const existing = [bar(1), bar(2), bar(3)];
    const incoming = [bar(4), bar(5), bar(6)];
    const out = mergeBarsByTime(existing, incoming, 4);
    expect(out.map((b) => b.time)).toEqual([3, 4, 5, 6]);
  });
});
