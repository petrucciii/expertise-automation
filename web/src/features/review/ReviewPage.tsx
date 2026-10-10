import { useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useInvalidateCase } from '../../lib/queries';
import { displayValue, formatDate, sourceName } from '../../lib/labels';
import type { Proposal } from '../../lib/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  Loading,
  Notice,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { DocumentReader } from '../documents/DocumentReader';

export default function ReviewPage() {
  const record = useCase();
  const query = useInfiniteQuery({
    queryKey: ['proposals', record.id],
    queryFn: ({ pageParam }) => api.proposals(record.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.length === 50 && offset < 100000 ? offset + 50 : undefined,
  });
  return (
    <div className="page-container">
      <PageTitle
        title="Proposte da rivedere"
        description="Controlla ogni suggerimento e la sua fonte prima di registrarlo nella pratica."
      />
      <ErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.isPending && <Loading />}
      {query.data?.pages[0]?.length === 0 && (
        <EmptyState
          icon={<ClipboardCheck size={28} />}
          title="Le proposte arrivano dalle fonti"
          action={
            <Link className="button button-secondary" to="../sources">
              Apri le fonti
            </Link>
          }
        >
          Scegli una fonte accessibile e chiedi di proporre fatti ed eventi.
        </EmptyState>
      )}
      {query.data?.pages.flat().map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          caseId={record.id}
        />
      ))}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          busy={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Carica altre proposte
        </Button>
      )}
    </div>
  );
}
function ProposalCard({
  proposal,
  caseId,
}: {
  proposal: Proposal;
  caseId: string;
}) {
  const record = useCase();
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reader, setReader] = useState(false);
  const invalidate = useInvalidateCase(caseId);
  const accept = useMutation({
    mutationFn: () => api.accept(caseId, proposal.id, selected),
    onSuccess: async () => {
      setSelected([]);
      await invalidate();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.reject(caseId, proposal.id),
    onSuccess: async () => {
      setRejecting(false);
      await invalidate();
    },
  });
  const source =
    record.documents.find((item) => item.id === proposal.caseDocumentId) ||
    proposal.caseDocument;
  const pending = proposal.status === 'PENDING';
  const editable = pending && !accept.isPending && !reject.isPending;
  return (
    <article className="proposal-card">
      <div className="record-heading">
        <div>
          <h3>
            {source?.sourceCode || 'Fonte'} ·{' '}
            {source ? sourceName(source) : proposal.documentType}
          </h3>
          <p>
            {formatDate(proposal.createdAt, true)} · {proposal.documentType}
          </p>
        </div>
        <Badge value={proposal.status} />
      </div>
      <div className="record-meta">
        <Button variant="ghost" onClick={() => setReader(true)}>
          Apri la fonte
        </Button>
        {pending && (
          <Button
            variant="ghost"
            onClick={() =>
              setSelected(
                proposal.suggestions
                  .filter((item) => item.status === 'PENDING')
                  .slice(0, 100)
                  .map((item) => item.id),
              )
            }
            disabled={!editable}
          >
            {proposal.suggestions.filter((item) => item.status === 'PENDING')
              .length > 100
              ? 'Seleziona primi 100'
              : 'Seleziona tutti'}
          </Button>
        )}
        {selected.length > 0 && (
          <Button
            variant="ghost"
            disabled={!editable}
            onClick={() => setSelected([])}
          >
            Deseleziona
          </Button>
        )}
      </div>
      {proposal.suggestions.map((suggestion) => (
        <div className="suggestion" key={suggestion.id}>
          {pending && (
            <input
              type="checkbox"
              aria-label={`Seleziona ${suggestion.content.fieldKey || suggestion.content.event || 'descrizione immagine'}`}
              checked={selected.includes(suggestion.id)}
              disabled={
                !editable ||
                suggestion.status !== 'PENDING' ||
                (!selected.includes(suggestion.id) && selected.length >= 100)
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, suggestion.id]
                    : selected.filter((id) => id !== suggestion.id),
                )
              }
            />
          )}
          <div className="suggestion-content">
            <strong>
              {suggestion.kind === 'FACT'
                ? suggestion.content.fieldKey
                : suggestion.kind === 'EVENT'
                  ? 'Evento proposto'
                  : 'Descrizione immagine'}
            </strong>
            <div className="suggestion-value">
              {suggestion.kind === 'FACT'
                ? `${displayValue(suggestion.content.numericValue ?? suggestion.content.valueText)}${suggestion.content.unit ? ` ${suggestion.content.unit}` : ''}`
                : suggestion.content.event || suggestion.content.description}
            </div>
            <div className="record-meta">
              {suggestion.content.epistemicStatus && (
                <Badge value={suggestion.content.epistemicStatus} />
              )}
              {!pending && <Badge value={suggestion.status} />}
              {suggestion.content.attribution && (
                <span>Attribuito a {suggestion.content.attribution}</span>
              )}
              {suggestion.content.comparisonGroup && (
                <span>Gruppo: {suggestion.content.comparisonGroup}</span>
              )}
              {suggestion.content.date && (
                <span>{formatDate(suggestion.content.date)}</span>
              )}
              {suggestion.content.pageNumber && (
                <span>Pagina {suggestion.content.pageNumber}</span>
              )}
            </div>
            {suggestion.content.excerpt && (
              <blockquote>{suggestion.content.excerpt}</blockquote>
            )}
            {suggestion.kind === 'IMAGE_DESCRIPTION' && (
              <p className="field-help">
                L’accettazione registra la revisione della descrizione, senza
                creare un fatto o un’osservazione.
              </p>
            )}
          </div>
        </div>
      ))}
      {proposal.suggestions.length === 0 && (
        <Notice>Nessun suggerimento è stato prodotto per questa fonte.</Notice>
      )}
      {proposal.openQuestions.length > 0 && (
        <div className="record-body">
          <h3>Domande suggerite</h3>
          <ul>
            {proposal.openQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      )}
      <ErrorNotice error={accept.error} />
      {pending && (
        <p className="field-help">
          Puoi accettare fino a 100 suggerimenti per volta. I restanti rimangono
          da rivedere.
        </p>
      )}
      {pending && (
        <div className="proposal-footer">
          <span className="muted small">
            {selected.length} suggerimenti selezionati
          </span>
          <div className="proposal-buttons">
            <Button
              variant="secondary"
              disabled={!editable}
              onClick={() => {
                reject.reset();
                setRejecting(true);
              }}
            >
              <X size={15} />
              Rifiuta proposta
            </Button>
            <Button
              busy={accept.isPending}
              disabled={!selected.length || reject.isPending}
              onClick={() => accept.mutate()}
            >
              <Check size={15} />
              Accetta selezionati
            </Button>
          </div>
        </div>
      )}
      <DocumentReader
        source={source}
        open={reader}
        onClose={() => setReader(false)}
      />
      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Rifiutare questa proposta?"
        confirmLabel="Rifiuta proposta"
        busy={reject.isPending}
        error={reject.error}
        onConfirm={() => reject.mutate()}
      >
        Nessun suggerimento della proposta verrà registrato nelle evidenze o
        nella cronologia. Puoi richiedere una nuova estrazione dalla fonte.
      </ConfirmDialog>
    </article>
  );
}
