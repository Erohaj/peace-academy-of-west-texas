import type { Tables } from '../database.types';
import { requireSupabase } from '../supabaseClient';
import { CANONICAL_URL } from '../seo';

export type CertificateRow = Tables<'volunteer_certificates'>;

/** What `verify_certificate` gives an anonymous caller. */
export interface CertificateVerification {
  certificateNo: string;
  recipientName: string;
  totalHours: number;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  issuedByName: string;
  issuedByTitle: string | null;
  isValid: boolean;
  revokedAt: string | null;
}

/** One line of the frozen snapshot stored on the certificate. */
export interface CertificateEntry {
  servedOn: string;
  hours: number;
  description: string;
}

/**
 * Crockford's base32 alphabet: no I, L, O or U.
 *
 * These numbers get read off a printed page and typed into a verification box
 * by a school registrar. Excluding the characters that are misread as one
 * another removes the whole class of "it says it is invalid" support requests,
 * and dropping U keeps the generator from producing an unfortunate word.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A certificate number that cannot be guessed or walked.
 *
 * Sequential numbering would let anyone who holds one certificate enumerate
 * every certificate the organisation has ever issued, and each of those
 * discloses a volunteer's name and hours. 8 random characters over a 32-letter
 * alphabet is about 1.1 x 10^12 possibilities; the unique constraint on the
 * column settles the rest.
 */
export function generateCertificateNumber(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  const body = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `PAWTX-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** The URL a QR code points at, and the one printed underneath it. */
export const verificationUrl = (certificateNo: string): string =>
  `${CANONICAL_URL}?verify=${encodeURIComponent(certificateNo)}`;

/**
 * Public verification.
 *
 * Deliberately goes through the RPC rather than reading the table: anonymous
 * callers have no select policy on `volunteer_certificates` at all, so there
 * is nothing to widen, filter differently, or list.
 */
export async function verifyCertificate(
  certificateNo: string
): Promise<CertificateVerification | null> {
  const { data, error } = await requireSupabase().rpc('verify_certificate', {
    p_certificate_no: certificateNo
  });

  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;

  return {
    certificateNo: row.certificate_no,
    recipientName: row.recipient_name,
    totalHours: Number(row.total_hours),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by_name,
    issuedByTitle: row.issued_by_title,
    isValid: row.is_valid,
    revokedAt: row.revoked_at
  };
}

export async function fetchMyCertificates(userId: string): Promise<CertificateRow[]> {
  const { data, error } = await requireSupabase()
    .from('volunteer_certificates')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface IssueCertificateInput {
  userId: string;
  recipientName: string;
  periodStart: string;
  periodEnd: string;
  entries: CertificateEntry[];
  issuedBy: string;
  issuedByName: string;
  issuedByTitle: string | null;
}

/**
 * Issues a certificate over a snapshot of hours the caller has already read.
 *
 * The totals are passed in rather than computed here on purpose. What goes on
 * the document has to be what the admin saw and approved on screen; a fresh
 * query at write time could pick up a correction made in another tab thirty
 * seconds earlier and print a number nobody agreed to.
 */
export async function issueCertificate(input: IssueCertificateInput): Promise<CertificateRow> {
  const totalHours =
    Math.round(input.entries.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100;

  const { data, error } = await requireSupabase()
    .from('volunteer_certificates')
    .insert({
      user_id: input.userId,
      certificate_no: generateCertificateNumber(),
      recipient_name: input.recipientName,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_hours: totalHours,
      entry_count: input.entries.length,
      entries: input.entries as unknown as Tables<'volunteer_certificates'>['entries'],
      issued_by: input.issuedBy,
      issued_by_name: input.issuedByName,
      issued_by_title: input.issuedByTitle
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Withdraws a certificate issued in error.
 *
 * Not a delete. Somebody is holding a printed copy with this number on it, and
 * the honest answer when they check it is "this was withdrawn on such a date",
 * not "no such certificate" — which reads as a forgery and puts the volunteer
 * in the position of explaining themselves.
 */
export async function revokeCertificate(id: string, reason: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('volunteer_certificates')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Renders the QR as an SVG string.
 *
 * Lazily imported: the encoder is around 50 KB and is needed only on the two
 * screens that show a certificate, so a static import would put it in the
 * bundle every visitor downloads. Same reasoning as the Gemini SDK in
 * SocialMediaFeed.
 *
 * Error correction level M tolerates roughly 15% damage, which is the right
 * trade for something printed on paper that gets folded and handed over.
 */
export async function renderQrSvg(text: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160
  });
}
