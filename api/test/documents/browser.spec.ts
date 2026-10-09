import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs/promises';

let dom: JSDOM | undefined;
afterEach(() => {
  dom?.window.close();
  vi.restoreAllMocks();
});

async function openHarness(documents: unknown[] = []) {
  const html = await fs.readFile(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  const script = await fs.readFile(
    new URL('./app.js', import.meta.url),
    'utf8',
  );
  dom = new JSDOM(html, {
    url: 'http://localhost:5173',
    runScripts: 'outside-only',
  });
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'memory-only-test-token' })),
    )
    .mockResolvedValue(new Response(JSON.stringify(documents)));
  dom.window.fetch = fetchMock;
  dom.window.eval(script);
  if (dom.window.document.readyState === 'loading')
    await new Promise<void>((resolve) =>
      dom!.window.addEventListener('DOMContentLoaded', () => resolve(), {
        once: true,
      }),
    );
  (dom.window.document.getElementById('email') as HTMLInputElement).value =
    'test@example.test';
  (dom.window.document.getElementById('password') as HTMLInputElement).value =
    'test-password';
  dom.window.document
    .getElementById('loginForm')!
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  return { window: dom.window, fetchMock };
}

describe('Authenticated document test page', () => {
  it('renders untrusted filenames as inert text and keeps the token out of persistent storage', async () => {
    const fileName = '<img src=x onerror="window.pwned=1"> cargo.csv';
    const { window, fetchMock } = await openHarness([
      {
        id: 'doc-test',
        fileName,
        mimeType: 'text/csv',
        created_at: '2026-09-08T10:00:00Z',
      },
    ]);
    await vi.waitFor(() =>
      expect(window.document.querySelector('tbody td')?.textContent).toBe(
        fileName,
      ),
    );
    expect(window.document.querySelector('tbody img')).toBeNull();
    expect(
      window.document.querySelector('tbody button')?.getAttribute('onclick'),
    ).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(
      (window.document.getElementById('password') as HTMLInputElement).value,
    ).toBe('');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer memory-only-test-token',
    });
  });

  it('downloads the binary response through an authorized fetch instead of expecting base64 JSON', async () => {
    const { window, fetchMock } = await openHarness([
      {
        id: 'doc-test',
        fileName: 'cargo.csv',
        mimeType: 'text/csv',
        created_at: '2026-09-08T10:00:00Z',
      },
    ]);
    const createUrl = vi.fn().mockReturnValue('blob:synthetic-test');
    window.URL.createObjectURL = createUrl;
    window.URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      new Response('container,pallets\nTEST,24\n', {
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
    await vi.waitFor(() =>
      expect(window.document.querySelector('tbody button')).not.toBeNull(),
    );
    (
      window.document.querySelector('tbody button') as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[2][0]).toBe(
      'http://localhost:3000/api/documents/doc-test/download',
    );
    expect(await (createUrl.mock.calls[0][0] as Blob).text()).toContain(
      'TEST,24',
    );
  });

  it('uploads only the file field and displays provider errors as safe text', async () => {
    const { window, fetchMock } = await openHarness();
    Object.defineProperty(
      window.document.getElementById('fileInput'),
      'files',
      {
        value: [
          new window.File(['a,b\n1,2'], 'test.csv', { type: 'text/csv' }),
        ],
      },
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: '<img src=x onerror=attack()>' }),
        { status: 503 },
      ),
    );
    window.document
      .getElementById('uploadForm')!
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      );
    await vi.waitFor(() =>
      expect(window.document.getElementById('statusMessage')?.textContent).toBe(
        '<img src=x onerror=attack()>',
      ),
    );
    const data = fetchMock.mock.calls[2][1]?.body as FormData;
    expect([...data.keys()]).toEqual(['file']);
    expect(window.document.querySelector('#statusMessage img')).toBeNull();
    expect(
      (window.document.getElementById('uploadBtn') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
