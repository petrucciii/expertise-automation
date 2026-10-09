import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ApiError, apiClient } from '../lib/api-client';
import { AuthContext } from './auth-context';
import type { User } from '../lib/types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const startup = useRef<Promise<void> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const clear = useCallback(() => {
    setUser(null);
    cache.clear();
  }, [cache]);
  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.refresh();
      const account = await api.me();
      cache.clear();
      setUser(account);
    } catch (cause) {
      clear();
      if (!(cause instanceof ApiError && cause.status === 401)) setError(cause);
    } finally {
      setLoading(false);
    }
  }, [cache, clear]);
  useEffect(() => {
    const unsubscribe = apiClient.onUnauthorized(clear);
    // StrictMode replays effects; the initial cookie must rotate only once.
    startup.current ??= restore();
    if (typeof BroadcastChannel !== 'undefined') {
      const connection = new BroadcastChannel('expertise-session');
      channel.current = connection;
      connection.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'signed-out') apiClient.clearSession();
        if (event.data === 'signed-in') {
          apiClient.clearSession();
          void restore();
        }
      };
    }
    return () => {
      unsubscribe();
      channel.current?.close();
      channel.current = null;
    };
  }, [clear, restore]);
  const signIn = async (email: string, password: string) => {
    const account = await apiClient.login(email, password);
    cache.clear();
    setError(null);
    setUser(account);
    channel.current?.postMessage('signed-in');
  };
  const signUp = async (email: string, password: string) => {
    await api.register(email, password);
    await signIn(email, password);
  };
  const signOut = async (everywhere = false) => {
    // Keep failures visible: a failed server revocation is not reported as a completed logout.
    await apiClient.logout(everywhere);
    clear();
    channel.current?.postMessage('signed-out');
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, error, signIn, signUp, signOut, restore }}
    >
      {children}
    </AuthContext.Provider>
  );
}
