export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(typeof data.message === 'string' ? data.message : `HTTP ${status}`);
  }
}

const GET_CACHE_TTL_MS = 10_000;
const getCache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlightGets = new Map<string, Promise<unknown>>();

export function clearApiCache(): void {
  getCache.clear();
}

export async function api<T>(
  url: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { body: jsonBody, ...requestOptions } = options;
  const method = (requestOptions.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' && jsonBody === undefined && requestOptions.signal == null;

  if (cacheable) {
    const cached = getCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (cached) getCache.delete(url);
    const pending = inFlightGets.get(url);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
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
    if (method !== 'GET' && method !== 'HEAD') clearApiCache();
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  })();

  if (!cacheable) return request;
  inFlightGets.set(url, request as Promise<unknown>);
  try {
    const value = await request;
    getCache.set(url, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value });
    return value;
  } finally {
    inFlightGets.delete(url);
  }
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
