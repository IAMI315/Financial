import { describe, expect, it } from 'vitest';
import {
  assertCategoryTypeMatchesParent,
  assertTransactionTimeNotFuture,
  epochMsToShanghaiDateTime,
  formatFenToCny,
  isValidPasswordLength,
  isValidUsername,
  normalizeUsername,
  parseCnyToFen,
  shanghaiDateTimeToEpochMs,
} from './index.js';

describe('money rules', () => {
  it('converts CNY input to integer fen without floating point rounding', () => {
    expect(parseCnyToFen('12')).toBe(1200);
    expect(parseCnyToFen('12.3')).toBe(1230);
    expect(parseCnyToFen('12.34')).toBe(1234);
    expect(formatFenToCny(1234)).toBe('12.34');
  });

  it('rejects zero, negative and more than two decimal places', () => {
    expect(() => parseCnyToFen('0')).toThrow();
    expect(() => parseCnyToFen('-1')).toThrow();
    expect(() => parseCnyToFen('12.345')).toThrow();
  });
});

describe('identity rules', () => {
  it('normalizes valid usernames case-insensitively', () => {
    expect(isValidUsername('Ye_Huang2026')).toBe(true);
    expect(normalizeUsername('Ye_Huang2026')).toBe('ye_huang2026');
    expect(isValidUsername('ab')).toBe(false);
  });

  it('requires at least seven unicode characters for passwords', () => {
    expect(isValidPasswordLength('1234567')).toBe(true);
    expect(isValidPasswordLength('123456')).toBe(false);
  });
});

describe('transaction time rules', () => {
  it('round-trips Asia/Shanghai wall-clock time through epoch milliseconds', () => {
    const input = '2026-09-13T23:08:32';
    const epoch = shanghaiDateTimeToEpochMs(input);
    expect(epochMsToShanghaiDateTime(epoch)).toBe(input);
  });

  it('rejects impossible and future transaction times', () => {
    expect(() => shanghaiDateTimeToEpochMs('2026-02-30T12:00:00')).toThrow();
    expect(() =>
      assertTransactionTimeNotFuture('2026-09-14T00:00:01', new Date('2026-09-13T16:00:00.000Z')),
    ).toThrow();
  });
});

describe('category rules', () => {
  it('requires child categories to keep the parent transaction type', () => {
    expect(() => assertCategoryTypeMatchesParent('expense', 'expense')).not.toThrow();
    expect(() => assertCategoryTypeMatchesParent('expense', 'income')).toThrow();
  });
});
