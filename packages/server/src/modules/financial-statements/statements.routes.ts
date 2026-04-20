import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import * as statementsController from './statements.controller';

export const statementsRouter = Router({ mergeParams: true });

statementsRouter.use(requireAuth);

// All financial statements require at minimum REPORT_VIEWER role
statementsRouter.get(
  '/balance-sheet',
  requireRole(UserRole.REPORT_VIEWER),
  statementsController.getBalanceSheet,
);

statementsRouter.get(
  '/income-statement',
  requireRole(UserRole.REPORT_VIEWER),
  statementsController.getIncomeStatement,
);

statementsRouter.get(
  '/cash-flow',
  requireRole(UserRole.REPORT_VIEWER),
  statementsController.getCashFlowStatement,
);

statementsRouter.get(
  '/changes-in-equity',
  requireRole(UserRole.REPORT_VIEWER),
  statementsController.getChangesInEquity,
);
