import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckSquare, Pencil, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { checklistStatuses, displayValue } from '../../lib/labels';
import { useInvalidateCase } from '../../lib/queries';
import type { CaseIssue, ChecklistStatus, IssueInput } from '../../lib/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  IconButton,
  Modal,
  PageTitle,
} from '../../components/ui';
import { useCase } from '../cases/case-context';

export default function ChecksPage() {
  const record = useCase();
  const [editing, setEditing] = useState<CaseIssue | 'new' | null>(null);
  return (
    <div className="page-container">
      <PageTitle
        title="Verifiche"
        description="La checklist del perito: ciò che è stato verificato, resta aperto o non è applicabile."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Aggiungi verifica
          </Button>
        }
      />
      {record.issues.length === 0 && (
        <EmptyState
          icon={<CheckSquare size={28} />}
          title="Registra i controlli della pratica"
        >
          Collega le evidenze e indica chiaramente le verifiche che non puoi
          completare con le fonti disponibili.
        </EmptyState>
      )}
      <div className="record-list">
        {record.issues.map((issue) => (
          <article className="record-card" key={issue.id}>
            <div className="record-heading">
              <div>
                <h3>{issue.title}</h3>
                <div className="record-meta">
                  <Badge value={issue.status} />
                  {issue.severity && <span>Severità: {issue.severity}</span>}
                  {issue.ruleId && (
                    <span>
                      Regola: {issue.ruleId}
                      {issue.ruleVersion && ` · ${issue.ruleVersion}`}
                    </span>
                  )}
                </div>
              </div>
              <IconButton
                label={`Modifica verifica ${issue.title}`}
                onClick={() => setEditing(issue)}
              >
                <Pencil size={16} />
              </IconButton>
            </div>
            <p className="record-body">{issue.explanation}</p>
            {issue.suggestedCheck && (
              <p className="record-body">
                <strong>Controllo suggerito:</strong> {issue.suggestedCheck}
              </p>
            )}
            {issue.evidence.length > 0 && (
              <div className="record-meta">
                Evidenze collegate:{' '}
                {issue.evidence
                  .map(
                    (link) =>
                      record.evidence.find(
                        (item) => item.id === link.evidenceId,
                      )?.fieldKey || link.evidenceId,
                  )
                  .join(', ')}
              </div>
            )}
          </article>
        ))}
      </div>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={
          editing === 'new' ? 'Aggiungi una verifica' : 'Modifica la verifica'
        }
        description="I riferimenti a regole e versioni sono inseriti dal perito; non attivano verifiche legali automatiche."
        wide
      >
        {editing && (
          <IssueFields
            issue={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
function IssueFields({
  issue,
  onClose,
}: {
  issue?: CaseIssue;
  onClose: () => void;
}) {
  const record = useCase();
  const invalidate = useInvalidateCase(record.id);
  const [title, setTitle] = useState(issue?.title || '');
  const [explanation, setExplanation] = useState(issue?.explanation || '');
  const [status, setStatus] = useState<ChecklistStatus>(
    issue?.status || 'NOT_VERIFIABLE',
  );
  const [severity, setSeverity] = useState(issue?.severity || '');
  const [check, setCheck] = useState(issue?.suggestedCheck || '');
  const [rule, setRule] = useState(issue?.ruleId || '');
  const [version, setVersion] = useState(issue?.ruleVersion || '');
  const [evidenceIds, setEvidenceIds] = useState(
    issue?.evidence.map((link) => link.evidenceId) || [],
  );
  const mutation = useMutation({
    mutationFn: (body: IssueInput) =>
      issue
        ? api.updateIssue(record.id, issue.id, body)
        : api.addIssue(record.id, body),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      title: title.trim(),
      explanation: explanation.trim(),
      status,
      severity: severity.trim(),
      suggestedCheck: check.trim(),
      ...(rule.trim() ? { ruleId: rule.trim() } : {}),
      ...(version.trim() ? { ruleVersion: version.trim() } : {}),
      evidenceIds,
    });
  }
  return (
    <form onSubmit={submit}>
      <Field label="Titolo della verifica" required>
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={240}
            pattern=".*\S.*"
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Esito">
          {(id) => (
            <select
              id={id}
              value={status}
              onChange={(e) => setStatus(e.target.value as ChecklistStatus)}
            >
              {Object.entries(checklistStatuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Severità">
          {(id) => (
            <input
              id={id}
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              maxLength={40}
            />
          )}
        </Field>
      </div>
      <Field label="Spiegazione" required>
        {(id) => (
          <textarea
            id={id}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            required
            rows={4}
            maxLength={8000}
          />
        )}
      </Field>
      <Field label="Controllo suggerito">
        {(id) => (
          <textarea
            id={id}
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            rows={2}
            maxLength={4000}
          />
        )}
      </Field>
      <div className="form-grid">
        <Field label="Riferimento della regola">
          {(id) => (
            <input
              id={id}
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              maxLength={120}
              readOnly={Boolean(issue)}
            />
          )}
        </Field>
        <Field label="Versione della regola">
          {(id) => (
            <input
              id={id}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              maxLength={80}
              readOnly={Boolean(issue)}
            />
          )}
        </Field>
      </div>
      {record.evidence.length > 0 && (
        <fieldset className="source-fieldset">
          <legend>Evidenze collegate</legend>
          <div className="check-option-list">
            {record.evidence.map((item) => (
              <label key={item.id} className="check-option">
                <input
                  type="checkbox"
                  checked={evidenceIds.includes(item.id)}
                  disabled={
                    !evidenceIds.includes(item.id) && evidenceIds.length >= 100
                  }
                  onChange={(event) =>
                    setEvidenceIds(
                      event.target.checked
                        ? [...evidenceIds, item.id]
                        : evidenceIds.filter((id) => id !== item.id),
                    )
                  }
                />
                <span>
                  {item.fieldKey}
                  <small>{displayValue(item.value)}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <ErrorNotice error={mutation.error} />
      <div className="form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Annulla
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          {issue ? 'Salva verifica' : 'Registra verifica'}
        </Button>
      </div>
    </form>
  );
}
