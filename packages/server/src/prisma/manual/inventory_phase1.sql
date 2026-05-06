-- Inventory Phase 1 Migration
-- Run in Neon SQL Editor — all statements are idempotent

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TYPE "CostMethod" ADD VALUE 'STANDARD';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MovementType" AS ENUM (
    'RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT',
    'TRANSFER_IN','TRANSFER_OUT','STOCKTAKE_IN','STOCKTAKE_OUT','OPENING'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MovementStatus" AS ENUM ('PENDING','APPROVED','POSTED','REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StocktakeStatus" AS ENUM ('OPEN','COUNTING','REVIEWING','POSTED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Extend inventory_items ────────────────────────────────────────────────────

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "categoryId"      TEXT,
  ADD COLUMN IF NOT EXISTS "standardCost"    DECIMAL(20,4),
  ADD COLUMN IF NOT EXISTS "reorderQuantity" DECIMAL(20,4);

-- ── inventory_categories ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "inventory_categories" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId" TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "description"    TEXT,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisationId", "name")
);
CREATE INDEX IF NOT EXISTS "inventory_categories_orgId" ON "inventory_categories"("organisationId");

-- ── inventory_locations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "inventory_locations" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId" TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "description"    TEXT,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisationId", "name")
);
CREATE INDEX IF NOT EXISTS "inventory_locations_orgId" ON "inventory_locations"("organisationId");

-- ── stock_balances ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "stock_balances" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId" TEXT        NOT NULL,
  "itemId"         TEXT        NOT NULL REFERENCES "inventory_items"("id"),
  "locationId"     TEXT,
  "quantityOnHand" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "averageCost"    DECIMAL(20,4) NOT NULL DEFAULT 0,
  "totalValue"     DECIMAL(20,4) NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("itemId", "locationId")
);
CREATE INDEX IF NOT EXISTS "stock_balances_orgId" ON "stock_balances"("organisationId");

-- ── inventory_movements ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id"              TEXT           NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId"  TEXT           NOT NULL,
  "itemId"          TEXT           NOT NULL REFERENCES "inventory_items"("id"),
  "locationId"      TEXT,
  "movementType"    "MovementType" NOT NULL,
  "quantity"        DECIMAL(20,4)  NOT NULL,
  "unitCost"        DECIMAL(20,4)  NOT NULL DEFAULT 0,
  "totalCost"       DECIMAL(20,4)  NOT NULL DEFAULT 0,
  "contraAccountId" TEXT,
  "reference"       TEXT,
  "description"     TEXT,
  "reasonCode"      TEXT,
  "status"          "MovementStatus" NOT NULL DEFAULT 'PENDING',
  "journalEntryId"  TEXT,
  "periodId"        TEXT,
  "transactionDate" DATE           NOT NULL,
  "requestedBy"     TEXT,
  "approvedBy"      TEXT,
  "approvedAt"      TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_mov_orgId_itemId"  ON "inventory_movements"("organisationId","itemId");
CREATE INDEX IF NOT EXISTS "inv_mov_orgId_date"    ON "inventory_movements"("organisationId","transactionDate");
CREATE INDEX IF NOT EXISTS "inv_mov_orgId_status"  ON "inventory_movements"("organisationId","status");

-- ── inventory_lots ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "inventory_lots" (
  "id"                TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId"    TEXT         NOT NULL,
  "itemId"            TEXT         NOT NULL REFERENCES "inventory_items"("id"),
  "locationId"        TEXT,
  "receivedDate"      DATE         NOT NULL,
  "originalQuantity"  DECIMAL(20,4) NOT NULL,
  "remainingQuantity" DECIMAL(20,4) NOT NULL,
  "unitCost"          DECIMAL(20,4) NOT NULL,
  "reference"         TEXT,
  "movementId"        TEXT,
  "isClosed"          BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "inv_lots_itemId_closed_date" ON "inventory_lots"("itemId","isClosed","receivedDate");
CREATE INDEX IF NOT EXISTS "inv_lots_orgId" ON "inventory_lots"("organisationId");

-- ── stocktake_sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "stocktake_sessions" (
  "id"             TEXT              NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organisationId" TEXT              NOT NULL,
  "locationId"     TEXT,
  "name"           TEXT              NOT NULL,
  "sessionDate"    DATE              NOT NULL,
  "status"         "StocktakeStatus" NOT NULL DEFAULT 'OPEN',
  "notes"          TEXT,
  "createdBy"      TEXT              NOT NULL,
  "postedBy"       TEXT,
  "postedAt"       TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "stocktake_sessions_orgId" ON "stocktake_sessions"("organisationId");

-- ── stocktake_counts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "stocktake_counts" (
  "id"               TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionId"        TEXT         NOT NULL REFERENCES "stocktake_sessions"("id") ON DELETE CASCADE,
  "itemId"           TEXT         NOT NULL REFERENCES "inventory_items"("id"),
  "locationId"       TEXT,
  "systemQuantity"   DECIMAL(20,4) NOT NULL,
  "countedQuantity"  DECIMAL(20,4),
  "varianceQuantity" DECIMAL(20,4),
  "unitCost"         DECIMAL(20,4) NOT NULL DEFAULT 0,
  "varianceValue"    DECIMAL(20,4),
  "notes"            TEXT,
  UNIQUE ("sessionId","itemId")
);
CREATE INDEX IF NOT EXISTS "stocktake_counts_sessionId" ON "stocktake_counts"("sessionId");
