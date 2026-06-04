import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, Trash2, FileText, Loader2 } from 'lucide-react';
import { listAttachments, uploadAttachment, deleteAttachment, openAttachment } from '@/services/attachments.service';
import { Button } from './button';
import { Dialog, DialogContent, DialogTrigger } from './dialog';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Attachments({
  organisationId,
  entityType,
  entityId,
  title = 'Supporting documents',
  readOnly = false,
}: {
  organisationId: string;
  entityType: string;
  entityId: string;
  title?: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = ['attachments', entityType, entityId];

  const { data: files = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listAttachments(organisationId, entityType, entityId),
    enabled: !!entityId,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(organisationId, entityType, entityId, file),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); if (inputRef.current) inputRef.current.value = ''; },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAttachment(organisationId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><Paperclip size={13} /> {title}</p>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }}
            />
            <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
              {upload.isPending ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Upload size={13} className="mr-1" />}
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        )}
      </div>

      {upload.isError && (
        <p className="text-[10px] text-destructive mb-1">
          {(upload.error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ?? 'Upload failed (max 15 MB).'}
        </p>
      )}

      {isLoading ? (
        <p className="text-[10px] text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{readOnly ? 'No documents attached to this transaction.' : 'No documents attached yet. Upload the invoice, receipt, or delivery note.'}</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1.5 bg-muted/30">
              <FileText size={13} className="text-muted-foreground shrink-0" />
              <button
                type="button"
                onClick={() => openAttachment(organisationId, f)}
                className="flex-1 text-left truncate text-primary hover:underline"
                title={f.fileName}
              >
                {f.fileName}
              </button>
              <span className="text-[10px] text-muted-foreground shrink-0">{humanSize(f.fileSize)}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove.mutate(f.id)}
                  disabled={remove.isPending}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Paperclip trigger → dialog with the attachments list for a record.
export function AttachmentsDialog({
  organisationId,
  entityType,
  entityId,
  label,
}: {
  organisationId: string;
  entityType: string;
  entityId: string;
  label: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Supporting documents">
          <Paperclip size={14} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" title={`Documents — ${label}`} description="Attach and view supporting documents (invoice, receipt, delivery note).">
        <Attachments organisationId={organisationId} entityType={entityType} entityId={entityId} title="Attached documents" />
      </DialogContent>
    </Dialog>
  );
}
