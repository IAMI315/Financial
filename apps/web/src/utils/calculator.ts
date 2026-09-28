const operators = new Set(['+', '-', '*', '/']);

function normalize(expression: string): string {
  return expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
}

function tokenize(expression: string): Array<number | string> {
  const source = normalize(expression);
  if (!source) throw new Error('请输入表达式');
  const tokens: Array<number | string> = [];
  let number = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (/\d|\./.test(char)) {
      number += char;
      continue;
    }
    if (!operators.has(char)) throw new Error('表达式包含无效字符');
    if (number) {
      const value = Number(number);
      if (!Number.isFinite(value)) throw new Error('数字格式无效');
      tokens.push(value);
      number = '';
    } else if (char === '-' && (tokens.length === 0 || typeof tokens[tokens.length - 1] === 'string')) {
      number = '-';
      continue;
    } else {
      throw new Error('运算符位置无效');
    }
    tokens.push(char);
  }
  if (number) {
    const value = Number(number);
    if (!Number.isFinite(value)) throw new Error('数字格式无效');
    tokens.push(value);
  }
  if (typeof tokens[tokens.length - 1] === 'string') throw new Error('表达式不完整');
  return tokens;
}

function apply(left: number, operator: string, right: number): number {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*') return left * right;
  if (right === 0) throw new Error('不能除以 0');
  return left / right;
}

export function evaluateAmountExpression(expression: string): string {
  const tokens = tokenize(expression);
  const compact: Array<number | string> = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === '*' || token === '/') {
      const left = compact.pop();
      const right = tokens[index + 1];
      if (typeof left !== 'number' || typeof right !== 'number') throw new Error('表达式无效');
      compact.push(apply(left, token, right));
      index += 1;
    } else {
      compact.push(token);
    }
  }
  let result = compact[0];
  if (typeof result !== 'number') throw new Error('表达式无效');
  for (let index = 1; index < compact.length; index += 2) {
    const operator = compact[index];
    const right = compact[index + 1];
    if (typeof operator !== 'string' || typeof right !== 'number') throw new Error('表达式无效');
    result = apply(result, operator, right);
  }
  if (!Number.isFinite(result) || result < 0) throw new Error('金额结果无效');
  return result.toFixed(2);
}
