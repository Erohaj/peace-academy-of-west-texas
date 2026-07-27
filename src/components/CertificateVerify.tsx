import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, ShieldX, Search, Loader2 } from 'lucide-react';
import { verifyCertificate, type CertificateVerification } from '../lib/api/certificates';
import { ORG_ADDRESS, ORG_EMAIL } from '../data/orgLinks';
import { SITE_NAME } from '../lib/seo';

interface Props {
  /** Certificate number from the QR code, if the visitor arrived by scanning. */
  initialNumber?: string;
}

type Outcome =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'found'; record: CertificateVerification }
  | { state: 'missing' }
  | { state: 'error' };

/**
 * Public certificate verification.
 *
 * The person reading this is a school registrar, a scholarship committee or a
 * court officer — not a volunteer, and not signed in. So it answers one
 * question plainly and shows nothing it does not have to: the name, the hours,
 * the period, and who signed it off. No email, no phone, no date of birth.
 *
 * A withdrawn certificate reports as withdrawn rather than as missing. Someone
 * is holding a printed copy either way, and "no such certificate" reads as a
 * forgery and puts them in the position of explaining themselves.
 */
export const CertificateVerify: React.FC<Props> = ({ initialNumber }) => {
  const { i18n } = useTranslation();
  const isEs = i18n.language === 'es';

  const [query, setQuery] = useState(initialNumber ?? '');
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });

  const lookup = useCallback(async (certificateNo: string) => {
    const trimmed = certificateNo.trim();
    if (!trimmed) return;

    setOutcome({ state: 'checking' });
    try {
      const record = await verifyCertificate(trimmed);
      setOutcome(record ? { state: 'found', record } : { state: 'missing' });
    } catch (error) {
      console.error('[PAWTX] Certificate verification failed', error);
      setOutcome({ state: 'error' });
    }
  }, []);

  // Arriving from a QR scan should answer the question without a second click.
  useEffect(() => {
    if (initialNumber) void lookup(initialNumber);
  }, [initialNumber, lookup]);

  const formatDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(isEs ? 'es-US' : 'en-US', {
      dateStyle: 'long'
    });

  return (
    <section className="py-16 bg-[#FDFBF7] min-h-[80vh] text-[#2A2A2A]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-8">

        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-[#5B6346]/10 text-[#5B6346] rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold">
            {isEs ? 'Verificación de constancia' : 'Verify a certificate of service'}
          </h1>
          <p className="text-sm text-[#5A5A5A]">
            {isEs
              ? `Introduce el número impreso en la constancia para confirmar que ${SITE_NAME} la emitió y sigue siendo válida.`
              : `Enter the number printed on the certificate to confirm that ${SITE_NAME} issued it and that it is still valid.`}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(query);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <label htmlFor="certificate-no" className="sr-only">
            {isEs ? 'Número de constancia' : 'Certificate number'}
          </label>
          <input
            id="certificate-no"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PAWTX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-white border border-[#E5E0D8] rounded-xl px-4 py-3 text-base font-mono tracking-wider focus:outline-none focus:border-[#A64D32]"
          />
          <button
            type="submit"
            disabled={outcome.state === 'checking'}
            className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {outcome.state === 'checking' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>{isEs ? 'Verificar' : 'Verify'}</span>
          </button>
        </form>

        {outcome.state === 'found' && (
          <div
            className={`rounded-2xl border p-6 space-y-5 ${
              outcome.record.isValid
                ? 'bg-[#5B6346]/5 border-[#5B6346]/40'
                : 'bg-[#A64D32]/5 border-[#A64D32]/40'
            }`}
          >
            <div
              className={`flex items-center gap-3 font-bold ${
                outcome.record.isValid ? 'text-[#5B6346]' : 'text-[#A64D32]'
              }`}
            >
              {outcome.record.isValid ? (
                <ShieldCheck className="w-6 h-6 shrink-0" />
              ) : (
                <ShieldX className="w-6 h-6 shrink-0" />
              )}
              <span className="text-lg">
                {outcome.record.isValid
                  ? isEs
                    ? 'Constancia válida'
                    : 'Valid certificate'
                  : isEs
                    ? 'Constancia retirada'
                    : 'Certificate withdrawn'}
              </span>
            </div>

            {!outcome.record.isValid && outcome.record.revokedAt && (
              <p className="text-xs text-[#A64D32]">
                {isEs
                  ? `Esta constancia fue retirada por la organización el ${formatDate(outcome.record.revokedAt.slice(0, 10))} y ya no debe aceptarse.`
                  : `This certificate was withdrawn by the organisation on ${formatDate(outcome.record.revokedAt.slice(0, 10))} and should no longer be accepted.`}
              </p>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {isEs ? 'Voluntario' : 'Volunteer'}
                </dt>
                <dd className="font-bold mt-0.5">{outcome.record.recipientName}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {isEs ? 'Horas verificadas' : 'Verified hours'}
                </dt>
                <dd className="font-bold mt-0.5">{outcome.record.totalHours}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {isEs ? 'Periodo de servicio' : 'Service period'}
                </dt>
                <dd className="mt-0.5">
                  {formatDate(outcome.record.periodStart)} — {formatDate(outcome.record.periodEnd)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {isEs ? 'Emitida por' : 'Issued by'}
                </dt>
                <dd className="mt-0.5">
                  {outcome.record.issuedByName}
                  {outcome.record.issuedByTitle ? `, ${outcome.record.issuedByTitle}` : ''}
                  <span className="block text-xs text-[#5A5A5A]">
                    {formatDate(outcome.record.issuedAt.slice(0, 10))}
                  </span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {isEs ? 'Número' : 'Certificate number'}
                </dt>
                <dd className="font-mono tracking-wider mt-0.5">{outcome.record.certificateNo}</dd>
              </div>
            </dl>

            <p className="text-[11px] text-[#5A5A5A] border-t border-[#E5E0D8] pt-4">
              {isEs
                ? `Las horas mostradas fueron registradas por personal de ${SITE_NAME} después de cada turno, con base en la asistencia observada.`
                : `The hours shown were recorded by ${SITE_NAME} staff after each shift, on the basis of attendance observed on the day.`}
            </p>
          </div>
        )}

        {outcome.state === 'missing' && (
          <div className="rounded-2xl border border-[#A64D32]/40 bg-[#A64D32]/5 p-6 space-y-2">
            <div className="flex items-center gap-3 text-[#A64D32] font-bold">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <span className="text-lg">{isEs ? 'No encontrada' : 'No matching certificate'}</span>
            </div>
            <p className="text-sm text-[#5A5A5A]">
              {isEs
                ? 'Ningún registro coincide con ese número. Revisa que esté escrito exactamente como aparece impreso — el cero y la letra O son distintos.'
                : 'No record matches that number. Check it against the printed copy — note that the alphabet used excludes the letters I, L, O and U, so a character that looks like one of those is a digit.'}
            </p>
            <p className="text-sm text-[#5A5A5A]">
              {isEs ? 'Si el problema persiste, escribe a ' : 'If it still does not match, write to '}
              <a href={`mailto:${ORG_EMAIL}`} className="text-[#A64D32] font-bold hover:underline">
                {ORG_EMAIL}
              </a>
              .
            </p>
          </div>
        )}

        {outcome.state === 'error' && (
          <div className="rounded-2xl border border-[#A64D32]/40 bg-[#A64D32]/5 p-6 text-sm text-[#A64D32]">
            {isEs
              ? 'No pudimos comprobar la constancia en este momento. Inténtalo de nuevo en unos minutos.'
              : 'We could not check the certificate just now. Please try again in a few minutes.'}
          </div>
        )}

        <div className="text-center text-[11px] text-[#5A5A5A] space-y-1 pt-4">
          <p className="font-bold">{SITE_NAME}</p>
          <p>{ORG_ADDRESS}</p>
          <p>
            {isEs ? 'Organización sin fines de lucro 501(c)(3)' : '501(c)(3) non-profit organization'}
          </p>
        </div>

      </div>
    </section>
  );
};
