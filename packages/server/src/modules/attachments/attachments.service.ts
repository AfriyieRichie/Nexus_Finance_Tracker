import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// Metadata only — never select the (large) `data` column in list queries.
const META = {
  id: true, organisationId: true, entityType: true, entityId: true,
  fileName: true, fileSize: true, mimeType: true, uploadedBy: true, uploadedAt: true,
} as const;

export async function createAttachment(
  organisationId: string,
  userId: string,
  input: { entityType: string; entityId: string; fileName: string; fileSize: number; mimeType: string; data: Buffer },
) {
  return prisma.attachment.create({
    data: {
      organisationId,
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      storagePath: 'db',
      data: input.data,
      uploadedBy: userId,
    },
    select: META,
  });
}

export async function listAttachments(organisationId: string, entityType: string, entityId: string) {
  return prisma.attachment.findMany({
    where: { organisationId, entityType, entityId },
    select: META,
    orderBy: { uploadedAt: 'desc' },
  });
}

export async function getAttachmentFile(organisationId: string, id: string) {
  const a = await prisma.attachment.findFirst({ where: { id, organisationId } });
  if (!a || !a.data) throw new NotFoundError('Attachment');
  return a;
}

export async function deleteAttachment(organisationId: string, id: string) {
  const a = await prisma.attachment.findFirst({ where: { id, organisationId }, select: { id: true } });
  if (!a) throw new NotFoundError('Attachment');
  await prisma.attachment.delete({ where: { id } });
}
