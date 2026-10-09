import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from './auth-context';
import { Button, ErrorNotice, Field, Loading } from '../components/ui';

export function AuthPage() {
  const auth = useAuth();
  const location = useLocation();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const destination =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string' &&
    location.state.from.startsWith('/') &&
    !location.state.from.startsWith('//')
      ? location.state.from
      : '/';
  if (auth.loading)
    return (
      <div className="auth-page">
        <Loading label="Ripristino della sessione…" />
      </div>
    );
  if (auth.user) return <Navigate to={destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (register && password !== confirm) {
      setError(new Error('Le password non coincidono.'));
      return;
    }
    setBusy(true);
    try {
      await (register
        ? auth.signUp(email.trim(), password)
        : auth.signIn(email.trim(), password));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <a className="wordmark auth-wordmark" href="/">
        Expertise
        <span className="wordmark-dot" />
      </a>
      <div className="auth-card">
        <div className="auth-symbol">
          <ShieldCheck size={28} strokeWidth={1.5} />
        </div>
        <h1>{register ? 'Crea il tuo workspace' : 'Bentornato.'}</h1>
        <p className="auth-intro">
          {register
            ? 'Una pratica, tutte le fonti, il tuo lavoro.'
            : 'Riprendi il lavoro sulle tue pratiche.'}
        </p>
        <ErrorNotice
          error={auth.error}
          retry={() => {
            void auth.restore();
          }}
        />
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <Field label="Email" required>
            {(id) => (
              <input
                id={id}
                type="email"
                autoComplete="username"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>
          <Field
            label="Password"
            required
            help={register ? 'Da 12 a 128 caratteri.' : undefined}
          >
            {(id, helpId) => (
              <input
                id={id}
                aria-describedby={helpId}
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 12 : undefined}
                maxLength={register ? 128 : 4096}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            )}
          </Field>
          {register && (
            <Field label="Ripeti la password" required>
              {(id) => (
                <input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                />
              )}
            </Field>
          )}
          <ErrorNotice error={error} />
          <Button type="submit" busy={busy} className="full-width">
            {register ? 'Crea account' : 'Accedi'}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          {register ? 'Hai già un account?' : 'Non hai un account?'}{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError(null);
              setPassword('');
              setConfirm('');
            }}
          >
            {register ? 'Accedi' : 'Registrati'}
          </button>
        </p>
      </div>
      <p className="auth-footer">
        Fonti tracciabili. Revisione umana. Expertise.
      </p>
    </div>
  );
}
