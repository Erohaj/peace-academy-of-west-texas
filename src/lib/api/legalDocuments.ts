import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';

export type LegalDocumentKind =
  | 'application'
  | 'agreement'
  | 'release'
  | 'media_consent'
  | 'guardian_consent'
  | 'code_of_conduct';

/** A document joined with the one version currently in force. */
export interface LegalDocument {
  documentId: string;
  versionId: string;
  slug: string;
  title: string;
  titleEs: string;
  kind: LegalDocumentKind;
  required: boolean;
  minorsOnly: boolean;
  sortOrder: number;
  version: string;
  bodyMd: string;
  bodyMdEs: string;
  bodyHash: string;
}

/**
 * The current version of every document, in signing order.
 *
 * `01-volunteer-application.md` has `kind = 'application'` and is included
 * here too, but the onboarding wizard treats that kind differently from the
 * other five: it is a field specification for the form, not a page anyone
 * reads and signs, so no signature is ever recorded against it. See
 * scripts/generate-legal-seed.mjs for why its seeded body is not cut down the
 * way the other five are.
 */
export async function fetchCurrentDocuments(): Promise<LegalDocument[]> {
  const supabase = requireSupabase();

  // Two plain queries joined in JS, rather than one query embedding
  // legal_document_versions with a dot-filter on `is_current` — the same
  // choice fetchRoster() in serviceLog.ts makes for a similar shape, and for
  // the same reason: a filter on an embedded resource is easy to get wrong in
  // a way that fails silently (zero rows, no error) rather than loudly, and
  // silent here means the onboarding wizard finds nothing to sign and
  // declares a volunteer done before they have agreed to anything.
  const [documents, versions] = await Promise.all([
    supabase
      .from('legal_documents')
      .select('id, slug, title, title_es, kind, required, minors_only, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('legal_document_versions')
      .select('id, document_id, version, body_md, body_md_es, body_hash')
      .eq('is_current', true)
  ]);

  if (documents.error) throw documents.error;
  if (versions.error) throw versions.error;

  const versionByDocumentId = new Map(versions.data?.map((v) => [v.document_id, v]));

  return (documents.data ?? [])
    .map((doc) => {
      const version = versionByDocumentId.get(doc.id);
      // A document with no current version cannot be signed and should not
      // silently vanish from the count either — but this only happens if the
      // seed migration was only partly applied, so surfacing it as "not
      // found" rather than crashing the whole list is the safer default.
      if (!version) return null;

      return {
        documentId: doc.id,
        versionId: version.id,
        slug: doc.slug,
        title: doc.title,
        titleEs: doc.title_es,
        kind: doc.kind as LegalDocumentKind,
        required: doc.required,
        minorsOnly: doc.minors_only,
        sortOrder: doc.sort_order,
        version: version.version,
        bodyMd: version.body_md,
        bodyMdEs: version.body_md_es,
        bodyHash: version.body_hash
      };
    })
    .filter((doc): doc is LegalDocument => doc !== null);
}

/**
 * The exact text of one version, for viewing a document after it has been
 * signed.
 *
 * Deliberately not the same code path as `fetchCurrentDocuments()`, which
 * only ever returns the *current* version of each document. A signature can
 * point at an older one once a document is revised, and
 * "document_versions: read own signed" is what lets the signer (or an admin)
 * read that specific row regardless of whether it is still current.
 */
export async function fetchDocumentVersionBody(
  versionId: string
): Promise<{ bodyMd: string; bodyMdEs: string; version: string } | null> {
  const { data, error } = await requireSupabase()
    .from('legal_document_versions')
    .select('body_md, body_md_es, version')
    .eq('id', versionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { bodyMd: data.body_md, bodyMdEs: data.body_md_es, version: data.version };
}

export type SignatureRow = Tables<'document_signatures'>;

export interface SignInput {
  versionId: string;
  applicationId: string | null;
  signerName: string;
  signerEmail: string;
  signerRole: 'volunteer' | 'guardian';
  /** Required when `signerRole` is 'guardian' — the DB rejects one without it. */
  minorName?: string;
  relationship?: string;
  /** Only meaningful when signing the media-consent document. */
  choice?: 'yes' | 'photos_only' | 'no';
  /**
   * The hash of the exact text shown to the signer, copied from the
   * `LegalDocument` fetched above rather than recomputed client-side — the
   * point is to record the server's canonical hash of what was displayed.
   */
  bodyHash: string;
}

/**
 * Records a signature.
 *
 * `user_id` is filled in by the caller from the signed-in session rather than
 * assumed here, because a guardian signing for a minor may not be the account
 * holder browsing — see OnboardingWizard for how the two are told apart. RLS
 * requires it to equal auth.uid() regardless.
 */
export async function signDocument(userId: string, input: SignInput): Promise<SignatureRow> {
  const { data, error } = await requireSupabase()
    .from('document_signatures')
    .insert({
      version_id: input.versionId,
      user_id: userId,
      application_id: input.applicationId,
      signer_name: input.signerName.trim(),
      signer_email: input.signerEmail.trim().toLowerCase(),
      signer_role: input.signerRole,
      minor_name: input.minorName?.trim() || null,
      relationship: input.relationship?.trim() || null,
      choice: input.choice ?? null,
      body_hash: input.bodyHash,
      // A truthful but weak signal, kept for the audit trail alongside the
      // signature. Not fetched from a network call: a client-reported IP
      // address is not trustworthy evidence anyway, and capturing a reliable
      // one needs a server-side Edge Function, not the browser.
      user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Every signature the signed-in user has made — used to skip documents already signed. */
export async function fetchMySignatures(userId: string): Promise<SignatureRow[]> {
  const { data, error } = await requireSupabase()
    .from('document_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('signed_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Every signature attached to one application — what an admin reviewing it
 * needs to see: which documents are on file, under what name, and when.
 * Relies on the "signatures: admins read" policy.
 */
export async function fetchSignaturesForApplication(
  applicationId: string
): Promise<SignatureRow[]> {
  const { data, error } = await requireSupabase()
    .from('document_signatures')
    .select('*')
    .eq('application_id', applicationId)
    .order('signed_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
