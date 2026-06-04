import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import * as svc from './attachments.service';

const uploadSchema = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.string().uuid(),
});

const listSchema = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.string().uuid(),
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const file = req.file;
  if (!file) throw new ValidationError('No file uploaded (field name must be "file")');
  const { entityType, entityId } = uploadSchema.parse(req.body);

  const created = await svc.createAttachment(organisationId, req.user!.sub, {
    entityType: entityType.toUpperCase(),
    entityId,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    data: file.buffer,
  });
  return sendCreated(res, created, 'File uploaded');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { entityType, entityId } = listSchema.parse(req.query);
  return sendSuccess(res, await svc.listAttachments(organisationId, entityType.toUpperCase(), entityId));
});

export const download = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const a = await svc.getAttachmentFile(organisationId, id);
  res.setHeader('Content-Type', a.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.fileName)}"`);
  return res.send(Buffer.from(a.data!));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  await svc.deleteAttachment(organisationId, id);
  return sendSuccess(res, { id }, 'Attachment deleted');
});
