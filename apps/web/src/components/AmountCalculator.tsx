import { useEffect, useState } from 'react';
import { evaluateAmountExpression } from '../utils/calculator';

const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '⌫', '+'];

export function AmountCalculator({ initialValue, onConfirm, onClose }: { initialValue: string; onConfirm: (value: string) => void; onClose: () => void }) {
  const [expression, setExpression] = useState(initialValue || '');
  const [error, setError] = useState('');

  useEffect(() => setExpression(initialValue || ''), [initialValue]);

  function press(key: string) {
    setError('');
    if (key === '⌫') {
      setExpression((value) => value.slice(0, -1));
      return;
    }
    setExpression((value) => value + key);
  }

  function calculate() {
    try {
      setExpression(evaluateAmountExpression(expression));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '计算失败');
    }
  }

  function confirm() {
    try {
      const value = evaluateAmountExpression(expression || '0');
      onConfirm(value);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '计算失败');
    }
  }

  return <div className="calculator-popover" role="dialog" aria-label="金额计算器">
    <div className="calculator-display"><span>{expression || '0'}</span><button type="button" onClick={() => setExpression('')}>清空</button></div>
    {error && <div className="calculator-error">{error}</div>}
    <div className="calculator-grid">{keys.map((key) => <button key={key} type="button" className={['÷', '×', '-', '+'].includes(key) ? 'operator' : ''} onClick={() => press(key)}>{key}</button>)}</div>
    <div className="calculator-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="button" className="secondary" onClick={calculate}>=</button><button type="button" className="primary" onClick={confirm}>使用金额</button></div>
  </div>;
}
