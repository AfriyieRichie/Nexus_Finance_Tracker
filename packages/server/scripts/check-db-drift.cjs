#!/usr/bin/env node
/*
 * Database drift guard.
 *
 * Compares the live database (DATABASE_URL) against the Prisma schema and fails
 * if there is any BREAKING drift — the kind that causes runtime errors:
 *   - missing/extra tables
 *   - missing/extra columns
 *   - missing enum values
 *   - unique-index drift (stale or missing unique constraints)
 *   - real column type changes
 *
 * Cosmetic drift (foreign-key/index *names*, dropped defaults, timestamp
 * precision, unused enums) is reported but does NOT fail — it never reaches a
 * user, and forcing it would mean pointless production DDL.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/check-db-drift.cjs
 *   npm run db:check-drift            (from packages/server)
 *
 * Exit codes: 0 = no breaking drift, 1 = breaking drift found, 2 = setup error.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✖ DATABASE_URL is not set. Provide it via env before running the drift check.');
  process.exit(2);
}

const schemaPath = path.join(__dirname, '..', 'src', 'prisma', 'schema.prisma');
// Invoke the Prisma CLI's JS entry with `node` (cross-platform; avoids the
// Windows .cmd spawn issue and runs without a shell).
const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');

let sql;
try {
  sql = execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'diff', '--from-url', DATABASE_URL, '--to-schema-datamodel', schemaPath, '--script'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (err) {
  console.error('✖ Failed to run `prisma migrate diff`:', err.message);
  process.exit(2);
}

const lines = sql.split('\n');

// A statement is BREAKING if it matches one of these (ORM-visible) patterns.
const BREAKING = [
  { label: 'Missing table (schema has, DB lacks)', re: /^CREATE TABLE/i },
  { label: 'Extra table (DB has, schema lacks)', re: /^DROP TABLE/i },
  { label: 'Missing column', re: /ADD COLUMN/i },
  { label: 'Extra column', re: /DROP COLUMN/i },
  { label: 'Missing enum value', re: /ALTER TYPE .* ADD VALUE/i },
  // unique index drift (stale or missing). FK (_fkey) and PK (_pkey) excluded.
  { label: 'Unique index drift', re: /(DROP INDEX|CREATE UNIQUE INDEX)\b.*"[^"]*_key"/i },
  // real type changes, but NOT timestamp-precision normalisation
  { label: 'Column type change', re: /SET DATA TYPE/i, not: /SET DATA TYPE TIMESTAMP/i },
];

const COSMETIC = [
  { label: 'Foreign-key rename', re: /(DROP|ADD) CONSTRAINT .*_fkey/i },
  { label: 'Non-unique index rename', re: /(DROP INDEX|CREATE INDEX)\b/i, not: /"[^"]*_key"/i },
  { label: 'Dropped column default', re: /DROP DEFAULT/i },
  { label: 'Timestamp precision', re: /SET DATA TYPE TIMESTAMP/i },
  { label: 'Unused enum create', re: /^CREATE TYPE/i },
];

const breakingHits = {};
const cosmeticHits = {};

for (const raw of lines) {
  const line = raw.trim();
  if (!line || line.startsWith('--')) continue;
  let matched = false;
  for (const rule of BREAKING) {
    if (rule.re.test(line) && !(rule.not && rule.not.test(line))) {
      (breakingHits[rule.label] ??= []).push(line);
      matched = true;
      break;
    }
  }
  if (matched) continue;
  for (const rule of COSMETIC) {
    if (rule.re.test(line) && !(rule.not && rule.not.test(line))) {
      cosmeticHits[rule.label] = (cosmeticHits[rule.label] ?? 0) + 1;
      break;
    }
  }
}

const breakingCount = Object.values(breakingHits).reduce((s, a) => s + a.length, 0);

if (Object.keys(cosmeticHits).length > 0) {
  console.log('Cosmetic drift (informational, not failing):');
  for (const [label, n] of Object.entries(cosmeticHits)) console.log(`  • ${label}: ${n}`);
  console.log('');
}

if (breakingCount === 0) {
  console.log('✔ No breaking database drift — the live DB matches the Prisma schema where it matters.');
  process.exit(0);
}

console.error(`✖ BREAKING database drift detected (${breakingCount} item(s)):`);
for (const [label, items] of Object.entries(breakingHits)) {
  console.error(`\n  ${label} (${items.length}):`);
  for (const it of items.slice(0, 20)) console.error(`    ${it}`);
  if (items.length > 20) console.error(`    …and ${items.length - 20} more`);
}
console.error('\nResolve by applying the matching migration (or `prisma db push`) so the DB matches the schema.');
process.exit(1);
