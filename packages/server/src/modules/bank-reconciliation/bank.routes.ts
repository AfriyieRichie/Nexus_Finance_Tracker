import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './bank.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/accounts', requireRole(UserRole.REPORT_VIEWER), ctrl.listBankAccounts);
router.post('/accounts', requireRole(UserRole.FINANCE_MANAGER), ctrl.createBankAccount);

router.get('/statements', requireRole(UserRole.REPORT_VIEWER), ctrl.listStatements);
router.post('/statements', requireRole(UserRole.FINANCE_MANAGER), ctrl.importStatement);
router.get('/statements/:statementId', requireRole(UserRole.REPORT_VIEWER), ctrl.getStatement);
router.get('/statements/:statementId/summary', requireRole(UserRole.REPORT_VIEWER), ctrl.getReconciliationSummary);
router.post('/statements/:statementId/auto-match', requireRole(UserRole.FINANCE_MANAGER), ctrl.autoMatch);

router.post('/match', requireRole(UserRole.FINANCE_MANAGER), ctrl.matchLine);
router.delete('/lines/:lineId/match', requireRole(UserRole.FINANCE_MANAGER), ctrl.unmatchLine);
router.post('/lines/:lineId/journal', requireRole(UserRole.FINANCE_MANAGER), ctrl.createJournalFromLine);

router.post('/statements/:statementId/confirm', requireRole(UserRole.FINANCE_MANAGER), ctrl.confirmReconciliation);

router.get('/accounts/:bankAccountId/unmatched-entries', requireRole(UserRole.REPORT_VIEWER), ctrl.getUnmatchedLedgerEntries);
router.post('/statements/:statementId/unlock', requireRole(UserRole.ORG_ADMIN), ctrl.unlockReconciliation);

router.get('/statements/:statementId/report', requireRole(UserRole.REPORT_VIEWER), ctrl.getReconciliationReport);

export { router as bankRouter };
