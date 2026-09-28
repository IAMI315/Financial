import { describe, expect, it } from 'vitest';
import { evaluateAmountExpression } from './calculator';

describe('evaluateAmountExpression', () => {
  it('calculates common expressions', () => {
    expect(evaluateAmountExpression('12.5+3.8')).toBe('16.30');
    expect(evaluateAmountExpression('20-6.25')).toBe('13.75');
    expect(evaluateAmountExpression('4×2.5')).toBe('10.00');
    expect(evaluateAmountExpression('10÷4')).toBe('2.50');
    expect(evaluateAmountExpression('2+3*4')).toBe('14.00');
  });

  it('rejects invalid expressions', () => {
    expect(() => evaluateAmountExpression('10/0')).toThrow('不能除以 0');
    expect(() => evaluateAmountExpression('12++3')).toThrow();
    expect(() => evaluateAmountExpression('abc')).toThrow();
  });
});
