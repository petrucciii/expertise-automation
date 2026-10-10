import { Component, type ReactNode } from 'react';
import { Button, EmptyState } from './ui';

/** Recover from a failed lazy import or render without exposing source data in an error page. */
export class RenderErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <main className="page-container">
          <EmptyState
            title="Non è stato possibile aprire il workspace"
            action={
              <Button onClick={() => window.location.reload()}>
                Ricarica l’app
              </Button>
            }
          >
            La pagina non è stata caricata correttamente. Ricarica per
            riprendere il lavoro; le modifiche già salvate rimangono
            disponibili.
          </EmptyState>
        </main>
      );
    return this.props.children;
  }
}
