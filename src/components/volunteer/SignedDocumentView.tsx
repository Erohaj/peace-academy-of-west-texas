import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Printer } from 'lucide-react';
import { MarkdownDocument } from './MarkdownDocument';
import { fetchDocumentVersionBody } from '../../lib/api/legalDocuments';
import type { SignatureRow } from '../../lib/api/legalDocuments';

interface Props {
  title: string;
  signature: SignatureRow;
}

const formatSignedAt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

/**
 * The full text of one signed document, fetched on demand — not preloaded
 * for every row in a list, since most signatures are never reopened once
 * made. Shared between the admin's application review and a volunteer's own
 * record of what they agreed to: what is provable (the hash, the signer, the
 * timestamp) does not depend on who is looking at it.
 *
 * Reads by version_id rather than assuming the document's current text,
 * because a signature stays tied to the exact wording it was made against
 * even after that document is later revised — see the RLS policy
 * "document_versions: read own signed".
 *
 * Printing targets this one instance by a ref, not a shared CSS class. Both
 * the admin's application review and the volunteer's "What you signed" list
 * can have several of these expanded at once, each with its own Print
 * button — a class-based `@media print` rule matches every element sharing
 * that class, so clicking Print on one made every other expanded document
 * visible and `position: fixed` at the same spot simultaneously, stacked
 * illegibly on top of each other. Setting a `data-printing` attribute
 * directly on this instance's own node right before calling `window.print()`
 * (and clearing it right after) means the print stylesheet only ever matches
 * the one document actually being printed.
 */
export const SignedDocumentView: React.FC<Props> = ({ title, signature }) => {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    printRef.current?.setAttribute('data-printing', 'true');
    window.print();
    printRef.current?.removeAttribute('data-printing');
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchDocumentVersionBody(signature.version_id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('This document version could not be found.');
        } else {
          setBody(result.bodyMd);
        }
      })
      .catch((fetchError) => {
        console.error('[PAWTX] Failed to load signed document text', fetchError);
        if (!cancelled) setError('Could not load this document.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signature.version_id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <div className="text-xs text-[#5A5A5A]">
          Signed by <strong className="text-[#2A2A2A]">{signature.signer_name}</strong>
          {signature.signer_role === 'guardian' &&
            signature.minor_name &&
            ` (parent/guardian of ${signature.minor_name})`}
          {' on '}
          {formatSignedAt(signature.signed_at)}
          {signature.choice && ` — chose "${signature.choice.replace('_', ' ')}"`}
        </div>
        {body && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-white border border-[#E5E0D8] hover:bg-[#F4F1ED] text-[#2A2A2A] px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save as PDF
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-[#5A5A5A] py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading document...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-3 py-2.5 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {body && (
        <div ref={printRef} className="bg-white border border-[#E5E0D8] rounded-2xl p-5">
          <h4 className="font-serif font-bold text-lg text-[#2A2A2A] mb-1">{title}</h4>
          <p className="text-[11px] text-[#5A5A5A] mb-4">
            Signed by {signature.signer_name} on {formatSignedAt(signature.signed_at)}
            {signature.choice && ` — chose "${signature.choice.replace('_', ' ')}"`}
          </p>
          <MarkdownDocument markdown={body} />
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          [data-printing], [data-printing] * { visibility: visible; }
          [data-printing] {
            position: fixed; inset: 0; margin: 0; border: none !important;
          }
        }
      `}</style>
    </div>
  );
};
