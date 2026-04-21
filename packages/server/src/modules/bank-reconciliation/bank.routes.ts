import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as ctrl from './bank.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/accounts', ctrl.listBankAccounts);
router.post('/accounts', ctrl.createBankAccount);

router.get('/statements', ctrl.listStatements);
router.post('/statements', ctrl.importStatement);
router.get('/statements/:statementId', ctrl.getStatement);
router.get('/statements/:statementId/summary', ctrl.getReconciliationSummary);
router.post('/statements/:statementId/auto-match', ctrl.autoMatch);

router.post('/match', ctrl.matchLine);
router.delete('/lines/:lineId/match', ctrl.unmatchLine);

export { router as bankRouter };
