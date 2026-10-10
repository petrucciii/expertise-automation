import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/auth-context';
import { AuthPage } from './auth/AuthPage';
import { Shell } from './components/Shell';
import { RenderErrorBoundary } from './components/RenderErrorBoundary';
import { EmptyState, Loading } from './components/ui';
import { CaseLayout } from './features/cases/CaseLayout';
import { HomePage } from './features/cases/HomePage';

// Feature screens load on navigation; the initial chat shell stays small.
const OverviewPage = lazy(() => import('./features/cases/OverviewPage'));
const LibraryPage = lazy(() => import('./features/documents/LibraryPage'));
const SourcesPage = lazy(() => import('./features/documents/SourcesPage'));
const ReviewPage = lazy(() => import('./features/review/ReviewPage'));
const EvidencePage = lazy(() => import('./features/ledger/EvidencePage'));
const TimelinePage = lazy(() => import('./features/ledger/TimelinePage'));
const ChecksPage = lazy(() => import('./features/ledger/ChecksPage'));
const ChatPage = lazy(() => import('./features/chat/ChatPage'));
const ResultsPage = lazy(() => import('./features/artifacts/ResultsPage'));
const GuidePage = lazy(() => import('./features/guide/GuidePage'));

function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <Loading label="Ripristino della sessione…" />;
  if (!auth.user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  return <Outlet />;
}
export default function App() {
  return (
    <RenderErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="guide" element={<GuidePage />} />
              <Route path="cases/:caseId" element={<CaseLayout />}>
                <Route index element={<ChatPage />} />
                <Route path="chat/:chatId" element={<ChatPage />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="sources" element={<SourcesPage />} />
                <Route path="review" element={<ReviewPage />} />
                <Route path="evidence" element={<EvidencePage />} />
                <Route path="timeline" element={<TimelinePage />} />
                <Route path="checks" element={<ChecksPage />} />
                <Route path="results" element={<ResultsPage />} />
              </Route>
              <Route
                path="*"
                element={
                  <EmptyState
                    title="Pagina non trovata"
                    action={
                      <a className="button button-primary" href="/">
                        Apri le pratiche
                      </a>
                    }
                  >
                    Questo indirizzo non corrisponde a una pagina del workspace.
                  </EmptyState>
                }
              />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </RenderErrorBoundary>
  );
}
