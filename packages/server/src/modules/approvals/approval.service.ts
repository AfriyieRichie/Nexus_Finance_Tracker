import {
  Prisma,
  ApprovalEntityType,
  ApprovalType,
  ApprovalDecisionType,
  ApprovalRequestStatus,
  EntryStatus,
} from '@prisma/client';
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

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

export async function createWorkflow(organisationId: string, input: CreateWorkflowInput) {
  const existing = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: input.entityType, isActive: true },
  });
  if (existing) {
    throw new ConflictError(
      `An active ${input.entityType} approval workflow already exists ('${existing.name}'). Deactivate it first.`,
    );
  }

  return prisma.approvalWorkflow.create({
    data: {
      organisationId,
      name: input.name,
      description: input.description ?? null,
      entityType: input.entityType,
      isActive: true,
    },
    include: { levels: { include: { approvers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } }, orderBy: { levelNumber: 'asc' } } },
  });
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
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    },
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
  if (existing) {
    throw new ConflictError(`Level ${input.levelNumber} already exists in this workflow`);
  }

  return prisma.approvalLevel.create({
    data: {
      workflowId,
      levelNumber: input.levelNumber,
      name: input.name,
      approvalType: input.approvalType,
      amountThresholdMin: input.amountThresholdMin != null
        ? new Prisma.Decimal(input.amountThresholdMin)
        : null,
      amountThresholdMax: input.amountThresholdMax != null
        ? new Prisma.Decimal(input.amountThresholdMax)
        : null,
      escalationHours: input.escalationHours ?? null,
    },
    include: { approvers: true },
  });
}

export async function removeLevel(
  organisationId: string,
  workflowId: string,
  levelId: string,
) {
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

  // Verify user belongs to this org
  const orgUser = await prisma.organisationUser.findFirst({
    where: { organisationId, userId: input.userId, isActive: true },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  const existing = await prisma.approvalLevelUser.findFirst({
    where: { levelId, userId: input.userId },
  });
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
  const entry = await prisma.approvalLevelUser.findFirst({
    where: { levelId, userId },
  });
  if (!entry) throw new NotFoundError('Approver not found in this level');
  await prisma.approvalLevelUser.delete({ where: { id: entry.id } });
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function listRequests(
  organisationId: string,
  status?: ApprovalRequestStatus,
) {
  return prisma.approvalRequest.findMany({
    where: {
      workflow: { organisationId },
      ...(status && { status }),
    },
    orderBy: { requestedAt: 'desc' },
    include: {
      requester: { select: { id: true, firstName: true, lastName: true } },
      workflow: { select: { name: true, entityType: true } },
      decisions: {
        orderBy: { decidedAt: 'desc' },
        include: { decider: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
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
        include: { decider: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!req) throw new NotFoundError('Approval request not found');
  return req;
}

// ─── Create Request (called from journal submit) ───────────────────────────────

export async function createJournalApprovalRequest(
  organisationId: string,
  journalId: string,
  requestedBy: string,
): Promise<{ requestId: string; hasWorkflow: boolean }> {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organisationId, entityType: ApprovalEntityType.JOURNAL_ENTRY, isActive: true },
    include: { levels: { orderBy: { levelNumber: 'asc' }, take: 1 } },
  });

  if (!workflow || workflow.levels.length === 0) {
    return { requestId: '', hasWorkflow: false };
  }

  const request = await prisma.approvalRequest.create({
    data: {
      workflowId: workflow.id,
      entityType: ApprovalEntityType.JOURNAL_ENTRY,
      entityId: journalId,
      requestedBy,
      currentLevel: workflow.levels[0].levelNumber,
      status: ApprovalRequestStatus.PENDING,
    },
  });

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

  // Find current level config
  const currentLevel = request.workflow.levels.find(
    (l) => l.levelNumber === request.currentLevel,
  );
  if (!currentLevel) throw new ValidationError('Current approval level not configured');

  // Verify this user is an approver for this level
  const isApprover = currentLevel.approvers.some((a) => a.user.id === userId);
  if (!isApprover) {
    throw new ForbiddenError('You are not an approver for the current level of this request');
  }

  // Prevent duplicate decision from same user at same level
  const alreadyDecided = await prisma.approvalDecision.findFirst({
    where: { approvalRequestId: requestId, levelNumber: request.currentLevel, decidedBy: userId },
  });
  if (alreadyDecided) {
    throw new ConflictError('You have already submitted a decision for this level');
  }

  if (input.decision === ApprovalDecisionType.REJECTED) {
    return handleRejection(request, userId, input.comments);
  }

  if (input.decision === ApprovalDecisionType.DELEGATED) {
    if (!input.delegatedTo) throw new ValidationError('delegatedTo is required when delegating');
    return handleDelegation(request, userId, input.delegatedTo, input.comments);
  }

  // APPROVED — record decision and check if level is now satisfied
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: requestId,
      levelNumber: request.currentLevel,
      decidedBy: userId,
      decision: ApprovalDecisionType.APPROVED,
      comments: input.comments ?? null,
    },
  });

  return checkLevelSatisfied(request, currentLevel);
}

async function handleRejection(
  request: Awaited<ReturnType<typeof getRequest>>,
  userId: string,
  comments?: string,
) {
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: request.id,
      levelNumber: request.currentLevel,
      decidedBy: userId,
      decision: ApprovalDecisionType.REJECTED,
      comments: comments ?? null,
    },
  });

  // Mark request rejected
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: ApprovalRequestStatus.REJECTED, completedAt: new Date() },
  });

  // Return journal to DRAFT
  if (request.entityType === ApprovalEntityType.JOURNAL_ENTRY) {
    await prisma.journalEntry.update({
      where: { id: request.entityId },
      data: {
        status: EntryStatus.DRAFT,
        description: {
          set: comments
            ? `[REJECTED by approver: ${comments}] ${(await prisma.journalEntry.findUnique({ where: { id: request.entityId }, select: { description: true } }))?.description ?? ''}`
            : undefined,
        },
      },
    });
  }

  return { status: 'REJECTED', requestId: request.id };
}

async function handleDelegation(
  request: Awaited<ReturnType<typeof getRequest>>,
  userId: string,
  delegatedTo: string,
  comments?: string,
) {
  await prisma.approvalDecision.create({
    data: {
      approvalRequestId: request.id,
      levelNumber: request.currentLevel,
      decidedBy: userId,
      decision: ApprovalDecisionType.DELEGATED,
      comments: comments ?? null,
      delegatedTo,
    },
  });

  // Add delegatee as approver for this level (so they can then decide)
  const currentLevel = request.workflow.levels.find(
    (l) => l.levelNumber === request.currentLevel,
  );
  if (currentLevel) {
    const alreadyApprover = currentLevel.approvers.some((a) => a.user.id === delegatedTo);
    if (!alreadyApprover) {
      await prisma.approvalLevelUser.create({
        data: { levelId: currentLevel.id, userId: delegatedTo },
      });
    }
  }

  return { status: 'DELEGATED', requestId: request.id };
}

async function checkLevelSatisfied(
  request: Awaited<ReturnType<typeof getRequest>>,
  currentLevel: Awaited<ReturnType<typeof getRequest>>['workflow']['levels'][0],
) {
  const decisions = await prisma.approvalDecision.findMany({
    where: {
      approvalRequestId: request.id,
      levelNumber: request.currentLevel,
      decision: ApprovalDecisionType.APPROVED,
    },
  });

  const approvalCount = decisions.length;
  const requiredApprovers = currentLevel.approvers.length;
  let satisfied = false;

  switch (currentLevel.approvalType) {
    case ApprovalType.ANY_ONE:
      satisfied = approvalCount >= 1;
      break;
    case ApprovalType.ALL_REQUIRED:
      satisfied = approvalCount >= requiredApprovers;
      break;
    case ApprovalType.MAJORITY:
      satisfied = requiredApprovers > 0 && approvalCount > requiredApprovers / 2;
      break;
  }

  if (!satisfied) {
    return { status: 'PENDING', requestId: request.id, message: `${approvalCount}/${requiredApprovers} approvals recorded` };
  }

  // Level satisfied — advance to next level or complete
  const nextLevel = request.workflow.levels.find(
    (l) => l.levelNumber > request.currentLevel,
  );

  if (nextLevel) {
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { currentLevel: nextLevel.levelNumber },
    });
    return { status: 'ADVANCED', requestId: request.id, nextLevel: nextLevel.levelNumber };
  }

  // All levels complete — approve the entity
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: ApprovalRequestStatus.APPROVED, completedAt: new Date() },
  });

  if (request.entityType === ApprovalEntityType.JOURNAL_ENTRY) {
    await prisma.journalEntry.update({
      where: { id: request.entityId },
      data: { status: EntryStatus.APPROVED, approvedAt: new Date() },
    });
  }

  return { status: 'APPROVED', requestId: request.id };
}
