import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  FileSignature,
  ShieldAlert,
  X
} from 'lucide-react';
import {
  fetchAllApplicationsForAdmin,
  reviewApplication,
  type ApplicationRow
} from '../../lib/api/applications';
import {
  fetchCurrentDocuments,
  fetchSignaturesForApplication,
  type LegalDocument,
  type SignatureRow
} from '../../lib/api/legalDocuments';
import { useAppStore } from '../../store/useAppStore';

const STATUS_STYLES: Record<ApplicationRow['status'], string> = {
  submitted: 'bg-[#5A5A5A]/15 text-[#5A5A5A]',
  in_review: 'bg-[#A64D32]/15 text-[#A64D32]',
  approved: 'bg-[#5B6346]/15 text-[#5B6346]',
  declined: 'bg-red-900/10 text-red-800',
  withdrawn: 'bg-[#5A5A5A]/15 text-[#5A5A5A]'
};

/**
 * Staff review queue for volunteer applications.
 *
 * The five documents a volunteer signs (agreement, release, code of conduct,
 * media consent, and guardian consent where it applies) are shown per
 * application via `document_signatures.application_id` — which document,
 * under what typed name, and when. This is read-only: nobody edits or
 * deletes a signature here, admins included, because an execution record
 * that can be altered after the fact is not evidence of anything.
 */
export const ApplicationsAdmin: React.FC = () => {
  const adminId = useAppStore((state) => state.volunteer?.id);

  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicationRow['status'] | 'all'>('submitted');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signaturesByApp, setSignaturesByApp] = useState<Record<string, SignatureRow[]>>({});
  const [reviewNote, setReviewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [apps, docs] = await Promise.all([
        fetchAllApplicationsForAdmin(),
        fetchCurrentDocuments()
      ]);
      setRows(apps);
      setDocuments(docs);
    } catch (loadError) {
      console.error('[PAWTX] Failed to load applications', loadError);
      setError('Could not load applications.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const titleForVersion = useMemo(() => {
    const byVersionId = new Map(documents.map((d) => [d.versionId, d]));
    return (versionId: string) => byVersionId.get(versionId)?.title ?? 'Document';
  }, [documents]);

  const toggleExpand = async (row: ApplicationRow) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setReviewNote(row.review_note ?? '');
    if (!signaturesByApp[row.id]) {
      try {
        const sigs = await fetchSignaturesForApplication(row.id);
        setSignaturesByApp((current) => ({ ...current, [row.id]: sigs }));
      } catch (fetchError) {
        console.error('[PAWTX] Failed to load signatures for application', fetchError);
      }
    }
  };

  const handleReview = async (row: ApplicationRow, status: ApplicationRow['status']) => {
    if (!adminId) return;
    setIsSaving(true);
    setError(null);
    try {
      await reviewApplication(row.id, { status, review_note: reviewNote.trim() || null }, adminId);
      await load();
    } catch (reviewError) {
      console.error('[PAWTX] Failed to review application', reviewError);
      setError('Could not save this review. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const visibleRows = rows.filter((row) => statusFilter === 'all' || row.status === statusFilter);

  const filterOptions: { value: ApplicationRow['status'] | 'all'; label: string }[] = [
    { value: 'submitted', label: 'New' },
    { value: 'in_review', label: 'In review' },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
    { value: 'withdrawn', label: 'Withdrawn' },
    { value: 'all', label: 'All' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-serif font-bold">Volunteer applications</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {filterOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                statusFilter === value
                  ? 'bg-[#A64D32] text-white'
                  : 'bg-[#F4F1ED] text-[#2A2A2A] hover:bg-[#E5E0D8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#5A5A5A]">Loading applications...</p>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-[#5A5A5A]">No applications match this filter.</p>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((row) => {
            const isOpen = expandedId === row.id;
            const signatures = signaturesByApp[row.id] ?? [];

            return (
              <div
                key={row.id}
                className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => void toggleExpand(row)}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2">
                      {row.full_name}
                      {row.was_minor_at_submission && (
                        <span
                          title="Was a minor when they applied"
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-[#A64D32]/15 text-[#A64D32] px-2 py-0.5 rounded-full"
                        >
                          <ShieldAlert className="w-3 h-3" />
                          Minor
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#5A5A5A] truncate">{row.email}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_STYLES[row.status]}`}
                    >
                      {row.status.replace('_', ' ')}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#5A5A5A]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#5A5A5A]" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[#E5E0D8] p-5 space-y-5 bg-[#FDFBF7]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
                      <Field label="Phone" value={row.phone} />
                      <Field label="Date of birth" value={row.date_of_birth} />
                      <Field
                        label="Address"
                        value={[row.address_line, row.city, row.state, row.postal_code]
                          .filter(Boolean)
                          .join(', ')}
                      />
                      <Field
                        label="Emergency contact"
                        value={`${row.emergency_name} — ${row.emergency_phone}${row.emergency_relation ? ` (${row.emergency_relation})` : ''}`}
                      />
                      <Field label="Skills" value={row.skills} />
                      <Field label="Availability" value={row.availability} />
                      <Field
                        label="Youth programmes"
                        value={row.interested_in_youth_programs ? 'Interested — screening required' : null}
                      />
                      <Field label="Motivation" value={row.motivation} />
                    </div>

                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-2 flex items-center gap-1.5">
                        <FileSignature className="w-3.5 h-3.5" />
                        Signed documents
                      </div>
                      {signatures.length === 0 ? (
                        <p className="text-xs text-[#5A5A5A]">
                          Nothing signed against this application yet.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {signatures.map((sig) => (
                            <li
                              key={sig.id}
                              className="flex items-center justify-between text-xs bg-white border border-[#E5E0D8] rounded-lg px-3 py-2"
                            >
                              <span>
                                <strong>{titleForVersion(sig.version_id)}</strong>
                                {' — '}
                                {sig.signer_role === 'guardian'
                                  ? `${sig.signer_name} (guardian of ${sig.minor_name})`
                                  : sig.signer_name}
                                {sig.choice && ` — chose "${sig.choice.replace('_', ' ')}"`}
                              </span>
                              <span className="text-[#5A5A5A] whitespace-nowrap ml-3">
                                {new Date(sig.signed_at).toLocaleDateString('en-US', {
                                  dateStyle: 'medium'
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                        Review note
                      </label>
                      <textarea
                        rows={2}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="w-full bg-white border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                        placeholder="Optional — visible to staff only"
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => void handleReview(row, 'approved')}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-[#5B6346] hover:bg-[#4a5239] text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => void handleReview(row, 'declined')}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-white border border-[#E5E0D8] hover:bg-[#F4F1ED] text-[#2A2A2A] px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Decline
                      </button>
                      {row.status === 'submitted' && (
                        <button
                          onClick={() => void handleReview(row, 'in_review')}
                          disabled={isSaving}
                          className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer text-[#5A5A5A] hover:bg-[#F4F1ED] disabled:opacity-50"
                        >
                          Mark in review
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string | null }> = ({ label, value }) =>
  value ? (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">{label}</dt>
      <dd className="text-[#2A2A2A] mt-0.5">{value}</dd>
    </div>
  ) : null;
