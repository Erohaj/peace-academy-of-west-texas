-- Add somewhere to record a signer's actual choice, not just that they signed.
--
-- Every document but one is a plain "read it, agree, sign" — a signature row
-- proves the whole story. 04-media-consent.md is not: it offers three
-- outcomes (full consent, photographs only, or decline), and declining is
-- meant to be a completely normal, unpenalised choice — not something the
-- signing flow can only represent as "no row exists". Without a place to
-- store which of the three was picked, a signature on this document would
-- prove someone read it and nothing about what they decided.
--
-- Nullable and unused by the other five documents, where the choice really
-- is binary and the existence of the row already says "agreed".

alter table public.document_signatures
  add column if not exists choice text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.document_signatures'::regclass
       and conname = 'document_signatures_choice_check'
  ) then
    alter table public.document_signatures
      add constraint document_signatures_choice_check
      check (choice in ('yes', 'photos_only', 'no'));
  end if;
end $$;

comment on column public.document_signatures.choice is
  'Only meaningful for a signature on the media-consent document. Null for every other document — the row existing is the whole answer there.';
