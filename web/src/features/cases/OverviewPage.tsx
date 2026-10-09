import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Badge, Button, Notice, PageTitle } from '../../components/ui';
import { families, formatDate } from '../../lib/labels';
import { useCase } from './case-context';
import { CaseForm } from './CaseForm';

export default function OverviewPage() {
  const record = useCase();
  const [editing, setEditing] = useState(false);
  return (
    <div className="page-container">
      <PageTitle
        title="La pratica"
        description="Incarico, riferimenti e questioni da chiarire."
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={15} />
            Modifica pratica
          </Button>
        }
      />
      <div className="detail-grid">
        <section className="detail-block">
          <h3>Riferimenti</h3>
          <dl>
            <dt>Famiglia</dt>
            <dd>{families[record.caseFamily]}</dd>
            <dt>Riferimento interno</dt>
            <dd>{record.internalReference || 'Non inserito'}</dd>
            <dt>Riferimento pubblico</dt>
            <dd>{record.publicReference || 'Non inserito'}</dd>
            <dt>Stato</dt>
            <dd>
              <Badge value={record.status} />
            </dd>
            <dt>Ultimo aggiornamento</dt>
            <dd>{formatDate(record.updatedAt, true)}</dd>
          </dl>
        </section>
        <section className="detail-block">
          <h3>Incarico</h3>
          <dl>
            <dt>Committente</dt>
            <dd>{record.assignment?.client || 'Non inserito'}</dd>
            <dt>Attività richieste</dt>
            <dd>
              {record.assignment?.requestedScope?.length ? (
                <ul>
                  {record.assignment.requestedScope.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                'Non inserite'
              )}
            </dd>
            <dt>Limiti dell’incarico</dt>
            <dd>
              {record.assignment?.limitations?.length ? (
                <ul>
                  {record.assignment.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                'Non inseriti'
              )}
            </dd>
          </dl>
        </section>
        <section className="detail-block">
          <h3>Questioni aperte</h3>
          {record.openQuestions.length ? (
            <ul>
              {record.openQuestions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              Nessuna domanda registrata. Aggiungi ciò che resta da verificare.
            </p>
          )}
        </section>
        <section className="detail-block">
          <h3>Continua il lavoro</h3>
          <div className="record-list">
            <Link className="text-button" to="../sources">
              {record.documents.length} fonti nel registro
            </Link>
            <Link className="text-button" to="../evidence">
              {record.evidence.length} evidenze registrate
            </Link>
            <Link className="text-button" to="../timeline">
              {record.events.length} eventi nella cronologia
            </Link>
            <Link className="text-button" to="../checks">
              {record.issues.length} verifiche nella checklist
            </Link>
            <Link className="text-button" to="../results">
              Apri i quattro risultati
            </Link>
          </div>
        </section>
      </div>
      <Notice>
        I dati dell’incarico descrivono il lavoro richiesto. Registra quantità,
        soggetti e danni tra le evidenze, con stato e fonte.
      </Notice>
      <CaseForm
        record={record}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}
