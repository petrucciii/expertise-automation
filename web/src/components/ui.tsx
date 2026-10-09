import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Check, FileText, LoaderCircle, X } from 'lucide-react';
import { errorMessage } from '../lib/api-client';
import {
  availabilities,
  caseStatuses,
  checklistStatuses,
  evidenceStatuses,
  extractionStatuses,
} from '../lib/labels';

export function Button({
  children,
  variant = 'primary',
  busy = false,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      type={props.type || 'button'}
      className={`icon-button ${props.className || ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  help,
  children,
  required,
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: (id: string, helpId?: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children(id, help ? `${id}-help` : undefined)}
      {help && (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      )}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog ${wide ? 'dialog-wide' : ''}`}>
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Chiudi">
                <X size={20} />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={description ? 'dialog-description' : 'sr-only'}
          >
            {description || title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <p>{errorMessage(error)}</p>
        {retry && (
          <Button variant="ghost" onClick={retry}>
            Riprova
          </Button>
        )}
      </div>
    </div>
  );
}
export function Notice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'success';
}) {
  return (
    <div className={`notice notice-${tone}`}>
      {tone === 'success' && <Check size={18} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label = 'Caricamento…' }: { label?: string }) {
  return (
    <output className="loading">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      {label}
    </output>
  );
}
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <FileText size={26} />}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function Badge({ value, label }: { value: string; label?: string }) {
  const labels: Record<string, string> = {
    ...availabilities,
    ...caseStatuses,
    ...checklistStatuses,
    ...evidenceStatuses,
    ...extractionStatuses,
    PENDING: 'Da rivedere',
    REVIEWED: 'Revisionata',
    REJECTED: 'Rifiutato',
    ACCEPTED: 'Accettato',
  };
  const tone = ['APPROVED', 'COMPLIANT', 'ACCEPTED', 'EXTRACTED'].includes(
    value,
  )
    ? 'success'
    : ['DISPUTED', 'ISSUE_FOUND', 'REJECTED'].includes(value)
      ? 'danger'
      : [
            'UNKNOWN',
            'NOT_VERIFIABLE',
            'NEEDS_REVIEW',
            'REFERENCED_NOT_ACCESSIBLE',
            'NOT_PROVIDED',
            'STALE',
          ].includes(value)
        ? 'warning'
        : 'neutral';
  return (
    <span className={`badge badge-${tone}`}>
      {label || labels[value] || value}
    </span>
  );
}
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  onConfirm,
  busy,
  error,
  confirmLabel = 'Conferma',
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
  error?: unknown;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
    >
      <p className="confirm-copy">{children}</p>
      <ErrorNotice error={error} />
      <div className="form-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Annulla
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          busy={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
