import { describe, expect, it } from 'vitest';
import { formatRecentTransactionTime } from './displayTime';

describe('formatRecentTransactionTime', () => {
  it('formats today and yesterday', () => {
    expect(formatRecentTransactionTime('2026-09-28 14:21:00', '2026-09-28T20:00:00')).toBe('今天 14:21');
    expect(formatRecentTransactionTime('2026-09-27 19:32:00', '2026-09-28T20:00:00')).toBe('昨天 19:32');
  });

  it('formats earlier dates across month boundaries', () => {
    expect(formatRecentTransactionTime('2026-08-31 21:14:00', '2026-09-02T08:00:00')).toBe('08/31 21:14');
    expect(formatRecentTransactionTime('2026-09-26 21:14:00', '2026-09-28T08:00:00')).toBe('09/26 21:14');
  });
});
