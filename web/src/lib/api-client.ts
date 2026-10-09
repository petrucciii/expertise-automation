import type { User } from './types';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
type SessionResponse = { accessToken: string; expiresIn: number; user?: User };
const defaultMessages: Record<number, string> = {
  400: 'Controlla i campi e i riferimenti alle fonti.',
  401: 'La sessione è scaduta. Accedi di nuovo.',
  403: 'Questo indirizzo del frontend non è autorizzato dal server.',
  404: 'La risorsa non è disponibile per questo account.',
  409: 'I dati sono cambiati o la risorsa esiste già. Aggiorna la pagina e riprova.',
  413: 'Il file o il contenuto supera il limite consentito.',
  429: 'Hai raggiunto il limite di richieste. Attendi un minuto e riprova.',
  503: 'L’assistente non è disponibile. Riprova tra poco; i dati della pratica sono conservati.',
};
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return `${defaultMessages[error.status] || 'Il server non ha completato la richiesta.'}${error.status === 400 || error.status === 409 ? ` ${error.message}` : ''}`;
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'La richiesta ha impiegato troppo tempo. Controlla il risultato prima di riprovare.';
  if (error instanceof Error && error.message === 'Session changed')
    return 'La sessione è cambiata. Accedi di nuovo.';
  return error instanceof Error && error.name !== 'TypeError'
    ? error.message
    : 'Impossibile raggiungere il server. Controlla la connessione e riprova.';
}
function validateBase(value: string): string {
  if (value === '/api') return value;
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, '') !== '/api'
  )
    throw new Error(
      'VITE_API_BASE must be /api or an HTTP(S) API URL ending in /api',
    );
  return value.replace(/\/$/, '');
}

export class ApiClient {
  private accessToken: string | null = null;
  private epoch = 0;
  private refreshing: Promise<void> | null = null;
  private unauthorizedListeners = new Set<() => void>();
  readonly base: string;
  private readonly fetcher: typeof fetch;
  constructor(
    base = '/api',
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.base = validateBase(base);
    this.fetcher = fetcher;
  }

  onUnauthorized(listener: () => void): () => void {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }
  clearSession(): void {
    this.epoch += 1;
    this.accessToken = null;
    this.unauthorizedListeners.forEach((listener) => listener());
  }
  // Web Locks serialize rotating HttpOnly cookies across tabs; tokens never enter browser storage.
  private async withCookieLock<T>(operation: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request('expertise-session-cookie', operation);
    return operation();
  }
  async login(email: string, password: string): Promise<User> {
    const generation = this.epoch;
    const result = await this.withCookieLock(() =>
      this.request<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      }),
    );
    if (generation !== this.epoch) throw new Error('Session changed');
    if (!result.user || typeof result.accessToken !== 'string')
      throw new Error('Invalid session response');
    this.accessToken = result.accessToken;
    return result.user;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.epoch;
    const operation = this.withCookieLock(async () => {
      const result = await this.request<SessionResponse>('/auth/refresh', {
        method: 'POST',
        auth: false,
      });
      if (generation !== this.epoch) throw new Error('Session changed');
      if (typeof result.accessToken !== 'string' || !result.accessToken)
        throw new Error('Invalid session response');
      this.accessToken = result.accessToken;
    });
    this.refreshing = operation;
    void operation
      .finally(() => {
        if (this.refreshing === operation) this.refreshing = null;
      })
      .catch(() => undefined);
    return operation;
  }
  async logout(everywhere = false): Promise<void> {
    await this.withCookieLock(() =>
      this.request<void>(everywhere ? '/auth/logout-all' : '/auth/logout', {
        method: 'POST',
        auth: everywhere,
      }),
    );
    this.clearSession();
  }
  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
      signal?: AbortSignal;
      binary?: boolean;
    } = {},
  ): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//'))
      throw new Error('Invalid API path');
    const generation = this.epoch;
    const token = this.accessToken;
    const auth = options.auth !== false;
    const headers = new Headers({
      Accept: options.binary ? '*/*' : 'application/json',
    });
    if (auth && token) headers.set('Authorization', `Bearer ${token}`);
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm)
      headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(`${this.base}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      redirect: 'error',
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(80_000)])
        : AbortSignal.timeout(80_000),
    });
    if (auth && generation !== this.epoch) throw new Error('Session changed');
    if (response.status === 401 && auth) {
      try {
        // A concurrent request may already have renewed this token.
        if (this.accessToken === token) await this.refresh();
        if (generation !== this.epoch) throw new Error('Session changed');
        return await this.requestWithoutRefresh<T>(path, options);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          this.clearSession();
        throw error;
      }
    }
    return this.readResponse<T>(response, options.binary === true);
  }
  private async requestWithoutRefresh<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      signal?: AbortSignal;
      binary?: boolean;
    },
  ): Promise<T> {
    const generation = this.epoch;
    const headers = new Headers({
      Accept: options.binary ? '*/*' : 'application/json',
    });
    if (this.accessToken)
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm)
      headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(`${this.base}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      redirect: 'error',
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(80_000)])
        : AbortSignal.timeout(80_000),
    });
    if (generation !== this.epoch) throw new Error('Session changed');
    return this.readResponse<T>(response, options.binary === true);
  }
  private async readResponse<T>(
    response: Response,
    binary: boolean,
  ): Promise<T> {
    if (!response.ok) {
      let message =
        defaultMessages[response.status] || `HTTP ${response.status}`;
      try {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null && 'message' in body) {
          const detail = body.message;
          if (typeof detail === 'string') message = detail.slice(0, 2000);
          else if (Array.isArray(detail))
            message = detail
              .filter((item): item is string => typeof item === 'string')
              .join(' · ')
              .slice(0, 2000);
        }
      } catch {
        /* An HTML proxy error is never rendered as HTML. */
      }
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    if (binary)
      return {
        blob: await response.blob(),
        disposition: response.headers.get('content-disposition'),
      } as T;
    return (await response.json()) as T;
  }
}
export const apiClient = new ApiClient(import.meta.env.VITE_API_BASE || '/api');

export function downloadName(
  disposition: string | null,
  fallback: string,
): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = disposition?.match(/filename="([^"]+)"/i)?.[1] || fallback;
  try {
    if (encoded) name = decodeURIComponent(encoded);
  } catch {
    /* Use the safe fallback for malformed legacy headers. */
  }
  return (
    name.replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]/gu, '_').slice(-240) || fallback
  );
}
export async function download(path: string, fallback: string): Promise<void> {
  const { blob, disposition } = await apiClient.request<{
    blob: Blob;
    disposition: string | null;
  }>(path, { binary: true });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName(disposition, fallback);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
