import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as journalController from './journal.controller';

// Mounted at /api/v1/organisations/:organisationId/journals
export const journalRouter = Router({ mergeParams: true });

journalRouter.use(requireAuth);

// List & read
journalRouter.get('/', requireRole(UserRole.REPORT_VIEWER), journalController.listJournalEntries);
journalRouter.get('/:journalId', requireRole(UserRole.REPORT_VIEWER), journalController.getJournalEntry);

// Create & update (ACCOUNTANT and above)
journalRouter.post('/', requireRole(UserRole.ACCOUNTANT), journalController.createJournalEntry);
journalRouter.patch('/:journalId', requireRole(UserRole.ACCOUNTANT), journalController.updateJournalEntry);
journalRouter.delete('/:journalId', requireRole(UserRole.ACCOUNTANT), journalController.deleteJournalEntry);

// Lifecycle transitions
journalRouter.post(
  '/:journalId/submit',
  requireRole(UserRole.ACCOUNTANT),
  journalController.submitForApproval,
);

journalRouter.post(
  '/:journalId/approve',
  requireRole(UserRole.APPROVER),
  journalController.approveJournalEntry,
);

journalRouter.post(
  '/:journalId/reject',
  requireRole(UserRole.APPROVER),
  journalController.rejectJournalEntry,
);

journalRouter.post(
  '/:journalId/post',
  requireRole(UserRole.FINANCE_MANAGER),
  journalController.postJournalEntry,
);

// Reversal — Finance Manager and above (irreversible financial action)
journalRouter.post(
  '/:journalId/reverse',
  requireRole(UserRole.FINANCE_MANAGER),
  journalController.reverseJournalEntry,
);
