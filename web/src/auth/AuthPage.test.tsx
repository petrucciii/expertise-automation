import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from './auth-context';
import { AuthPage } from './AuthPage';
import { ApiError } from '../lib/api-client';

function renderLogin(overrides: Partial<AuthState> = {}) {
  const auth: AuthState = {
    user: null,
    loading: false,
    error: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <AuthPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return auth;
}
describe('account forms', () => {
  it('uses labelled credentials and submits a login without browser persistence', async () => {
    const auth = renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email *'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password *'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: 'Accedi' }));
    expect(auth.signIn).toHaveBeenCalledWith(
      'owner@example.test',
      'synthetic-password',
    );
  });
  it('blocks mismatching registration passwords before calling the server', async () => {
    const auth = renderLogin();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    await user.type(screen.getByLabelText('Email *'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password *'), 'synthetic-password');
    await user.type(
      screen.getByLabelText('Ripeti la password *'),
      'different-password',
    );
    await user.click(screen.getByRole('button', { name: 'Crea account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le password non coincidono',
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('renders hostile validation errors as inert text', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(new ApiError(400, '<img src=x onerror=alert(1)>'));
    renderLogin({ signIn });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email *'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password *'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: 'Accedi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    );
    expect(document.querySelector('img')).toBeNull();
  });
});
