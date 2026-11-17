// Retry transient provider failures only; never log response bodies or credentials.
export async function requestModel(
  request: () => Promise<Response>,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt >= 2) {
      throw new Error(`Model HTTP ${response.status} after ${attempt + 1} attempt(s)`);
    }
    const header = response.headers.get('retry-after');
    const seconds = header === null ? NaN : Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
    const waitMs = Math.min(60000, Math.max(10000 * (attempt + 1), Number.isFinite(delay) ? delay : 0));
    await response.body?.cancel();
    console.warn(`Model HTTP ${response.status}; retry ${attempt + 1}/2 in ${Math.ceil(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
}
