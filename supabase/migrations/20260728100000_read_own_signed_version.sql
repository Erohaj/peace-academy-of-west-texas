-- Let a signer read the exact version they signed, even after it stops
-- being current.
--
-- "document_versions: public read current" only allows a non-admin to read a
-- version where is_current is true. That is fine for someone about to sign
-- the document today, but it quietly breaks the other half of why versions
-- are hashed and kept at all: if the document is ever revised, every
-- volunteer who signed the OLD wording would lose the ability to read the
-- text they actually agreed to, the moment a new version is published. The
-- signature row and its body_hash would still prove what they signed, but
-- nobody could show it to them on screen.
--
-- This policy is additive (RLS OR-combines matching policies), so it changes
-- nothing about who can currently read the live text of a document — it only
-- ever widens access to a version this specific user has a document_signatures
-- row pointing at.

drop policy if exists "document_versions: read own signed" on public.legal_document_versions;

create policy "document_versions: read own signed"
  on public.legal_document_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.document_signatures
       where document_signatures.version_id = legal_document_versions.id
         and document_signatures.user_id = auth.uid()
    )
  );
