import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, ErrorNotice, Loading } from '../../components/ui';
import { CaseContext } from './case-context';

export function CaseLayout() {
  const { caseId } = useParams();
  const location = useLocation();
  const query = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.case(caseId!),
    enabled: Boolean(caseId),
  });
  if (query.isPending) return <Loading label="Apertura della pratica…" />;
  if (query.isError)
    return (
      <div className="page-container">
        <ErrorNotice
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  const record = query.data;
  const tabs = [
    ['', 'Chat'],
    ['overview', 'Pratica'],
    ['sources', 'Fonti'],
    ['review', 'Proposte'],
    ['evidence', 'Evidenze'],
    ['timeline', 'Cronologia'],
    ['checks', 'Verifiche'],
    ['results', 'Risultati'],
  ] as const;
  return (
    <CaseContext.Provider value={record}>
      <div className="case-workspace">
        <div className="case-heading">
          <div>
            <div className="case-reference">
              {record.internalReference || 'Pratica'}
              <span>Revisione {record.revision}</span>
            </div>
            <h1>{record.title}</h1>
          </div>
          <div className="case-heading-actions">
            <Badge value={record.status} />
            <NavLink
              to="overview"
              className="icon-button"
              aria-label="Apri i dati della pratica"
            >
              <Settings2 size={18} />
            </NavLink>
          </div>
        </div>
        <nav className="case-tabs" aria-label="Funzionalità della pratica">
          {tabs.map(([path, label]) => (
            <NavLink
              key={path}
              to={path || '.'}
              end={path !== ''}
              className={({ isActive }) =>
                isActive &&
                (path !== '' ||
                  !location.pathname.match(
                    /\/(overview|sources|review|evidence|timeline|checks|results)$/,
                  ))
                  ? 'active'
                  : ''
              }
            >
              {label}
              {path === 'sources' && record.documents.length > 0 && (
                <span>{record.documents.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </CaseContext.Provider>
  );
}
