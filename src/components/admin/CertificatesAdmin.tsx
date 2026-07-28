import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Award, Search, ShieldOff, Eye, EyeOff } from 'lucide-react';
import { fetchAllVolunteersForAdmin, type ProfileRow } from '../../lib/api/profile';
import { fetchServiceLogForUserInRange } from '../../lib/api/serviceLog';
import { fetchShiftTitlesByIds } from '../../lib/api/shifts';
import {
  fetchMyCertificates,
  issueCertificate,
  revokeCertificate,
  type CertificateEntry,
  type CertificateRow
} from '../../lib/api/certificates';
import { useAppStore } from '../../store/useAppStore';
import { CertificateView } from '../CertificateView';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const startOfYear = isoDate(new Date(new Date().getFullYear(), 0, 1));
const today = isoDate(new Date());

/**
 * Issuing a certificate of service.
 *
 * Deliberately a two-step process: load the credited hours for a volunteer
 * over a date range and show them before anything is written, then issue
 * only on a second, explicit action. What ends up on the printed document is
 * exactly what the admin saw and approved — issueCertificate() takes that
 * snapshot as an argument rather than re-querying at write time, so a
 * correction made in another tab thirty seconds later cannot change a number
 * nobody agreed to.
 */
export const CertificatesAdmin: React.FC = () => {
  const adminId = useAppStore((state) => state.volunteer?.id);
  const adminName = useAppStore((state) => state.volunteer?.fullName ?? 'Staff');

  const [volunteers, setVolunteers] = useState<ProfileRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  const [periodStart, setPeriodStart] = useState(startOfYear);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [entries, setEntries] = useState<CertificateEntry[] | null>(null);
  const [issuerTitle, setIssuerTitle] = useState('');
  const [isLoadingHours, setIsLoadingHours] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justIssued, setJustIssued] = useState<CertificateRow | null>(null);

  const [pastCertificates, setPastCertificates] = useState<CertificateRow[]>([]);
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAllVolunteersForAdmin()
      .then(setVolunteers)
      .catch((loadError) => console.error('[PAWTX] Failed to load volunteers', loadError));
  }, []);

  const loadPastCertificates = useCallback(async (userId: string) => {
    try {
      setPastCertificates(await fetchMyCertificates(userId));
    } catch (loadError) {
      console.error('[PAWTX] Failed to load past certificates', loadError);
    }
  }, []);

  const selectVolunteer = (profile: ProfileRow) => {
    setSelected(profile);
    setSearch('');
    setEntries(null);
    setJustIssued(null);
    setError(null);
    void loadPastCertificates(profile.id);
  };

  const handleLoadHours = async () => {
    if (!selected) return;
    setIsLoadingHours(true);
    setError(null);
    setEntries(null);
    try {
      const log = await fetchServiceLogForUserInRange(selected.id, periodStart, periodEnd);
      const shiftIds = [...new Set(log.map((row) => row.shift_id).filter((id): id is string => !!id))];
      const titles = await fetchShiftTitlesByIds(shiftIds);

      setEntries(
        log.map((row) => ({
          servedOn: row.served_on,
          hours: Number(row.hours),
          description: row.shift_id
            ? (titles.get(row.shift_id)?.title ?? 'Volunteer shift')
            : (row.note ?? 'Community service')
        }))
      );
    } catch (loadError) {
      console.error('[PAWTX] Failed to load hours for certificate', loadError);
      setError('Could not load this volunteer’s hours. Please try again.');
    } finally {
      setIsLoadingHours(false);
    }
  };

  const totalHours = entries ? Math.round(entries.reduce((s, e) => s + e.hours, 0) * 100) / 100 : 0;

  const handleIssue = async () => {
    if (!selected || !entries || !adminId) return;
    setIsIssuing(true);
    setError(null);
    try {
      const certificate = await issueCertificate({
        userId: selected.id,
        recipientName: selected.full_name || selected.email,
        periodStart,
        periodEnd,
        entries,
        issuedBy: adminId,
        issuedByName: adminName,
        issuedByTitle: issuerTitle.trim() || null
      });
      setJustIssued(certificate);
      setEntries(null);
      void loadPastCertificates(selected.id);
    } catch (issueError) {
      console.error('[PAWTX] Failed to issue certificate', issueError);
      setError('Could not issue the certificate. Please try again.');
    } finally {
      setIsIssuing(false);
    }
  };

  const handleRevoke = async (cert: CertificateRow) => {
    const reason = window.prompt(
      `Withdraw certificate ${cert.certificate_no}? This will show as withdrawn to anyone who checks it — enter why:`
    );
    if (reason === null) return;
    try {
      await revokeCertificate(cert.id, reason.trim() || 'Withdrawn by staff');
      if (selected) void loadPastCertificates(selected.id);
    } catch (revokeError) {
      console.error('[PAWTX] Failed to revoke certificate', revokeError);
      setError('Could not withdraw this certificate.');
    }
  };

  const filteredVolunteers = search.trim()
    ? volunteers.filter(
        (v) =>
          v.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          v.email.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold">Certificates of service</h2>

      {error && (
        <div className="pawtx-callout">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="pawtx-card">
        <div className="relative">
          <label className="pawtx-label">Volunteer</label>
          {selected ? (
            <div className="flex items-center justify-between bg-white border border-warm-taupe rounded-xl px-4 py-2.5">
              <span className="text-sm font-bold">
                {selected.full_name || selected.email}
                <span className="font-normal text-charcoal ml-2">{selected.email}</span>
              </span>
              <button
                onClick={() => {
                  setSelected(null);
                  setEntries(null);
                  setJustIssued(null);
                }}
                className="text-xs font-bold text-terracotta cursor-pointer uppercase tracking-wider"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className={`pawtx-field pl-10`}
                />
              </div>
              {filteredVolunteers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-warm-taupe rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {filteredVolunteers.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => selectVolunteer(v)}
                      className="w-full text-left px-4 py-2.5 hover:bg-aged-paper cursor-pointer text-sm border-b border-aged-paper last:border-0"
                    >
                      <span className="font-bold">{v.full_name || v.email}</span>
                      <span className="text-charcoal ml-2 text-xs">{v.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="pawtx-label">Period start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    setEntries(null);
                  }}
                  className="pawtx-field"
                />
              </div>
              <div>
                <label className="pawtx-label">Period end</label>
                <input
                  type="date"
                  max={today}
                  value={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value);
                    setEntries(null);
                  }}
                  className="pawtx-field"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => void handleLoadHours()}
                  disabled={isLoadingHours}
                  className="w-full bg-white border border-warm-taupe hover:bg-parchment px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {isLoadingHours ? 'Loading...' : 'Load hours'}
                </button>
              </div>
            </div>

            {entries && (
              <div className="bg-white border border-warm-taupe rounded-xl p-4 space-y-3">
                {entries.length === 0 ? (
                  <p className="text-xs text-charcoal">
                    No credited hours in this range. There is nothing to certify.
                  </p>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <tbody>
                        {entries.map((entry, i) => (
                          <tr key={i} className="border-b border-aged-paper last:border-0">
                            <td className="py-1.5 text-charcoal whitespace-nowrap">
                              {entry.servedOn}
                            </td>
                            <td className="py-1.5">{entry.description}</td>
                            <td className="py-1.5 text-right font-bold whitespace-nowrap">
                              {entry.hours} hrs
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between pt-2 border-t border-warm-taupe font-bold text-sm">
                      <span>Total</span>
                      <span className="text-terracotta">{totalHours} hrs</span>
                    </div>

                    <div>
                      <label className="pawtx-label">Your title (optional, printed on the certificate)</label>
                      <input
                        className="pawtx-field"
                        placeholder="Volunteer Coordinator"
                        value={issuerTitle}
                        onChange={(e) => setIssuerTitle(e.target.value)}
                      />
                    </div>

                    <button
                      onClick={() => void handleIssue()}
                      disabled={isIssuing}
                      className="flex items-center gap-2 pawtx-cta"
                    >
                      <Award className="w-4 h-4" />
                      {isIssuing ? 'Issuing...' : `Issue certificate for ${totalHours} hours`}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {justIssued && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-olive">
            Certificate issued — {justIssued.certificate_no}
          </h3>
          <CertificateView certificate={justIssued} />
        </div>
      )}

      {selected && pastCertificates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">
            Previously issued
          </h3>
          {pastCertificates.map((cert) => (
            <div key={cert.id} className="bg-aged-paper border border-warm-taupe rounded-xl">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-xs">
                  <span className="font-mono font-bold">{cert.certificate_no}</span>
                  <span className="text-charcoal ml-3">
                    {cert.period_start} — {cert.period_end} · {Number(cert.total_hours)} hrs
                  </span>
                  {cert.revoked_at && (
                    <span className="ml-3 text-[10px] font-bold uppercase tracking-wider bg-terracotta/15 text-terracotta px-2 py-0.5 rounded-full">
                      Withdrawn
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedCertId(expandedCertId === cert.id ? null : cert.id)}
                    className="p-1.5 rounded-lg hover:bg-white text-charcoal cursor-pointer"
                    title="View"
                  >
                    {expandedCertId === cert.id ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  {!cert.revoked_at && (
                    <button
                      onClick={() => void handleRevoke(cert)}
                      className="p-1.5 rounded-lg hover:bg-terracotta/10 text-terracotta cursor-pointer"
                      title="Withdraw"
                    >
                      <ShieldOff className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {expandedCertId === cert.id && (
                <div className="border-t border-warm-taupe p-4">
                  <CertificateView certificate={cert} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
