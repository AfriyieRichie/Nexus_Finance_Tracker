import { api } from './api';

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
}

export async function listAttachments(organisationId: string, entityType: string, entityId: string) {
  const res = await api.get(`/organisations/${organisationId}/attachments`, { params: { entityType, entityId } });
  return res.data.data as Attachment[];
}

export async function uploadAttachment(organisationId: string, entityType: string, entityId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('entityType', entityType);
  fd.append('entityId', entityId);
  // Unset the JSON default so the browser sets multipart/form-data with a boundary.
  const res = await api.post(`/organisations/${organisationId}/attachments`, fd, {
    headers: { 'Content-Type': undefined } as never,
  });
  return res.data.data as Attachment;
}

export async function deleteAttachment(organisationId: string, id: string) {
  await api.delete(`/organisations/${organisationId}/attachments/${id}`);
}

// Fetches the file (with auth) and opens it in a new tab.
export async function openAttachment(organisationId: string, att: Attachment) {
  const res = await api.get(`/organisations/${organisationId}/attachments/${att.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
