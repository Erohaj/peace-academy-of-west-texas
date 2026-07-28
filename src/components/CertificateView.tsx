import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, ShieldCheck, ShieldOff } from 'lucide-react';
import type { CertificateRow, CertificateEntry } from '../lib/api/certificates';
import { renderQrSvg, verificationUrl } from '../lib/api/certificates';
import { ORG_ADDRESS } from '../data/orgLinks';
import { SITE_NAME } from '../lib/seo';
import { usePrintPortal } from '../lib/usePrintPortal';

interface Props {
  certificate: CertificateRow;
}

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' });

/**
 * The certificate itself — what gets printed, saved as PDF, or handed to a
 * school. Also renders (in a banner, not hidden) when the certificate has
 * been revoked, since a printed copy already in someone's hands cannot be
 * un-printed; the honest response is to mark it, not to pretend the
 * component doesn't know.
 *
 * `window.print()` rather than a PDF library: every browser already has a
 * "save as PDF" option in its print dialog, and the portal in usePrintPortal
 * makes that dialog show exactly this card — no extra dependency to render
 * what the browser can already do.
 *
 * Printing goes through usePrintPortal() rather than styling this element
 * `position: fixed` for print. CertificatesAdmin's "Previously issued" list
 * can have several of these expanded at once, and a class- or even ref-keyed
 * `position: fixed` rule re-anchors to the same spot on every printed page —
 * harmless for a short certificate today, but the entries table has no fixed
 * length, and the identical mistake did visible damage on a longer signed
 * document (see SignedDocumentView.tsx). The portal sidesteps the failure
 * mode entirely rather than only the case that has been hit so far.
 */
export const CertificateView: React.FC<Props> = ({ certificate }) => {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const { isPrinting, print, printRoot } = usePrintPortal();

  const entries = Array.isArray(certificate.entries)
    ? (certificate.entries as unknown as CertificateEntry[])
    : [];
  const isRevoked = Boolean(certificate.revoked_at);
  const verifyUrl = verificationUrl(certificate.certificate_no);

  useEffect(() => {
    let cancelled = false;
    void renderQrSvg(verifyUrl).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [verifyUrl]);

  // Rendered twice — inline for on-screen viewing, and portalled to
  // #print-root while actually printing — so the two only ever differ in
  // their outer wrapper below.
  const certificateBody = (
    <>
      <div className="text-center space-y-1 border-b border-[#E5E0D8] pb-6">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-[#A64D32]">
          Certificate of Volunteer Service
        </div>
        <div className="text-2xl font-serif font-bold text-[#2A2A2A]">{SITE_NAME}</div>
        <div className="text-[11px] text-[#5A5A5A]">
          {ORG_ADDRESS} · 501(c)(3) Non-Profit Organization
        </div>
      </div>

      <div className="text-center space-y-3">
        <p className="text-xs text-[#5A5A5A] uppercase tracking-wider">This certifies that</p>
        <p className="text-3xl font-serif font-bold text-[#2A2A2A]">{certificate.recipient_name}</p>
        <p className="text-sm text-[#5A5A5A] max-w-md mx-auto leading-relaxed">
          completed <strong className="text-[#A64D32]">{Number(certificate.total_hours)} hours</strong>{' '}
          of volunteer service with {SITE_NAME} between{' '}
          <strong>{formatDate(certificate.period_start)}</strong> and{' '}
          <strong>{formatDate(certificate.period_end)}</strong>.
        </p>
      </div>

      {entries.length > 0 && (
        <table className="w-full text-xs border-t border-[#E5E0D8] pt-3">
          <thead className="text-[#5A5A5A] uppercase tracking-wider">
            <tr>
              <th className="text-left font-bold pb-2">Date</th>
              <th className="text-left font-bold pb-2">Activity</th>
              <th className="text-right font-bold pb-2">Hours</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={index} className="border-t border-[#F4F1ED]">
                <td className="py-1.5 text-[#2A2A2A]">{formatDate(entry.servedOn)}</td>
                <td className="py-1.5 text-[#2A2A2A]">{entry.description}</td>
                <td className="py-1.5 text-right text-[#2A2A2A]">{entry.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-end justify-between gap-6 pt-4 border-t border-[#E5E0D8]">
        <div className="text-xs text-[#2A2A2A] space-y-0.5">
          <div className="font-bold">{certificate.issued_by_name}</div>
          {certificate.issued_by_title && (
            <div className="text-[#5A5A5A]">{certificate.issued_by_title}</div>
          )}
          <div className="text-[#5A5A5A]">{formatDate(certificate.issued_at.slice(0, 10))}</div>
        </div>

        <div className="text-center shrink-0">
          {qrSvg && (
            <div
              className="w-20 h-20 [&_svg]:w-full [&_svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          <div className="text-[9px] font-mono text-[#5A5A5A] mt-1 tracking-wider">
            {certificate.certificate_no}
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-[#5A5A5A] flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3 h-3" />
        Verify this certificate at {verifyUrl.replace(/^https?:\/\//, '')}
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      {!isRevoked && (
        <div className="flex justify-end">
          <button
            onClick={print}
            className="flex items-center gap-2 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </button>
        </div>
      )}

      {isRevoked && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
          <ShieldOff className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This certificate was withdrawn on {formatDate(certificate.revoked_at!.slice(0, 10))}
            {certificate.revoked_reason ? `: ${certificate.revoked_reason}` : '.'} It should not be
            printed or relied on.
          </span>
        </div>
      )}

      <div
        className={`bg-white border-2 rounded-2xl p-10 max-w-2xl mx-auto space-y-8 ${
          isRevoked ? 'border-red-300 opacity-60' : 'border-[#E5E0D8]'
        }`}
      >
        {certificateBody}
      </div>

      {isPrinting &&
        printRoot &&
        createPortal(
          <div className="bg-white p-10 max-w-2xl mx-auto space-y-8">{certificateBody}</div>,
          printRoot
        )}
    </div>
  );
};
