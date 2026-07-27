-- PAWTX — volunteer onboarding paperwork, signatures, and service certificates.
--
-- Three things this schema is built around, each of which a simpler design
-- gets wrong in a way that only shows up in a dispute:
--
--  1. A signature is worthless unless you can prove WHAT was signed. Documents
--     are therefore versioned and immutable, each version carries a hash of its
--     own text, and every signature records the hash it agreed to. "accepted =
--     true" on a profile proves nothing a year later when the text has changed.
--
--  2. A certificate is a snapshot, not a live query. Hours get corrected — a
--     roster reopened, a no-show reversed — and a document already handed to a
--     school must not silently change underneath it. The totals are frozen at
--     issue and the underlying entries stored alongside them.
--
--  3. Verification must reveal the minimum. The public lookup is a function,
--     not a readable table: it takes an unguessable number and returns the
--     name, hours and period. Never the email, phone, address, or date of
--     birth that the rest of these tables hold.

-- ---------------------------------------------------------------------------
-- Versioned documents
-- ---------------------------------------------------------------------------

create table if not exists public.legal_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  title_es    text not null,
  -- Drives the onboarding flow: which papers a given volunteer must sign, and
  -- which additionally require a guardian when the volunteer is a minor.
  kind        text not null check (kind in (
                'application', 'agreement', 'release', 'media_consent',
                'guardian_consent', 'code_of_conduct'
              )),
  required    boolean not null default true,
  minors_only boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.legal_document_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.legal_documents (id) on delete cascade,
  version        text not null,
  effective_from date not null,
  body_md        text not null,
  body_md_es     text not null,
  -- sha-256 of body_md, computed on insert. A signature stores this value, so
  -- an altered document can never be passed off as the one somebody signed.
  body_hash      text not null,
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),

  unique (document_id, version)
);

-- Exactly one current version per document.
create unique index if not exists legal_document_versions_one_current_idx
  on public.legal_document_versions (document_id)
  where is_current;

create or replace function public.legal_document_versions_set_hash()
returns trigger
language plpgsql
as $$
begin
  new.body_hash := encode(extensions.digest(new.body_md, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists legal_document_versions_hash on public.legal_document_versions;
create trigger legal_document_versions_hash
  before insert or update of body_md on public.legal_document_versions
  for each row execute function public.legal_document_versions_set_hash();

-- Published text is public on purpose: somebody has to be able to read what
-- they are about to sign before they have an account.
alter table public.legal_documents         enable row level security;
alter table public.legal_document_versions enable row level security;

drop policy if exists "legal_documents: public read" on public.legal_documents;
create policy "legal_documents: public read"
  on public.legal_documents for select to anon, authenticated using (true);

drop policy if exists "legal_documents: admins write" on public.legal_documents;
create policy "legal_documents: admins write"
  on public.legal_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "document_versions: public read current" on public.legal_document_versions;
create policy "document_versions: public read current"
  on public.legal_document_versions for select to anon, authenticated
  using (is_current or public.is_admin());

drop policy if exists "document_versions: admins write" on public.legal_document_versions;
create policy "document_versions: admins write"
  on public.legal_document_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table if not exists public.volunteer_applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles (id) on delete set null,
  full_name         text not null check (length(btrim(full_name)) between 1 and 120),
  email             text not null check (position('@' in email) > 1),
  phone             text,
  date_of_birth     date not null,
  -- Frozen at submission. Age is not a stored fact that stays true, and every
  -- consent question ("did this need a guardian?") is about the day it was
  -- signed, not about today.
  was_minor_at_submission boolean not null,
  address_line      text,
  city              text,
  state             text,
  postal_code       text,
  emergency_name    text not null,
  emergency_phone   text not null,
  emergency_relation text,
  skills            text,
  availability      text,
  languages         text,
  -- Youth programmes: see the code of conduct and the screening note in
  -- legal/README.md. Nothing here decides anything on its own.
  interested_in_youth_programs boolean not null default false,
  motivation        text,
  status            text not null default 'submitted'
                      check (status in ('submitted', 'in_review', 'approved', 'declined', 'withdrawn')),
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now()
);

create index if not exists volunteer_applications_status_idx
  on public.volunteer_applications (status, created_at desc);

alter table public.volunteer_applications enable row level security;

drop policy if exists "applications: read own" on public.volunteer_applications;
create policy "applications: read own"
  on public.volunteer_applications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "applications: submit own" on public.volunteer_applications;
create policy "applications: submit own"
  on public.volunteer_applications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "applications: admins manage" on public.volunteer_applications;
create policy "applications: admins manage"
  on public.volunteer_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- An applicant must not be able to approve themselves. Same mechanism as
-- profiles.role: revoke the table-wide UPDATE, grant back only what they own.
revoke update on public.volunteer_applications from authenticated;
grant update (
  phone, address_line, city, state, postal_code,
  emergency_name, emergency_phone, emergency_relation,
  skills, availability, languages, motivation
) on public.volunteer_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Signatures
-- ---------------------------------------------------------------------------

create table if not exists public.document_signatures (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.legal_document_versions (id),
  user_id        uuid references public.profiles (id) on delete set null,
  application_id uuid references public.volunteer_applications (id) on delete cascade,

  -- Typed name plus intent, which is what ESIGN and the Texas UETA actually
  -- require. A checkbox with no name attached is far weaker evidence.
  signer_name    text not null check (length(btrim(signer_name)) between 1 and 120),
  signer_email   text not null,
  signer_role    text not null check (signer_role in ('volunteer', 'guardian')),
  -- Present when signer_role = 'guardian': who they are signing for.
  minor_name     text,
  relationship   text,

  -- The exact text agreed to. Copied from the version at signing time rather
  -- than joined at read time, so it survives the version row being corrected.
  body_hash      text not null,
  signed_at      timestamptz not null default now(),
  ip_address     inet,
  user_agent     text,

  constraint guardian_names_the_minor
    check (signer_role <> 'guardian' or minor_name is not null)
);

create index if not exists document_signatures_user_idx
  on public.document_signatures (user_id, signed_at desc);

create index if not exists document_signatures_application_idx
  on public.document_signatures (application_id);

alter table public.document_signatures enable row level security;

drop policy if exists "signatures: read own" on public.document_signatures;
create policy "signatures: read own"
  on public.document_signatures for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "signatures: sign own" on public.document_signatures;
create policy "signatures: sign own"
  on public.document_signatures for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "signatures: admins read" on public.document_signatures;
create policy "signatures: admins read"
  on public.document_signatures for select to authenticated
  using (public.is_admin());

-- Nobody edits or deletes a signature, admins included. An execution record
-- that can be altered after the fact is not evidence of anything.
revoke update, delete on public.document_signatures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

create table if not exists public.volunteer_certificates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,

  -- Printed on the document and encoded in the QR. Unguessable by design:
  -- sequential numbering would let anyone enumerate every certificate the
  -- organisation has ever issued.
  certificate_no text not null unique,

  -- Snapshots. Deliberately not recomputed on read — see the header.
  recipient_name text not null,
  period_start   date not null,
  period_end     date not null,
  total_hours    numeric(6, 2) not null check (total_hours >= 0),
  entry_count    integer not null default 0,
  entries        jsonb not null default '[]'::jsonb,

  issued_by      uuid not null references public.profiles (id),
  issued_by_name text not null,
  issued_by_title text,
  issued_at      timestamptz not null default now(),

  revoked_at     timestamptz,
  revoked_reason text,

  constraint certificate_period_ordered check (period_end >= period_start)
);

create index if not exists volunteer_certificates_user_idx
  on public.volunteer_certificates (user_id, issued_at desc);

alter table public.volunteer_certificates enable row level security;

drop policy if exists "certificates: read own" on public.volunteer_certificates;
create policy "certificates: read own"
  on public.volunteer_certificates for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "certificates: admins manage" on public.volunteer_certificates;
create policy "certificates: admins manage"
  on public.volunteer_certificates for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and issued_by = auth.uid());

-- Issued figures are frozen. Only revocation is possible afterwards, which is
-- how a certificate sent in error is withdrawn without rewriting history.
revoke update on public.volunteer_certificates from authenticated;
grant update (revoked_at, revoked_reason) on public.volunteer_certificates to authenticated;

-- ---------------------------------------------------------------------------
-- Public verification
--
-- A function rather than a table policy. Anonymous callers get exactly these
-- columns for exactly one certificate number they already hold — no listing,
-- no PII, and no way to widen the query.
-- ---------------------------------------------------------------------------

create or replace function public.verify_certificate(p_certificate_no text)
returns table (
  certificate_no  text,
  recipient_name  text,
  total_hours     numeric,
  period_start    date,
  period_end      date,
  issued_at       timestamptz,
  issued_by_name  text,
  issued_by_title text,
  is_valid        boolean,
  revoked_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.certificate_no,
    c.recipient_name,
    c.total_hours,
    c.period_start,
    c.period_end,
    c.issued_at,
    c.issued_by_name,
    c.issued_by_title,
    c.revoked_at is null as is_valid,
    c.revoked_at
  from public.volunteer_certificates c
  where upper(btrim(c.certificate_no)) = upper(btrim(p_certificate_no));
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;

revoke execute on function public.legal_document_versions_set_hash() from anon, authenticated;
