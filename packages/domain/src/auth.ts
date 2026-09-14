const usernamePattern = /^[A-Za-z0-9_]{3,32}$/;

export function isValidUsername(username: string): boolean {
  return usernamePattern.test(username);
}

export function normalizeUsername(username: string): string {
  if (!isValidUsername(username)) {
    throw new RangeError('用户名必须为 3～32 位英文字母、数字或下划线');
  }
  return username.toLowerCase();
}

export function isValidPasswordLength(password: string): boolean {
  return Array.from(password).length >= 7;
}

export function assertValidPasswordLength(password: string): void {
  if (!isValidPasswordLength(password)) {
    throw new RangeError('密码至少需要 7 个字符');
  }
}
