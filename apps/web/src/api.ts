export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(typeof data.message === 'string' ? data.message : `HTTP ${status}`);
  }
}

export async function api<T>(
  url: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { body: jsonBody, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  let body: BodyInit | undefined;
  if (jsonBody !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(jsonBody);
  }
  const requestInit: RequestInit = { ...requestOptions, headers, credentials: 'same-origin' };
  if (body !== undefined) requestInit.body = body;
  const response = await fetch(url, requestInit);
  if (!response.ok) {
    const data = await response
      .json()
      .then((value) => value as Record<string, unknown>)
      .catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, data);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function download(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function money(fen: number): string {
  const sign = fen < 0 ? '-' : '';
  const absolute = Math.abs(fen);
  return `${sign}¥${Math.floor(absolute / 100).toLocaleString('zh-CN')}.${String(absolute % 100).padStart(2, '0')}`;
}

export function shanghaiNowLocal(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

export function currentShanghaiMonth(): string {
  return shanghaiNowLocal().slice(0, 7);
}
