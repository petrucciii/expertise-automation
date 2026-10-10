import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Check,
  Download,
  Eye,
  History,
  Pencil,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useInvalidateCase } from '../../lib/queries';
import { artifactLabels, artifactTypes, formatDate } from '../../lib/labels';
import { reportSections } from '../../lib/artifact-content';
import type { Artifact, ArtifactType } from '../../lib/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Notice,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';
import { ArtifactViewer } from './ArtifactViewer';
import { ArtifactEditor } from './ArtifactEditor';

export default function ResultsPage() {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const query = useQuery({
    queryKey: ['artifacts', record.id],
    queryFn: () => api.artifacts(record.id),
  });
  const generate = useMutation({
    mutationFn: () => api.generateAll(record.id),
    onSuccess: invalidate,
  });
  return (
    <div className="page-container">
      <PageTitle
        title="I quattro risultati"
        description="Versioni della pratica da leggere, rivedere, approvare ed esportare."
        action={
          <Button busy={generate.isPending} onClick={() => generate.mutate()}>
            <RefreshCw size={16} />
            Genera i quattro risultati
          </Button>
        }
      />
      <ErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      <ErrorNotice error={generate.error} />
      {query.isPending && <Loading />}
      {query.data?.some((item) => item.isStale) && (
        <Notice tone="warning">
          La pratica è cambiata. I risultati obsoleti vanno rigenerati prima
          dell’approvazione o dell’esportazione.
        </Notice>
      )}
      <div className="artifact-grid">
        {artifactTypes.map((type) => (
          <ArtifactCard
            key={type}
            type={type}
            artifact={query.data?.find((item) => item.type === type)}
            disabled={generate.isPending}
          />
        ))}
      </div>
      <Notice>
        JSON e XLSX sono esportabili anche in bozza aggiornata. Le narrative
        DOCX richiedono l’approvazione del perito. Una nuova versione conserva
        le precedenti e richiede una nuova revisione.
      </Notice>
    </div>
  );
}
function ArtifactCard({
  type,
  artifact,
  disabled,
}: {
  type: ArtifactType;
  artifact?: Artifact;
  disabled: boolean;
}) {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [approving, setApproving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [target, setTarget] = useState('');
  const labels = artifactLabels[type];
  const narrative =
    type === 'PRELIMINARY_REVIEW' || type === 'SURVEY_REPORT_DRAFT';
  const current = useQuery({
    queryKey: ['latest', record.id, type, artifact?.id],
    queryFn: () => api.latestArtifact(record.id, type),
    enabled: open && Boolean(artifact),
    retry: false,
  });
  const generate = useMutation({
    mutationFn: (enhanced: boolean) =>
      api.generateArtifact(record.id, type, {
        enhanced,
        ...(enhanced && target ? { targetSection: target } : {}),
      }),
    onSuccess: async () => {
      setEnhancing(false);
      setEditing(null);
      await invalidate();
    },
  });
  const approve = useMutation({
    mutationFn: () => api.approve(record.id, artifact!.id),
    onSuccess: async () => {
      setApproving(false);
      await invalidate();
    },
  });
  const exportFile = useMutation({
    mutationFn: () => api.exportArtifact(record.id, type),
  });
  const busy = disabled || generate.isPending || approve.isPending;
  const editable = artifact && !artifact.isStale;
  const opened = current.data || artifact;
  return (
    <article className="artifact-card">
      <div className="artifact-heading">
        <span className="artifact-format">{labels.format}</span>
        <h3>{labels.name}</h3>
      </div>
      <p>{labels.description}</p>
      <div className="artifact-status">
        {artifact ? (
          <>
            <span>Versione {artifact.version}</span>
            <Badge value={artifact.status} />
            {artifact.isStale && <Badge value="STALE" label="Obsoleto" />}
          </>
        ) : (
          <span>Non ancora generato</span>
        )}
      </div>
      <div className="artifact-actions">
        <Button
          variant={artifact ? 'secondary' : 'primary'}
          busy={generate.isPending && !enhancing}
          disabled={busy}
          onClick={() => generate.mutate(false)}
        >
          <RefreshCw size={14} />
          {artifact ? 'Rigenera' : 'Genera'}
        </Button>
        {artifact && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Eye size={14} />
              Apri
            </Button>
            <Button variant="ghost" onClick={() => setHistory(true)}>
              <History size={14} />
              Versioni
            </Button>
            <Button
              variant="ghost"
              busy={exportFile.isPending}
              disabled={
                artifact.isStale ||
                (narrative && artifact.status !== 'APPROVED') ||
                busy
              }
              onClick={() => exportFile.mutate()}
            >
              <Download size={14} />
              Esporta {labels.format}
            </Button>
          </>
        )}
        {narrative && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              generate.reset();
              setTarget('');
              setEnhancing(true);
            }}
          >
            <Sparkles size={14} />
            Con suggerimenti AI
          </Button>
        )}
      </div>
      <ErrorNotice error={generate.error || exportFile.error} />
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={`${labels.name}${opened ? ` · v${opened.version}` : ''}`}
        description={
          opened
            ? `Revisione della pratica ${opened.caseRevision} · ${formatDate(opened.createdAt, true)}`
            : undefined
        }
        wide
      >
        {current.isPending && <Loading />}
        <ErrorNotice
          error={current.error}
          retry={() => {
            void current.refetch();
          }}
        />
        {opened && (
          <>
            {opened.isStale && (
              <Notice tone="warning">
                Questa versione è obsoleta. Puoi leggerla, ma devi rigenerare
                prima di modificarla, approvarla o esportarla.
              </Notice>
            )}
            {editing ? (
              <ArtifactEditor
                key={editing.id}
                artifact={editing}
                onSaved={() => {
                  setEditing(null);
                  void current.refetch();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <ArtifactViewer content={opened.content} />
                {narrative && (
                  <div className="form-actions">
                    <Button
                      variant="secondary"
                      disabled={!editable || busy}
                      onClick={() => setEditing(opened)}
                    >
                      <Pencil size={15} />
                      Modifica testo
                    </Button>
                    {opened.status !== 'APPROVED' && (
                      <Button
                        disabled={!editable || busy}
                        onClick={() => {
                          approve.reset();
                          setApproving(true);
                        }}
                      >
                        <Check size={15} />
                        Approva questa versione
                      </Button>
                    )}
                    {type === 'SURVEY_REPORT_DRAFT' && (
                      <Link
                        to={`../?section=${encodeURIComponent(reportSections(opened.content)[0]?.id || '')}`}
                        className="button button-ghost"
                        onClick={() => setOpen(false)}
                      >
                        Lavora in chat
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={history}
        onClose={() => setHistory(false)}
        title={`Versioni · ${labels.name}`}
        description="Le versioni precedenti rimangono consultabili. Approva ed esporta soltanto la versione corrente."
        wide
      >
        {history && <VersionsPanel caseId={record.id} type={type} />}
      </Modal>
      <ConfirmDialog
        open={approving}
        onClose={() => setApproving(false)}
        title={`Approvare ${labels.name.toLocaleLowerCase('it')}?`}
        confirmLabel="Approva versione"
        busy={approve.isPending}
        error={approve.error}
        onConfirm={() => approve.mutate()}
      >
        Conferma di aver verificato il testo e i riferimenti alle fonti.
        L’approvazione riguarda soltanto questa versione aggiornata; i
        suggerimenti AI restano identificati come proposte.
      </ConfirmDialog>
      <Modal
        open={enhancing}
        onClose={() => setEnhancing(false)}
        title={`Nuova versione · ${labels.name}`}
        description="Il testo manuale aggiornato viene conservato, con suggerimenti AI separati. Se la pratica è cambiata, il testo viene ricomposto dalle evidenze correnti. Ogni versione precedente resta nello storico."
      >
        {type === 'SURVEY_REPORT_DRAFT' && (
          <Field label="Sezione per i suggerimenti">
            {(id) => (
              <select
                id={id}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Tutte le sezioni</option>
                {artifact &&
                  reportSections(artifact.content).map((section) => (
                    <option value={section.id} key={section.id}>
                      {section.heading}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        )}
        <ErrorNotice error={generate.error} />
        <div className="form-actions">
          <Button
            variant="secondary"
            disabled={generate.isPending}
            onClick={() => setEnhancing(false)}
          >
            Annulla
          </Button>
          <Button
            busy={generate.isPending}
            onClick={() => generate.mutate(true)}
          >
            Genera con suggerimenti AI
          </Button>
        </div>
      </Modal>
    </article>
  );
}
function VersionsPanel({
  caseId,
  type,
}: {
  caseId: string;
  type: ArtifactType;
}) {
  const [selected, setSelected] = useState<Artifact | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['versions', caseId, type],
    queryFn: ({ pageParam }) => api.versions(caseId, type, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.length === 50 && offset < 100000 ? offset + 50 : undefined,
  });
  return (
    <>
      <ErrorNotice
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.isPending && <Loading />}
      {query.data?.pages.flat().map((version) => (
        <button
          key={version.id}
          type="button"
          className={`version-row ${version.id === selected?.id ? 'active' : ''}`}
          onClick={() => setSelected(version)}
        >
          <span>
            Versione {version.version}
            <small>
              {formatDate(version.createdAt, true)} · revisione pratica{' '}
              {version.caseRevision}
              {version.promptVersion?.startsWith('manual')
                ? ' · modificata dal perito'
                : ''}
            </small>
          </span>
          <span>
            <Badge value={version.status} />
            {version.isStale && <Badge value="STALE" label="Obsoleta" />}
          </span>
        </button>
      ))}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          busy={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Carica altre versioni
        </Button>
      )}
      {selected && (
        <div className="artifact-editor">
          <h3>Versione {selected.version} · sola lettura</h3>
          <ArtifactViewer content={selected.content} />
        </div>
      )}
    </>
  );
}
