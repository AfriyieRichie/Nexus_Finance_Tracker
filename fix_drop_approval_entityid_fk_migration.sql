-- approval_requests.entityId is polymorphic (journal / supplier / customer / invoice
-- / budget …). A FK to journal_entries was wrongly enforced, breaking every
-- non-journal approval request (P2003). Drop it.
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS "approval_requests_entityId_fkey";
