#!/usr/bin/env node
/**
 * Concatenates supabase/migrations/*.sql, in order, followed by
 * supabase/seed.sql, into supabase/setup/00_full_setup.sql — the one file
 * somebody without the Supabase CLI pastes into the dashboard SQL editor.
 *
 * That bundle used to be assembled by hand, which is exactly why it fell
 * eleven migrations behind without anyone noticing: everything added after
 * 26 July — the volunteer service log, legal documents and signatures,
 * certificates, and the media-consent rewrite of create_rsvp — was missing
 * from it. Someone setting the database up from the dashboard therefore got a
 * schema the app no longer runs against, and nothing anywhere said so. Making
 * the file a build artifact removes the step a human forgets.
 *
 * Usage:
 *   npm run setup:bundle
 *
 * Order is filename order, which is the same contract `supabase db push` goes
 * by — the timestamp prefix is what sequences a migration, so sorting the
 * directory reproduces the order the remote database was actually built in.
 * seed.sql goes last: it inserts rows into tables that the migrations before
 * it are still busy defining.
 *
 * The other three files in supabase/setup/ (97_check_auth, 98_verify,
 * 99_reset) are NOT generated. They are hand-written checks and a teardown,
 * not a concatenation of anything, so adding a migration means editing them
 * too — see the note this script writes into the bundle header.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
export const bundleUrl = new URL('../supabase/setup/00_full_setup.sql', import.meta.url);

/**
 * The bundle's text, without writing it anywhere.
 *
 * Exported so scripts/check-setup-helpers.mjs can compare it against the file
 * on disk: that is how "someone added a migration and forgot to regenerate"
 * gets caught, and it only works while there is exactly one implementation of
 * what the bundle should contain.
 */
export function buildBundle() {
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (migrations.length === 0) {
    throw new Error('No migrations found in supabase/migrations — refusing to build an empty bundle.');
  }

  const parts = [
    [
      '-- PAWTX — полная установка базы одним файлом.',
      '--',
      '-- Собран скриптом scripts/generate-setup-bundle.mjs из supabase/migrations/*.sql',
      '-- и supabase/seed.sql. РУКАМИ НЕ ПРАВИТЬ: добавили миграцию — выполните',
      '-- `npm run setup:bundle`, иначе этот файл и migrations/ разъедутся, а тот, кто',
      '-- ставит базу из дашборда, получит схему, под которую сайт уже не написан.',
      '--',
      '-- Скопируйте ВЕСЬ файл и выполните в Supabase → SQL Editor → New query → Run.',
      '--',
      '-- Рассчитан на ПУСТОЙ проект и один запуск: create table и create policy здесь',
      '-- без `if not exists`, поэтому повторный прогон упадёт на «already exists». Если',
      '-- установка прервалась на середине — выполните 99_reset.sql и начните заново.',
      '-- После установки проверьте себя файлом 98_verify.sql.',
      ''
    ].join('\n')
  ];

  for (const name of migrations) {
    parts.push(
      [
        '-- ============================================================',
        `-- ФАЙЛ: supabase/migrations/${name}`,
        '-- ============================================================',
        '',
        readFileSync(new URL(name, migrationsDir), 'utf8').trim(),
        ''
      ].join('\n')
    );
  }

  parts.push(
    [
      '-- ============================================================',
      '-- ФАЙЛ: supabase/seed.sql',
      '-- ============================================================',
      '',
      readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8').trim(),
      ''
    ].join('\n')
  );

  return { sql: parts.join('\n'), count: migrations.length };
}

// Only writes when run as a script; importing it just to call buildBundle()
// must not have the side effect of rewriting the file being checked.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sql, count } = buildBundle();
  const outPath = fileURLToPath(bundleUrl);
  writeFileSync(outPath, sql);
  console.log(`Wrote ${outPath} — ${count} migrations + seed.sql`);
}
