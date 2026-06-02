import {
  Prisma,
  ApprovalEntityType,
  ApprovalType,
  ApprovalDecisionType,
  ApprovalRequestStatus,
  NotificationType,
  EntryStatus,
} from '@prisma/client';
import { auditLog } from '../audit-trail/audit.service';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../utils/errors';
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CreateLevelInput,
  AddApproverInput,
  DecisionInput,
} from './approval.schemas';

// ─── Notification helper ──────────────────────────────────────────────────────

async function notify(
  userIds: string[],
  organisationId: string,
  type: NotificationType,
  title: string,
  body: string,
  entityId?: string,
  entityType?: string,
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      organisationId,
      type,
      title,
      body,
      entityId: entityId ?? null,
      entityType: entityType ?? null,
    })),
    skipDuplicates: true,
  });
}

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

export async function createWorkflow(organisationId: string, input: CreateWorkflowInput) {
  // Per manual: creating a new workflow auto-deactivates the previous active one
  await prisma.approvalWorkflow.updateMany({
    where: { organisationId, entityType: input.entityType, isActive: true },
    data:  { isActive: false },
  });

  const wf = await prisma.approvalWorkflow.create({
    data: {
      organisationId,
      name: input.name,
      description: input.description ?? null,
      entityType: input.entityType,
      isActive: true,
    },
    include: { levels: { include: { approvers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } }, orderBy: { levelNumber: 'asc' } } },
  });
  auditLog({ organisationId, action: 'WORKFLOW_CREATED', module: 'APPROVALS', entityType: 'APPROVAL_WORKFLOW', entityId: wf.id, entityRef: wf.name, description: `Approval workflow '${wf.name}' created for ${wf.entityType}` });
  return wf;
}

export async function listWorkflows(organisationId: string) {
  return prisma.approvalWorkflow.findMany({
    where: { organisationId },
    include: {
      levels: {
        orderBy: { levelNumber: 'asc' },
        include: { approvers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
      },
      _count: { select: { requests: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWorkflow(organisationId: string, workflowId: string) {
  const wf = await prisma.approvalWorkflow.findFirst({
    where: { id: workflowId, organisationId },
    include: {
      levels: {
        orderBy: { levelNumber: 'asc' },
        include: { approvers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
      },
    },
  });
  if (!wf) throw new NotFoundError('Approval workflow not found');
  return wf;
}

export async function updateWorkflow(
  organisationId: string,
  workflowId: string,
  input: UpdateWorkflowInput,
) {
  await getWorkflow(organisationId, workflowId);
  return prisma.approvalWorkflow.update({
    where: { id: workflowId },
    data: { name: input.name, description: input.description, isActive: input.isActive },
  });
}

export async function deleteWorkflow(organisationId: string, workflowId: string) {
  const wf = await getWorkflow(organisationId, workflowId);
  const pendingRequests = await prisma.approvalRequest.count({
    where: { workflowId: wf.id, status: ApprovalRequestStatus.PENDING },
  });
  if (pendingRequests > 0) {
    throw new ForbiddenError('Cannot delete a workflow with pending approval requests');
  }
  await prisma.approvalWorkflow.delete({ where: { id: workflowId } });
}

// ─── Levels ───────────────────────────────────────────────────────────────────

export async function addLevel(
  organisationId: string,
  workflowId: string,
  input: CreateLevelInput,
) {
  await getWorkflow(organisationId, workflowId);

  const existing = await prisma.approvalLevel.findFirst({
    where: { workflowId, levelNumber: input.levelNumber },
  });
  if (existing) throw new ConflictError(`Level ${input.levelNumber} already exists in this workflow`);

  return prisma.approvalLevel.create({
    data: {
      workflowId,
      levelNumber:        input.levelNumber,
      name:               input.name,
      approvalType:       input.approvalType,
      amountThresholdMin: input.amountThresholdMin != null ? new Prisma.Decimal(input.amountThresholdMin) : null,
      amountThresholdMax: input.amountThresholdMax != null ? new Prisma.Decimal(input.amountThresholdMax) : null,
      escalationHours:    input.escalationHours ?? null,
      escalateTo:         input.escalateTo ?? null,
    },
    include: { approvers: true },
  });
}

export async function removeLevel(organisationId: string, workflowId: string, levelId: string) {
  await getWorkflow(organisationId, workflowId);
  const level = await prisma.approvalLevel.findFirst({ where: { id: levelId, workflowId } });
  if (!level) throw new NotFoundError('Approval level not found');
  await prisma.approvalLevel.delete({ where: { id: levelId } });
}

export async function addApprover(
  organisationId: string,
  workflowId: string,
  levelId: string,
  input: AddApproverInput,
) {
  await getWorkflow(organisationId, workflowId);
  const level = await prisma.approvalLevel.findFirst({ where: { id: levelId, workflowId } });
  if (!level) throw new NotFoundError('Approval level not found');

  const orgUser = await prisma.organisationUser.findFirst({
    where: { organisationId, userId: input.userId, isActive: true },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  const existing = await prisma.approvalLevelUser.findFirst({ where: { levelId, userId: input.userId } });
  if (existing) throw new ConflictError('User is already an approver for this level');

  return prisma.approvalLevelUser.create({
    data: { levelId, userId: input.userId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
}

export async function removeApprover(
  organisationId: string,
  workflowId: string,
  levelId: string,
  userId: string,
) {
  await getWorkflow(organisationId, workflowId);
  const entry = await prisma.approvalLevelUser.findFirst({ where: { levelId, userId } });
  if (!entry) throw new NotFoundError('Approver not found in this level');
  await prisma.approvalLevelUser.delete({ where: { id: entry.id } });
}

// ─── Delegations ──────────────────────────────────────────────────────────────

export async function createDelegation(
  organisationId: string,
  delegatedBy: string,
  input: { delegatedTo: string; validFrom: string; validTo: string; workflowId?: string; reason?: string },
) {
  const orgUser = await prisma.organisationUser.findFirst({
    where: { organisationId, userId: input.delegatedTo, isActive: true },
  });
  if (!orgUser) throw new NotFoundError('Delegate user not found in this organisation');

  if (input.delegatedTo === delegatedBy) throw new ValidationError('Cannot delegate to yourself');

  const from = new Date(input.validFrom);
  const to   = new Date(input.validTo);
  if (to <= from) throw new ValidationError('validTo must be after validFrom');

  const del = await prisma.approvalDelegation.create({
    data: {
      organisationId,
      delegatedBy,
      delegatedTo: input.delegatedTo,
      validFrom:   from,
      validTo:     to,
      workflowId:  input.workflowId ?? null,
      reason:      input.reason ?? null,
      isActive:    true,
    },
    include: {
      delegator: { select: { id: true, firstName: true, lastName: true } },
      delegatee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  auditLog({ organisationId, userId: delegatedBy, action: 'DELEGATION_CREATED', module: 'APPROVALS', entityType: 'APPROVAL_DELEGATION', entityId: del.id, description: `Approval delegation created: ${delegatedBy} → ${input.delegatedTo}, valid ${input.validFrom} to ${input.validTo}`, after: { delegatedTo: input.delegatedTo, validFrom: input.validFrom, validTo: input.validTo, workflowId: input.workflowId } });
  return del;
}

export async function listDelegations(organisationId: string, userId?: string) {
  return prisma.approvalDelegation.findMany({
    where: {
      organisationId,
      ...(userId && { OR: [{ delegatedBy: userId }, { delegatedTo: userId }] }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      delegator: { select: { id: true, firstName: true, lastName: true } },
      delegatee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function revokeDelegation(organisationId: string, id: string, userId: string) {
  const delegation = await prisma.approvalDelegation.findFirst({
    where: { id, organisationId },
  });
  if (!delegation) throw new NotFoundError('Delegation not found');
  if (delegation.delegatedBy !== userId) throw new ForbiddenError('Only the delegator can revoke this delegation');

  const revoked = await prisma.approvalDelegation.update({
    where: { id },
    data:  { isActive: false },
  });
  auditLog({ organisationId, userId, action: 'DELEGATION_REVOKED', module: 'APPROVALS', entityType: 'APPROVAL_DELEGATION', entityId: id, description: `Approval delegation revoked by ${userId}` });
  return revoked;
}

// ─── Check if user can act via delegation ─────────────────────────────────────

async function getEffectiveApproverIds(
  levelApproverIds: string[],
  workflowId: string,
  organisationId: string,
  requestId?: string,
  levelNumber?: number,
): Promise<Set<string>> {
  const now = new Date();
  const effectiveIds = new Set(levelApproverIds);

  // Standing delegations (from the ApprovalDelegation table)
  const delegations = await prisma.approvalDelegation.findMany({
    where: {
      organisationId,
      isActive:    true,
      validFrom:   { lte: now },
      validTo:     { gte: now },
      delegatedBy: { in: levelApproverIds },
      OR: [{ workflowId }, { workflowId: null }],
    },
  });
  for (const d of delegations) effectiveIds.add(d.delegatedTo);

  // Ad-hoc delegations for this specific request (from ApprovalDecision records)
  if (requestId !== undefined && levelNumber !== undefined) {
    const adHoc = await prisma.approvalDecision.findMany({
      where: {
        approvalRequestId: requestId,
        levelNumber,
        decision: ApprovalDecisionType.DELEGATED,
      },
      select: { delegatedTo: true },
    });
    for (const d of adHoc) {
      if (d.delegatedTo) effectiveIds.add(d.delegatedTo);
    }
  }

  return effectiveIds;
}

// ─── Escalation check ─────────────────────────────────────────────────────────

async function checkAndEscalate(
  request: {
    id: string;
    status: ApprovalRequestStatus;
    slaDeadline: Date | null;
    escalatedAt: Date | null;
    currentLevel: number;
    workflowId: string;
    entityType: ApprovalEntityType;
  },
  organisationId: string,
) {
  if (request.status !== ApprovalRequestStatus.PENDING) return;
  if (!request.slaDeadline || request.escalatedAt) return;
  if (new Date() < request.slaDeadline) return;

  const currentLevel = await prisma.approvalLevel.findFirst({
    where:   { workflowId: request.workflowId, levelNumber: request.currentLevel },
    include: { approvers: { include: { user: { select: { id: true } } } } },
  });

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data:  { status: ApprovalRequestStatus.ESCALATED, escalatedAt: new Date() },
  });

  const notifyIds: string[] = [];
  if (currentLevel?.escalateTo) notifyIds.push(currentLevel.escalateTo);
  if (notifyIds.length === 0 && currentLevel) {
    notifyIds.push(...currentLevel.approvers.map((a) => a.user.id));
  }

  await notify(
    notifyIds,
    organisationId,
    NotificationType.APPROVAL_ESCALATED,
    'Approval Request Escalated',
    `Request for ${request.entityType.replace(/_/g, ' ')} has exceeded its SLA and been escalated to you.`,
    request.id,
    'APPROVAL_REQUEST',
  );
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function listRequests(
  organisationId: string,
  status?: ApprovalRequestStatus,
  userId?: string,
) {
  const requests = await prisma.approvalRequest.findMany({
    where: {
      workflow: { organisationId },
      ...(status && { status }),
      ...(userId && { requestedBy: userId }),
    },
    orderBy: { requestedAt: 'desc' },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      workflow:  { select: { name: true, entityType: true } },
      decisions: {
        orderBy: { decidedAt: 'desc' },
        include: { decider: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  // Trigger escalation check on all pending requests
  await Promise.all(
    requests
      .filter((r) => r.status === ApprovalRequestStatus.PENDING && r.slaDeadline && !r.escalatedAt)
      .map((r) => checkAndEscalate(r as Parameters<typeof checkAndEscalate>[0], organisationId)),
  );

  return requests;
}

export async function getRequest(organisationId: string, requestId: string) {
  const req = await prisma.approvalRequest.findFirst({
    where: { id: requestId, workflow: { organisationId } },
    include: {
      workflow: {
        include: {
          levels: {
            orderBy: { levelNumber: 'asc' },
            include: { approvers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
          },
        },
      },
      requester: { select: { id: true, firstName: true, lastName: true } },
      decisions: {
        orderBy: { decidedAt: 'asc' },
        include: {
          decider: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!req) throw new NotFoundError('Approval request not found');

  // Lazy escalation check
  await checkAndEscalate(req, organisationId);

  return req;
}

// ─── Create Request ───────────────────────────────────────────────────────────

export async function createJournalApprovalRequest(
  organisationId: string,
  journalId: string,
  requestedBy: string,
): Promise<{ requestId: string; hasWorkflow: boolean }> {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: ApprovalEntityType.JOURNAL_ENTRY, isActive: true },
    include: { levels: { orderBy: { levelNumber: 'asc' } } },
  });

  if (!workflow || workflow.levels.length === 0) {
    return { requestId: '', hasWorkflow: false };
  }

  // Get journal amount for threshold evaluation
  const journal = await prisma.journalEntry.findUnique({
    where: { id: journalId },
    include: { lines: { select: { debitAmount: true } } },
  });
  const amount = journal?.lines.reduce((s, l) => s + Number(l.debitAmount), 0) ?? 0;

  // Find first applicable level (respecting amount thresholds)
  const firstLevel = workflow.levels.find((l) => {
    const min = l.amountThresholdMin ? Number(l.amountThresholdMin) : 0;
    const max = l.amountThresholdMax ? Number(l.amountThresholdMax) : Infinity;
    return amount >= min && amount <= max;
  }) ?? workflow.levels[0];

  // Compute SLA deadline from smallest escalationHours across applicable levels
  const escalationHours = workflow.levels
    .filter((l) => l.escalationHours != null)
    .map((l) => l.escalationHours!)
    .sort((a, b) => a - b)[0];
  const slaDeadline = escalationHours
    ? new Date(Date.now() + escalationHours * 60 * 60 * 1000)
    : null;

  const request = await prisma.approvalRequest.create({
    data: {
      workflowId:   workflow.id,
      entityType:   ApprovalEntityType.JOURNAL_ENTRY,
      entityId:     journalId,
      requestedBy,
      currentLevel: firstLevel.levelNumber,
      status:       ApprovalRequestStatus.PENDING,
      slaDeadline,
    },
  });

  // Notify all level-1 approvers
  const level1 = await prisma.approvalLevel.findFirst({
    where: { workflowId: workflow.id, levelNumber: firstLevel.levelNumber },
    include: { approvers: { select: { userId: true } } },
  });
  if (level1) {
    await notify(
      level1.approvers.map((a) => a.userId),
      organisationId,
      NotificationType.APPROVAL_REQUESTED,
      'Approval Required',
      `A journal entry has been submitted for your approval.`,
      request.id,
      'APPROVAL_REQUEST',
    );
  }

  return { requestId: request.id, hasWorkflow: true };
}

// ─── Decision Engine ──────────────────────────────────────────────────────────

export async function decide(
  organisationId: string,
  requestId: string,
  userId: string,
  input: DecisionInput,
) {
  const request = await getRequest(organisationId, requestId);

  if (request.status !== ApprovalRequestStatus.PENDING) {
    throw new ForbiddenError(`Request is already ${request.status.toLowerCase()}`);
  }

  const currentLevel = request.workflow.levels.find(
    (l) => l.levelNumber === request.currentLevel,
  );
  if (!currentLevel) throw new ValidationError('Current approval level not configured');

  // ── Segregation of Duties ──────────────────────────────────────────────────
  if (userId === request.requestedBy) {
    throw new ForbiddenError(
      'Segregation of duties violation: the person who submitted this request cannot approve it.',
    );
  }

  // Verify user is an approver at this level (direct or via active delegation)
  const levelApproverIds = currentLevel.approvers.map((a) => a.user.id);
  const effectiveApprovers = await getEffectiveApproverIds(
    levelApproverIds,
    request.workflowId,
    organisationId,
    requestId,
    request.currentLevel,
  );

  if (!effectiveApprovers.has(userId)) {
    throw new ForbiddenError('You are not an approver for the current level of this request');
  }

  // Prevent duplicate decision from same user at same level
  const alreadyDecided = await prisma.approvalDecision.findFirst({
    where: { approvalRequestId: requestId, levelNumber: request.currentLevel, decidedBy: userId },
  });
  if (alreadyDecided) throw new ConflictError('You have already submitted a decision for this level');

  if (input.decision === ApprovalDecisionType.REJECTED) {
    return handleRejection(request, userId, input.comments, organisationId);
  }

  if (input.decision === ApprovalDecisionType.DELEGATED) {
    if (!input.delegatedTo) throw new ValidationError('delegatedTo is required when delegating');
    return handleDelegation(request, userId, input.delegatedTo, input.comments, organisationId);
  }

  // APPROVED — record decision and check if level is now satisfied
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: requestId,
      levelNumber:       request.currentLevel,
      decidedBy:         userId,
      decision:          ApprovalDecisionType.APPROVED,
      comments:          input.comments ?? null,
    },
  });

  return checkLevelSatisfied(request, currentLevel, organisationId, userId);
}

async function handleRejection(
  request: Awaited<ReturnType<typeof getRequest>>,
  userId: string,
  comments: string | undefined,
  organisationId: string,
) {
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: request.id,
      levelNumber:       request.currentLevel,
      decidedBy:         userId,
      decision:          ApprovalDecisionType.REJECTED,
      comments:          comments ?? null,
    },
  });

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data:  { status: ApprovalRequestStatus.REJECTED, completedAt: new Date() },
  });

  if (request.entityType === ApprovalEntityType.JOURNAL_ENTRY) {
    const existing = await prisma.journalEntry.findUnique({
      where: { id: request.entityId },
      select: { description: true },
    });
    await prisma.journalEntry.update({
      where: { id: request.entityId },
      data: {
        status: EntryStatus.DRAFT,
        ...(comments && {
          description: `[REJECTED: ${comments}] ${existing?.description ?? ''}`.trim(),
        }),
      },
    });
  }

  await notify(
    [request.requestedBy],
    organisationId,
    NotificationType.APPROVAL_REJECTED,
    'Request Rejected',
    `Your ${request.entityType.replace(/_/g, ' ')} approval request was rejected.${comments ? ` Reason: ${comments}` : ''}`,
    request.id,
    'APPROVAL_REQUEST',
  );

  auditLog({ organisationId: request.workflow.organisationId ?? undefined, userId, action: 'APPROVAL_REJECTED', module: 'APPROVALS', entityType: 'APPROVAL_REQUEST', entityId: request.id, description: `Approval request rejected at level ${request.currentLevel}${comments ? `. Reason: ${comments}` : ''}`, after: { decision: 'REJECTED', level: request.currentLevel, entityType: request.entityType } });
  return { status: 'REJECTED', requestId: request.id };
}

async function handleDelegation(
  request: Awaited<ReturnType<typeof getRequest>>,
  userId: string,
  delegatedTo: string,
  comments: string | undefined,
  organisationId: string,
) {
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: request.id,
      levelNumber:       request.currentLevel,
      decidedBy:         userId,
      decision:          ApprovalDecisionType.DELEGATED,
      comments:          comments ?? null,
      delegatedTo,
    },
  });

  // Do NOT add the delegatee to ApprovalLevelUser — that would permanently mutate the workflow
  // and inflate requiredApprovers counts for ALL_REQUIRED/MAJORITY.
  // getEffectiveApproverIds reads the DELEGATED decision records to grant access for this request only.

  await notify(
    [delegatedTo],
    organisationId,
    NotificationType.APPROVAL_DELEGATED,
    'Approval Delegated to You',
    `An approval request has been delegated to you.`,
    request.id,
    'APPROVAL_REQUEST',
  );

  auditLog({ organisationId, userId, action: 'APPROVAL_DELEGATED', module: 'APPROVALS', entityType: 'APPROVAL_REQUEST', entityId: request.id, description: `Approval request delegated to user ${delegatedTo} at level ${request.currentLevel}`, after: { delegatedTo, level: request.currentLevel } });
  return { status: 'DELEGATED', requestId: request.id };
}

// Post-approval entity dispatch — update the entity's own status on full approval.
// JOURNAL_ENTRY and BUDGET are handled inline; other entity types (PAYMENT, PAYROLL, etc.)
// use module-specific approval flows and do not require a status update here.
async function dispatchApprovalComplete(entityType: ApprovalEntityType, entityId: string) {
  switch (entityType) {
    case ApprovalEntityType.JOURNAL_ENTRY:
      await prisma.journalEntry.update({
        where: { id: entityId },
        data:  { status: EntryStatus.APPROVED, approvedAt: new Date() },
      });
      break;
    case ApprovalEntityType.BUDGET:
      await prisma.budget.updateMany({
        where: { id: entityId },
        data:  { isApproved: true, approvedAt: new Date() },
      });
      break;
    default:
      // PAYMENT, PURCHASE_ORDER, SALES_INVOICE, EXPENSE_CLAIM, PAYROLL, BANK_TRANSFER,
      // SUPPLIER_INVOICE: approval is tracked at the ApprovalRequest level only.
      break;
  }
}

async function checkLevelSatisfied(
  request: Awaited<ReturnType<typeof getRequest>>,
  currentLevel: Awaited<ReturnType<typeof getRequest>>['workflow']['levels'][0],
  organisationId: string,
  userId: string,
) {
  // Original approver IDs on this level (never inflated by ad-hoc delegation)
  const originalApproverIds = new Set(currentLevel.approvers.map((a) => a.user.id));
  const requiredApprovers = originalApproverIds.size;

  // Approved decisions at this level
  const approvedDecisions = await prisma.approvalDecision.findMany({
    where: {
      approvalRequestId: request.id,
      levelNumber:       request.currentLevel,
      decision:          ApprovalDecisionType.APPROVED,
    },
    select: { decidedBy: true },
  });

  // Ad-hoc delegation map: delegatee → delegator (for this request + level)
  const adHocDelegations = await prisma.approvalDecision.findMany({
    where: {
      approvalRequestId: request.id,
      levelNumber:       request.currentLevel,
      decision:          ApprovalDecisionType.DELEGATED,
    },
    select: { decidedBy: true, delegatedTo: true },
  });
  const delegateeToOriginal = new Map<string, string>(
    adHocDelegations
      .filter((d) => d.delegatedTo !== null)
      .map((d) => [d.delegatedTo!, d.decidedBy]),
  );

  // Count unique original approver slots satisfied (direct or via delegatee)
  const satisfiedSlots = new Set<string>();
  for (const d of approvedDecisions) {
    if (originalApproverIds.has(d.decidedBy)) {
      satisfiedSlots.add(d.decidedBy);
    } else {
      const original = delegateeToOriginal.get(d.decidedBy);
      if (original && originalApproverIds.has(original)) {
        satisfiedSlots.add(original);
      }
    }
  }
  const approvalCount = satisfiedSlots.size;

  let satisfied = false;
  switch (currentLevel.approvalType) {
    case ApprovalType.ANY_ONE:      satisfied = approvalCount >= 1; break;
    case ApprovalType.ALL_REQUIRED: satisfied = approvalCount >= requiredApprovers; break;
    case ApprovalType.MAJORITY:     satisfied = requiredApprovers > 0 && approvalCount > requiredApprovers / 2; break;
  }

  if (!satisfied) {
    return { status: 'PENDING', requestId: request.id, message: `${approvalCount}/${requiredApprovers} approvals recorded` };
  }

  // Level satisfied — advance to next or complete
  const nextLevel = request.workflow.levels.find(
    (l) => l.levelNumber > request.currentLevel,
  );

  if (nextLevel) {
    // Recompute SLA deadline for next level
    const slaDeadline = nextLevel.escalationHours
      ? new Date(Date.now() + nextLevel.escalationHours * 60 * 60 * 1000)
      : null;

    await prisma.approvalRequest.update({
      where: { id: request.id },
      data:  { currentLevel: nextLevel.levelNumber, slaDeadline, escalatedAt: null },
    });

    const nextLevelData = await prisma.approvalLevel.findFirst({
      where: { workflowId: request.workflowId, levelNumber: nextLevel.levelNumber },
      include: { approvers: { select: { userId: true } } },
    });
    if (nextLevelData) {
      await notify(
        nextLevelData.approvers.map((a) => a.userId),
        organisationId,
        NotificationType.APPROVAL_REQUESTED,
        'Approval Required — Next Level',
        `An approval request has advanced to level ${nextLevel.levelNumber} and requires your review.`,
        request.id,
        'APPROVAL_REQUEST',
      );
    }

    return { status: 'ADVANCED', requestId: request.id, nextLevel: nextLevel.levelNumber };
  }

  // All levels complete
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data:  { status: ApprovalRequestStatus.APPROVED, completedAt: new Date() },
  });

  // Dispatch: update entity status based on type
  await dispatchApprovalComplete(request.entityType, request.entityId);

  await notify(
    [request.requestedBy],
    organisationId,
    NotificationType.APPROVAL_APPROVED,
    'Request Approved',
    `Your ${request.entityType.replace(/_/g, ' ')} approval request has been fully approved.`,
    request.id,
    'APPROVAL_REQUEST',
  );

  auditLog({ organisationId, userId, action: 'APPROVAL_APPROVED', module: 'APPROVALS', entityType: 'APPROVAL_REQUEST', entityId: request.id, description: `Approval request fully approved — ${request.entityType} entity ${request.entityId}`, after: { entityType: request.entityType, entityId: request.entityId } });
  return { status: 'APPROVED', requestId: request.id };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(organisationId: string, userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      organisationId,
      ...(unreadOnly && { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });
}

export async function markNotificationsRead(organisationId: string, userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: {
      userId,
      organisationId,
      isRead: false,
      ...(ids && ids.length > 0 && { id: { in: ids } }),
    },
    data: { isRead: true },
  });
}

export async function getUnreadCount(organisationId: string, userId: string) {
  return prisma.notification.count({
    where: { userId, organisationId, isRead: false },
  });
}

// ─── Withdraw ─────────────────────────────────────────────────────────────────

export async function withdrawRequest(
  organisationId: string,
  requestId: string,
  userId: string,
) {
  const request = await prisma.approvalRequest.findFirst({
    where: { id: requestId, workflow: { organisationId } },
  });
  if (!request) throw new NotFoundError('Approval request not found');
  if (request.requestedBy !== userId) {
    throw new ForbiddenError('Only the original requester can withdraw this request');
  }
  if (
    request.status !== ApprovalRequestStatus.PENDING &&
    request.status !== ApprovalRequestStatus.ESCALATED
  ) {
    throw new ValidationError(`Cannot withdraw a ${request.status.toLowerCase()} request`);
  }

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data:  { status: ApprovalRequestStatus.WITHDRAWN, completedAt: new Date() },
  });

  // Reset JOURNAL_ENTRY back to DRAFT so it can be corrected and resubmitted
  if (request.entityType === ApprovalEntityType.JOURNAL_ENTRY) {
    await prisma.journalEntry.update({
      where: { id: request.entityId },
      data:  { status: EntryStatus.DRAFT },
    });
  }

  return { status: 'WITHDRAWN', requestId: request.id };
}
