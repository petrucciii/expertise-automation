import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, downloadName, errorMessage } from './api-client';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const requestUrl = (input: RequestInfo | URL) =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('authenticated API transport', () => {
  it('keeps bearer tokens in memory and cookie credentials on the same API origin', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          accessToken: 'private-access-token',
          user: { id: 1, email: 'owner@example.test' },
        }),
      )
      .mockResolvedValueOnce(json({ id: 1 }));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const client = new ApiClient('/api', fetcher);
    await client.login('owner@example.test', 'synthetic-password');
    await client.request('/auth/me');
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Authorization'),
    ).toBe('Bearer private-access-token');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(storage).not.toHaveBeenCalled();
  });
  it('coordinates concurrent expired requests with exactly one cookie rotation', async () => {
    const refresh = deferred<Response>();
    let rotations = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, options) => {
      if (requestUrl(input).endsWith('/auth/login'))
        return json({
          accessToken: 'old',
          user: { id: 1, email: 'owner@example.test' },
        });
      if (requestUrl(input).endsWith('/auth/refresh')) {
        rotations += 1;
        return refresh.promise;
      }
      return new Headers(options?.headers).get('Authorization') ===
        'Bearer fresh'
        ? json({ ok: true })
        : json({ message: 'Unauthorized' }, 401);
    });
    const client = new ApiClient('/api', fetcher);
    await client.login('owner@example.test', 'synthetic-password');
    const first = client.request('/cases');
    const second = client.request('/documents');
    await vi.waitFor(() => expect(rotations).toBe(1));
    refresh.resolve(json({ accessToken: 'fresh' }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(rotations).toBe(1);
  });
  it('stops after one failed retry and clears the session instead of looping', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(json({}, 401));
    const client = new ApiClient('/api', fetcher);
    const invalidated = vi.fn();
    client.onUnauthorized(invalidated);
    await expect(client.request('/cases')).rejects.toMatchObject({
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(invalidated).toHaveBeenCalledOnce();
  });
  it('does not resurrect a session when a pending refresh finishes after logout', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      requestUrl(input).endsWith('/auth/refresh')
        ? pending.promise
        : new Response(null, { status: 204 }),
    );
    const client = new ApiClient('/api', fetcher);
    const refreshing = client.refresh();
    await client.logout();
    pending.resolve(json({ accessToken: 'late-token' }));
    await expect(refreshing).rejects.toThrow('Session changed');
  });
  it('rejects an in-flight response from the previous owner after the session changes', async () => {
    const pending = deferred<Response>();
    const client = new ApiClient(
      '/api',
      vi.fn<typeof fetch>().mockReturnValue(pending.promise),
    );
    const request = client.request('/cases');
    client.clearSession();
    pending.resolve(json([{ title: 'Previous owner data' }]));
    await expect(request).rejects.toThrow('Session changed');
  });
  it('uploads multipart with one file and lets the browser provide its boundary', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: 'doc' }));
    const client = new ApiClient('/api', fetcher);
    const form = new FormData();
    form.append('file', new File(['synthetic source'], 'cargo.csv'));
    await client.request('/documents/upload', { method: 'POST', body: form });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(form);
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('Content-Type'),
    ).toBe(false);
  });
  it('returns authenticated binary downloads and never parses a file as JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('original bytes', {
        headers: {
          'Content-Disposition': 'attachment; filename="original.csv"',
        },
      }),
    );
    const result = await new ApiClient('/api', fetcher).request<{
      blob: Blob;
      disposition: string;
    }>('/documents/id/download', { binary: true });
    expect(await result.blob.text()).toBe('original bytes');
    expect(result.disposition).toContain('original.csv');
  });
  it('preserves actionable validation details and handles non-JSON server errors', async () => {
    const client = new ApiClient(
      '/api',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          json({ message: ['field is required', 'unknown source'] }, 400),
        )
        .mockResolvedValueOnce(
          new Response('<script>malicious()</script>', { status: 502 }),
        ),
    );
    await expect(client.request('/cases')).rejects.toMatchObject({
      message: 'field is required · unknown source',
    });
    await expect(client.request('/cases')).rejects.toMatchObject({
      status: 502,
      message: 'HTTP 502',
    });
    expect(
      errorMessage(new ApiError(503, 'private upstream detail')),
    ).not.toContain('private upstream detail');
  });
  it.each([
    'https://user:secret@example.test/api',
    'javascript:alert(1)',
    'https://example.test/api?key=secret',
    'https://example.test/not-api',
  ])('rejects unsafe API configuration %s', (base) => {
    expect(() => new ApiClient(base)).toThrow();
  });
  it('normalizes download headers without accepting paths or control characters', () => {
    expect(
      downloadName(
        "attachment; filename*=UTF-8''relazione%20merci.docx",
        'fallback.docx',
      ),
    ).toBe('relazione merci.docx');
    const unsafe = downloadName(
      'attachment; filename="../evil\r\n.csv"',
      'fallback.csv',
    );
    expect(unsafe).not.toContain('/');
    expect(unsafe).not.toContain('\r');
    expect(unsafe).not.toContain('\n');
    expect(
      downloadName("attachment; filename*=UTF-8''bad%ZZ", 'fallback.csv'),
    ).toBe('fallback.csv');
  });
});
