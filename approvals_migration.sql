-- ============================================================
-- Approvals Enhancement Migration
-- Apply in Neon SQL Editor
-- ============================================================

-- 1. Add NotificationType enum
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'APPROVAL_REQUESTED',
    'APPROVAL_APPROVED',
    'APPROVAL_REJECTED',
    'APPROVAL_ESCALATED',
    'APPROVAL_DELEGATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add SLA columns to approval_requests
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS "slaDeadline"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMPTZ;

-- 3. Add delegatedTo column to approval_decisions (for DELEGATED decisions)
ALTER TABLE approval_decisions
  ADD COLUMN IF NOT EXISTS "delegatedTo" TEXT;

-- 4. Create approval_delegations table
CREATE TABLE IF NOT EXISTS approval_delegations (
  id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "organisationId" TEXT        NOT NULL,
  "workflowId"     TEXT,
  "delegatedBy"    TEXT        NOT NULL,
  "delegatedTo"    TEXT        NOT NULL,
  "validFrom"      TIMESTAMPTZ NOT NULL,
  "validTo"        TIMESTAMPTZ NOT NULL,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  reason           TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT approval_delegations_pkey PRIMARY KEY (id),
  CONSTRAINT approval_delegations_org_fk
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT approval_delegations_delegatedby_fk
    FOREIGN KEY ("delegatedBy") REFERENCES users(id),
  CONSTRAINT approval_delegations_delegatedto_fk
    FOREIGN KEY ("delegatedTo") REFERENCES users(id),
  CONSTRAINT approval_delegations_workflow_fk
    FOREIGN KEY ("workflowId") REFERENCES approval_workflows(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_org     ON approval_delegations ("organisationId");
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegby ON approval_delegations ("delegatedBy");
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegto ON approval_delegations ("delegatedTo");

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id               TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"         TEXT             NOT NULL,
  "organisationId" TEXT             NOT NULL,
  type             "NotificationType" NOT NULL,
  title            TEXT             NOT NULL,
  body             TEXT             NOT NULL,
  "entityId"       TEXT,
  "entityType"     TEXT,
  "isRead"         BOOLEAN          NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_fk
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_org_fk
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications ("userId");
CREATE INDEX IF NOT EXISTS idx_notifications_org      ON notifications ("organisationId");
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications ("userId", "isRead") WHERE "isRead" = false;
