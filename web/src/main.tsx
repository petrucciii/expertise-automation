import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { ApiError } from './lib/api-client';
import './index.css';
import App from './App';

const cache = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) =>
        count < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
