-- Configurable asset locations master, so the asset location is chosen from a list.
CREATE TABLE IF NOT EXISTS asset_locations (
  id              TEXT PRIMARY KEY,
  "organisationId" TEXT NOT NULL REFERENCES organisations(id),
  name            TEXT NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "asset_locations_organisationId_name_key" ON asset_locations("organisationId", name);
CREATE INDEX IF NOT EXISTS "asset_locations_organisationId_idx" ON asset_locations("organisationId");
