const shanghaiDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const shanghaiOffsetMs = 8 * 60 * 60 * 1000;

export function shanghaiDateTimeToEpochMs(input: string): number {
  const match = shanghaiDateTimePattern.exec(input);
  if (!match) {
    throw new RangeError('交易时间必须使用 YYYY-MM-DDTHH:mm:ss 格式');
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const values = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = values;

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new RangeError('交易时间包含无效日期或时间');
  }

  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  utcDate.setUTCHours(hour, minute, second, 0);
  const localWallClockMs = utcDate.getTime();

  const roundTrip = new Date(localWallClockMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    throw new RangeError('交易时间包含不存在的日期');
  }

  return localWallClockMs - shanghaiOffsetMs;
}

export function epochMsToShanghaiDateTime(epochMs: number): string {
  if (!Number.isSafeInteger(epochMs)) {
    throw new RangeError('时间戳必须是安全整数毫秒值');
  }

  const date = new Date(epochMs + shanghaiOffsetMs);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function assertTransactionTimeNotFuture(input: string, now = new Date()): number {
  const epochMs = shanghaiDateTimeToEpochMs(input);
  if (epochMs > now.getTime()) {
    throw new RangeError('交易时间不能晚于当前时间');
  }
  return epochMs;
}
