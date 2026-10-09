import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api } from '../../lib/api';
import type { DocumentRecord } from '../../lib/types';
import { Button, ErrorNotice, Field, Modal } from '../../components/ui';

export function UploadForm({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded?: (document: DocumentRecord) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Carica un documento"
      description="Conserva l’originale nella tua libreria, poi collegalo a una pratica."
    >
      {open && <UploadFields onClose={onClose} onUploaded={onUploaded} />}
    </Modal>
  );
}
function UploadFields({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded?: (document: DocumentRecord) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.upload(file!),
    onSuccess: async (document) => {
      await cache.invalidateQueries({ queryKey: ['documents'] });
      onClose();
      onUploaded?.(document);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError(new Error('Scegli un file.'));
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(new Error('Il file deve contenere dati e non superare 10 MiB.'));
      return;
    }
    mutation.mutate();
  }
  return (
    <form onSubmit={submit}>
      <div className="upload-zone">
        <Upload size={26} strokeWidth={1.5} />
        <p>Seleziona un originale dal tuo computer.</p>
        <Field label="File" required>
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.tif,.tiff,.eml"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setError(null);
              }}
              required
            />
          )}
        </Field>
      </div>
      <p className="file-help">
        PDF, DOCX, XLSX, CSV, PNG, JPEG, TIFF a una pagina ed EML. Un file per
        caricamento, massimo 10 MiB. Se è già in libreria, riutilizzalo dalla
        lista.
      </p>
      <ErrorNotice error={error || mutation.error} />
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
          Carica documento
        </Button>
      </div>
    </form>
  );
}
