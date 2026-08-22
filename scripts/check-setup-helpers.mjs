#!/usr/bin/env node
/**
 * Checks supabase/setup/ against supabase/migrations/ — without a database.
 *
 * 00_full_setup.sql is generated, so it cannot drift as long as somebody runs
 * `npm run setup:bundle`. The other two files can, and silently: 98_verify.sql
 * carries a hand-written list of tables, and 99_reset.sql a hand-written list
 * of things to drop. Add a fifteenth table and forget them both, and nothing
 * complains — 98_verify counts its own fourteen and reports ✅, while 99_reset
 * leaves the new table behind so the next install dies on "already exists".
 * That is exactly how the bundle fell eleven migrations behind in the first
 * place, and a check that only runs against a live database is no help to
 * whoever is setting one up from the dashboard.
 *
 * Usage:
 *   npm run setup:check
 *
 * The migrations are read with libpg_query — the parser out of Postgres
 * itself, compiled as a library — so the table, column and function names
 * compared here are the ones the server would see, not what a regular
 * expression guessed from the text.
 *
 * What this cannot do is execute anything: it will not catch a policy whose
 * USING clause is wrong, or an ordering problem between migrations. For that
 * there is the real thing — `npm run db:reset` against the local stack, then
 * 99_reset.sql, 00_full_setup.sql and 98_verify.sql in the SQL editor.
 */
import { readFileSync, readdirSync } from 'fs';
import pgQuery from 'libpg-query';
import { buildBundle, bundleUrl } from './generate-setup-bundle.mjs';

const { parse, loadModule } = pgQuery;
await loadModule();

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const setupDir = new URL('../supabase/setup/', import.meta.url);

const problems = [];

function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) problems.push(label);
}

/**
 * Parses a file, or stops with the file named.
 *
 * Nothing below this can say anything meaningful about a file the parser could
 * not read, so there is no point collecting the failure and carrying on. The
 * common cause is an editor saving SQL with a UTF-8 byte order mark, which
 * Postgres rejects at the first character — the Supabase SQL editor would
 * refuse the same paste, so this is worth failing loudly rather than crashing
 * with a stack trace.
 */
async function mustParse(url, label) {
  try {
    return await parse(readFileSync(url, 'utf8'));
  } catch (err) {
    check(`${label} is valid SQL`, false, err.message);
    console.error(`\nCannot continue without parsing ${label}.`);
    process.exit(1);
  }
}

/** Everything the migrations bring into existence. */
const created = {
  tables: new Set(),
  columns: new Map(),
  functions: new Map(),
  rlsEnabled: new Set(),
  anonReadable: new Set()
};

function addColumn(table, column) {
  if (!created.columns.has(table)) created.columns.set(table, new Set());
  created.columns.get(table).add(column);
}

for (const file of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
  const tree = await mustParse(new URL(file, migrationsDir), `migrations/${file}`);

  for (const { stmt } of tree.stmts) {
    if (stmt.CreateStmt) {
      const table = stmt.CreateStmt.relation.relname;
      created.tables.add(table);
      for (const elt of stmt.CreateStmt.tableElts ?? []) {
        if (elt.ColumnDef) addColumn(table, elt.ColumnDef.colname);
      }
    }

    if (stmt.AlterTableStmt) {
      const table = stmt.AlterTableStmt.relation.relname;
      for (const { AlterTableCmd: cmd } of stmt.AlterTableStmt.cmds ?? []) {
        if (!cmd) continue;
        if (cmd.subtype === 'AT_AddColumn' && cmd.def?.ColumnDef) addColumn(table, cmd.def.ColumnDef.colname);
        if (cmd.subtype === 'AT_EnableRowSecurity') created.rlsEnabled.add(table);
      }
    }

    if (stmt.CreateFunctionStmt) {
      const path = stmt.CreateFunctionStmt.funcname.map((p) => p.String.sval);
      // Argument count matters for create_rsvp, where an abandoned overload
      // would leave PostgREST choosing between two functions by argument name.
      created.functions.set(path.at(-1), (stmt.CreateFunctionStmt.parameters ?? []).length);
    }

    // A migration that drops a function and recreates it is a replacement; one
    // that only drops it means the function is gone and must not be expected.
    if (stmt.DropStmt?.removeType === 'OBJECT_FUNCTION') {
      for (const o of stmt.DropStmt.objects ?? []) {
        const path = o.ObjectWithArgs?.objname?.map((p) => p.String.sval) ?? [];
        if (path.length) created.functions.delete(path.at(-1));
      }
    }

    if (stmt.CreatePolicyStmt) {
      // 98_verify counts pg_policies with schemaname = 'public'. The media
      // bucket's policies live on storage.objects and are outside that count.
      const schema = stmt.CreatePolicyStmt.table.schemaname ?? 'public';
      if (schema !== 'public') continue;
      const roles = (stmt.CreatePolicyStmt.roles ?? []).map((r) => r.RoleSpec?.rolename);
      if (roles.includes('anon')) created.anonReadable.add(stmt.CreatePolicyStmt.table.relname);
    }
  }
}

/** The two hand-maintained table lists at the top of 98_verify.sql. */
const verifyTree = await mustParse(new URL('98_verify.sql', setupDir), 'setup/98_verify.sql');
const ctes = verifyTree.stmts[0].stmt.SelectStmt.withClause?.ctes ?? [];

function cteValues(name) {
  const cte = ctes.find((c) => c.CommonTableExpr.ctename === name);
  if (!cte) throw new Error(`98_verify.sql no longer defines a "${name}" list — this script needs updating with it.`);
  return (cte.CommonTableExpr.ctequery.SelectStmt.valuesLists ?? []).map((row) => row.List.items[0].A_Const.sval.sval);
}

const listedTables = cteValues('pawtx_tables');
const privateTables = cteValues('private_tables');

/** What 99_reset.sql takes away. */
const dropped = { tables: new Set(), functions: new Set() };
const resetTree = await mustParse(new URL('99_reset.sql', setupDir), 'setup/99_reset.sql');

for (const { stmt } of resetTree.stmts) {
  const drop = stmt.DropStmt;
  if (!drop) continue;
  if (drop.removeType === 'OBJECT_TABLE') {
    for (const o of drop.objects ?? []) dropped.tables.add(o.List.items.map((i) => i.String.sval).at(-1));
  }
  if (drop.removeType === 'OBJECT_FUNCTION') {
    for (const o of drop.objects ?? []) dropped.functions.add(o.ObjectWithArgs.objname.map((p) => p.String.sval).at(-1));
  }
}

const missingFrom = (expected, actual) => [...expected].filter((x) => !actual.has(x));

// --- the checks ------------------------------------------------------------

const bundleOnDisk = readFileSync(bundleUrl, 'utf8');
check(
  '00_full_setup.sql is up to date with the migrations',
  buildBundle().sql === bundleOnDisk,
  buildBundle().sql === bundleOnDisk ? '' : 'run `npm run setup:bundle`'
);

const unlisted = missingFrom(created.tables, new Set(listedTables));
const phantom = missingFrom(new Set(listedTables), created.tables);
check(
  '98_verify.sql lists every table the migrations create',
  unlisted.length === 0 && phantom.length === 0,
  [
    `${listedTables.length} listed, ${created.tables.size} created`,
    unlisted.length ? `missing from the list: ${unlisted.join(', ')}` : '',
    phantom.length ? `listed but never created: ${phantom.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('; ')
);

const noRls = missingFrom(created.tables, created.rlsEnabled);
check('RLS is enabled on every table', noRls.length === 0, noRls.length ? `without RLS: ${noRls.join(', ')}` : `${created.rlsEnabled.size} tables`);

// Every table is either private (no anon policy) or deliberately public. A
// table in neither list is one nobody has classified, which is how a table
// holding personal data ends up publicly readable without anyone deciding it.
const classified = new Set([...privateTables, ...created.anonReadable]);
const unclassified = missingFrom(created.tables, classified);
check(
  'every table is either private or deliberately public',
  unclassified.length === 0,
  unclassified.length ? `unclassified: ${unclassified.join(', ')}` : `${privateTables.length} private + ${created.anonReadable.size} public`
);

const leaking = privateTables.filter((t) => created.anonReadable.has(t));
check(
  'no table listed as private has an anon policy',
  leaking.length === 0,
  leaking.length ? `READABLE BY ANYONE: ${leaking.join(', ')}` : 'none'
);

// 98_verify hardcodes this count, so it has to be re-derived from the policies.
check(
  'the anon-readable count in 98_verify matches the policies',
  created.anonReadable.size === 5,
  [...created.anonReadable].sort().join(', ')
);

for (const fn of ['create_rsvp', 'is_admin', 'verify_certificate']) {
  check(`98_verify expects function ${fn}, and it exists`, created.functions.has(fn));
}

check(
  'create_rsvp takes the 8 arguments 98_verify expects',
  created.functions.get('create_rsvp') === 8,
  `migrations leave it at ${created.functions.get('create_rsvp')}`
);

// Columns 98_verify names in its privilege and content checks.
for (const [table, column] of [
  ['profiles', 'role'],
  ['events', 'reserved_spots'],
  ['events', 'total_spots'],
  ['legal_document_versions', 'body_hash'],
  ['legal_document_versions', 'is_current'],
  ['volunteer_certificates', 'revoked_at'],
  ['volunteer_certificates', 'revoked_reason']
]) {
  check(`98_verify reads ${table}.${column}, and it exists`, created.columns.get(table)?.has(column) === true);
}

const undropped = missingFrom(created.tables, dropped.tables);
check(
  '99_reset.sql drops every table',
  undropped.length === 0,
  undropped.length ? `left behind: ${undropped.join(', ')}` : `${dropped.tables.size} tables`
);

const undroppedFns = missingFrom(new Set(created.functions.keys()), dropped.functions);
check(
  '99_reset.sql drops every function',
  undroppedFns.length === 0,
  undroppedFns.length ? `left behind: ${undroppedFns.join(', ')}` : `${dropped.functions.size} functions`
);

console.log('---');
if (problems.length) {
  console.error(`${problems.length} problem(s) — supabase/setup/ is out of step with supabase/migrations/`);
  process.exit(1);
}
console.log('supabase/setup/ agrees with supabase/migrations/');
