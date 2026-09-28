import { describe, expect, it } from 'vitest';
import { buildMonthDailySeries, niceMax } from './chart';

describe('chart helpers', () => {
  it('fills every day in the selected month', () => {
    const result = buildMonthDailySeries(
      '2026-02',
      [{ date: '2026-02-02', amountFen: 1000 }],
      [{ date: '2026-02-28', amountFen: 500 }],
    );
    expect(result).toHaveLength(28);
    expect(result[0]).toEqual({ date: '2026-02-01', day: 1, incomeFen: 0, expenseFen: 0 });
    expect(result[1]?.incomeFen).toBe(1000);
    expect(result[27]?.expenseFen).toBe(500);
  });

  it('uses readable axis maxima', () => {
    expect(niceMax(347)).toBe(400);
    expect(niceMax(612)).toBe(800);
    expect(niceMax(1680)).toBe(2000);
    expect(niceMax(0)).toBe(100);
  });
});
