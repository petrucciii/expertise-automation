import { createContext, useContext } from 'react';
import type { User } from '../lib/types';

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: unknown;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  restore: () => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
