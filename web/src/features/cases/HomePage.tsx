import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderOpen, Plus } from 'lucide-react';
import { useCases } from '../../lib/queries';
import { Badge, Button, ErrorNotice, Loading } from '../../components/ui';
import { formatDate } from '../../lib/labels';
import { CaseForm } from './CaseForm';

export function HomePage() {
  const records = useCases();
  const [newCase, setNewCase] = useState(false);
  return (
    <div className="home-page">
      <div className="home-intro">
        <span className="home-mark">
          <FolderOpen size={28} strokeWidth={1.4} />
        </span>
        <h1>Da quale pratica partiamo?</h1>
        <p>Raccogli le fonti. Verifica i dati. Dai forma alla relazione.</p>
        <Button onClick={() => setNewCase(true)}>
          <Plus size={18} />
          Nuova pratica
        </Button>
      </div>
      <div className="home-cases">
        <div className="list-heading">
          <h2>Le tue pratiche</h2>
          <Link to="/library">
            Apri la libreria
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {records.isPending && <Loading />}
        <ErrorNotice
          error={records.error}
          retry={() => {
            void records.refetch();
          }}
        />
        {records.data?.pages.flat().map((record) => (
          <Link
            key={record.id}
            to={`/cases/${record.id}`}
            className="home-case-row"
          >
            <span className="row-icon">
              <FolderOpen size={19} />
            </span>
            <div>
              <strong>{record.title}</strong>
              <p>
                {record.internalReference || 'Senza riferimento interno'}
                <span>·</span>
                {formatDate(record.updatedAt)}
              </p>
            </div>
            <Badge value={record.status} />
            <ArrowUpRight size={18} />
          </Link>
        ))}
        {records.data?.pages[0]?.length === 0 && (
          <div className="home-empty">
            La prima pratica comincia da un titolo.
            <br />
            Potrai aggiungere documenti, estratti e verifiche mentre lavori.
          </div>
        )}
        {records.hasNextPage && (
          <Button
            variant="secondary"
            busy={records.isFetchingNextPage}
            onClick={() => {
              void records.fetchNextPage();
            }}
          >
            Carica altre pratiche
          </Button>
        )}
      </div>
      <CaseForm open={newCase} onClose={() => setNewCase(false)} />
    </div>
  );
}
