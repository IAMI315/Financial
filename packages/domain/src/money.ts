const cnyInputPattern = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;
const maxSafeFen = BigInt(Number.MAX_SAFE_INTEGER);

export function parseCnyToFen(input: string): number {
  const normalized = input.trim();
  const match = cnyInputPattern.exec(normalized);

  if (!match) {
    throw new RangeError('金额必须是最多两位小数的非负十进制数');
  }

  const [yuanPart, decimalPart = ''] = normalized.split('.');
  if (yuanPart === undefined) {
    throw new RangeError('金额格式无效');
  }

  const fenPart = decimalPart.padEnd(2, '0');
  const fen = BigInt(yuanPart) * 100n + BigInt(fenPart || '0');

  if (fen <= 0n) {
    throw new RangeError('金额必须大于 0');
  }

  if (fen > maxSafeFen) {
    throw new RangeError('金额超出安全范围');
  }

  return Number(fen);
}

export function formatFenToCny(fen: number): string {
  if (!Number.isSafeInteger(fen) || fen < 0) {
    throw new RangeError('分值必须是非负安全整数');
  }

  const yuan = Math.floor(fen / 100);
  const remainder = fen % 100;
  return `${yuan}.${remainder.toString().padStart(2, '0')}`;
}

export function assertPositiveFen(fen: number): void {
  if (!Number.isSafeInteger(fen) || fen <= 0) {
    throw new RangeError('金额必须是大于 0 的安全整数分值');
  }
}
