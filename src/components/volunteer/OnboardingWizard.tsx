import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { MarkdownDocument } from './MarkdownDocument';
import {
  fetchCurrentDocuments,
  fetchMySignatures,
  signDocument,
  type LegalDocument,
  type SignatureRow
} from '../../lib/api/legalDocuments';
import { SignedDocumentView } from './SignedDocumentView';
import {
  ageOn,
  fetchMyApplication,
  submitApplication,
  type ApplicationRow,
  type SubmitApplicationInput
} from '../../lib/api/applications';

const BLANK_APPLICATION: SubmitApplicationInput = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  addressLine: '',
  city: '',
  state: 'TX',
  postalCode: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
  skills: '',
  availability: '',
  languages: '',
  interestedInYouthPrograms: false,
  motivation: ''
};

const field =
  'w-full bg-white border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm pawtx-focus focus:border-[#A64D32]';
const label = 'block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1';

/**
 * The order these are signed in. `application` is deliberately absent — it is
 * a form to fill in, not a page to read and sign, and step 1 below handles it
 * as such. `guardian_consent` is filtered in only when the applicant was a
 * minor at submission; see the comment on that field in applications.ts for
 * why age is read from the frozen application rather than recomputed.
 */
const SIGNABLE_KINDS = ['agreement', 'release', 'code_of_conduct', 'media_consent'] as const;

type WizardStep =
  | { kind: 'loading' }
  | { kind: 'application' }
  | { kind: 'under-13-gate' }
  | { kind: 'sign'; document: LegalDocument }
  | { kind: 'guardian-consent'; document: LegalDocument }
  | { kind: 'complete' }
  | { kind: 'error'; message: string };

/**
 * Collects the paperwork a volunteer has to have on file before their first
 * shift: the application, the agreement, the release, the code of conduct,
 * media consent, and — only when they were a minor when they applied — a
 * parent or guardian's consent.
 *
 * One document at a time, in a fixed order, and nothing is skippable. A
 * volunteer who already signed everything sees a summary instead; one who
 * has signed some but not all resumes at the first thing still missing,
 * which is why the step is derived from what is actually on file rather than
 * tracked as separate wizard-only state.
 */
export const OnboardingWizard: React.FC = () => {
  const volunteer = useAppStore((state) => state.volunteer);
  const userId = volunteer?.id;

  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [application, setApplication] = useState<ApplicationRow | null>(null);
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived, not stored separately: the step logic only ever needs "is this
  // version id signed", and keeping one Set in sync with `signatures` by hand
  // is one more way for the two to quietly drift apart.
  const signedVersionIds = useMemo(
    () => new Set(signatures.map((s) => s.version_id)),
    [signatures]
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [docs, app, sigs] = await Promise.all([
        fetchCurrentDocuments(),
        fetchMyApplication(userId),
        fetchMySignatures(userId)
      ]);
      setDocuments(docs);
      setApplication(app);
      setSignatures(sigs);
    } catch (error) {
      console.error('[PAWTX] Failed to load onboarding paperwork', error);
      setLoadError('Could not load the volunteer paperwork. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMinor = application ? application.was_minor_at_submission : false;

  const step: WizardStep = useMemo(() => {
    if (isLoading) return { kind: 'loading' };
    if (loadError) return { kind: 'error', message: loadError };
    if (!application) return { kind: 'application' };

    // Zero documents loaded is indistinguishable, further down, from every
    // required one already being signed — the loop below simply never finds
    // anything to require. That is the one case worth telling apart from a
    // real "complete": it means the document catalogue itself is missing or
    // unreachable, and declaring paperwork done under that condition would
    // let someone volunteer having agreed to nothing at all.
    if (documents.length === 0) {
      return {
        kind: 'error',
        message:
          'No volunteer documents are on file to sign. This is a setup problem, not something wrong with your application — please tell a staff member before scheduling a shift.'
      };
    }

    const requiredSlugOrder = [
      'volunteer-agreement',
      'release-and-waiver',
      'code-of-conduct',
      'media-consent',
      ...(isMinor ? ['guardian-consent'] : [])
    ];

    for (const slug of requiredSlugOrder) {
      const doc = documents.find((d) => d.slug === slug);
      if (doc && !signedVersionIds.has(doc.versionId)) {
        return doc.kind === 'guardian_consent'
          ? { kind: 'guardian-consent', document: doc }
          : { kind: 'sign', document: doc };
      }
    }

    return { kind: 'complete' };
  }, [isLoading, loadError, application, documents, signedVersionIds, isMinor]);

  const handleApplicationSubmitted = () => void load();
  const handleSigned = () => void load();

  if (step.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-[#5A5A5A] py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading your paperwork...</span>
      </div>
    );
  }

  if (step.kind === 'error') {
    return (
      <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{step.message}</span>
      </div>
    );
  }

  if (step.kind === 'application') {
    return (
      <ApplicationForm
        userId={userId!}
        defaultEmail={volunteer?.email ?? ''}
        defaultName={volunteer?.fullName && volunteer.fullName !== volunteer.email ? volunteer.fullName : ''}
        onSubmitted={handleApplicationSubmitted}
      />
    );
  }

  if (step.kind === 'sign') {
    return (
      <SignStep
        key={step.document.versionId}
        userId={userId!}
        applicationId={application!.id}
        document={step.document}
        defaultName={volunteer?.fullName && volunteer.fullName !== volunteer.email ? volunteer.fullName : ''}
        defaultEmail={volunteer?.email ?? ''}
        onSigned={handleSigned}
      />
    );
  }

  if (step.kind === 'guardian-consent') {
    return (
      <GuardianConsentStep
        key={step.document.versionId}
        userId={userId!}
        applicationId={application!.id}
        document={step.document}
        minorName={application!.full_name}
        onSigned={handleSigned}
      />
    );
  }

  return <CompletedPaperwork documents={documents} signatures={signatures} />;
};

/**
 * The done state — and a record of exactly what was agreed to, not just a
 * congratulatory message. Fetched on demand per document rather than all at
 * once: most volunteers never reopen these once signed.
 */
const CompletedPaperwork: React.FC<{
  documents: LegalDocument[];
  signatures: SignatureRow[];
}> = ({ documents, signatures }) => {
  const [expandedSignatureId, setExpandedSignatureId] = useState<string | null>(null);
  const titleFor = (versionId: string) =>
    documents.find((d) => d.versionId === versionId)?.title ?? 'Document';

  return (
    <div className="space-y-4">
      <div className="bg-[#5B6346]/10 border border-[#5B6346]/30 rounded-2xl p-6 flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-[#5B6346] shrink-0" />
        <div>
          <div className="font-bold text-[#2A2A2A]">All paperwork is on file</div>
          <p className="text-xs text-[#5A5A5A] mt-1">
            Your application, agreement, release, code of conduct and media consent are all
            signed and dated. You're clear to take a shift.
          </p>
        </div>
      </div>

      {signatures.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
            What you signed
          </h4>
          {signatures.map((sig) => (
            <div key={sig.id} className="bg-white border border-[#E5E0D8] rounded-xl">
              <button
                onClick={() =>
                  setExpandedSignatureId(expandedSignatureId === sig.id ? null : sig.id)
                }
                className="w-full flex items-center justify-between text-xs px-4 py-3 cursor-pointer text-left"
              >
                <span className="font-bold text-[#2A2A2A]">{titleFor(sig.version_id)}</span>
                <span className="flex items-center gap-3 text-[#5A5A5A]">
                  {new Date(sig.signed_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  <span className="font-bold uppercase tracking-wider text-[#A64D32]">
                    {expandedSignatureId === sig.id ? 'Hide' : 'View / print'}
                  </span>
                </span>
              </button>
              {expandedSignatureId === sig.id && (
                <div className="border-t border-[#E5E0D8] p-4">
                  <SignedDocumentView title={titleFor(sig.version_id)} signature={sig} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 1: the application itself — a form, not a document to sign.
// ---------------------------------------------------------------------------

const ApplicationForm: React.FC<{
  userId: string;
  defaultEmail: string;
  defaultName: string;
  onSubmitted: () => void;
}> = ({ userId, defaultEmail, defaultName, onSubmitted }) => {
  const [form, setForm] = useState<SubmitApplicationInput>({
    ...BLANK_APPLICATION,
    email: defaultEmail,
    fullName: defaultName
  });
  const [guardianOverride, setGuardianOverride] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = form.dateOfBirth ? ageOn(form.dateOfBirth) : null;
  // Below this, self-registration is out of scope for the portal — a parent
  // completes the form instead. See legal/01-volunteer-application.md.
  const needsGuardianOverride = age !== null && age < 13;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsGuardianOverride && !guardianOverride) return;

    setIsSaving(true);
    setError(null);
    try {
      await submitApplication(userId, form);
      onSubmitted();
    } catch (submitError) {
      console.error('[PAWTX] Failed to submit application', submitError);
      setError('Could not submit the application. Please check the required fields and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-2 bg-[#5B6346]/10 border border-[#5B6346]/30 rounded-xl px-4 py-3 text-xs text-[#5B6346]">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          We ask for this to place you in a role that suits you and to reach someone on your
          behalf if you are hurt while volunteering. We do not sell it or share it outside Peace
          Academy of West Texas except where the law requires. Submitting this does not commit
          you to anything.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">About you</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Full legal name *</label>
            <input
              required
              className={field}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Email *</label>
            <input
              required
              type="email"
              className={field}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input
              type="tel"
              className={field}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Date of birth *</label>
            <input
              required
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className={field}
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </div>
        </div>

        {age !== null && age < 18 && (
          <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Because this application is for someone under 18, a parent or legal guardian will
              need to review and sign a consent form before it is complete — that step comes
              after this one.
            </span>
          </div>
        )}

        {needsGuardianOverride && (
          <div className="bg-[#F4F1ED] border border-[#E5E0D8] rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs text-[#5A5A5A]">
              This portal is not set up for someone this young to register on their own. If you
              are that volunteer's parent or legal guardian, you can complete this form yourself
              on their behalf, entering their details above.
            </p>
            <label className="flex items-start gap-2 text-xs font-bold text-[#2A2A2A] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={guardianOverride}
                onChange={(e) => setGuardianOverride(e.target.checked)}
              />
              <span>
                I am the parent or legal guardian of the volunteer named above, and I am
                completing this application myself on their behalf.
              </span>
            </label>
          </div>
        )}

        <div>
          <label className={label}>Street address</label>
          <input
            className={field}
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>City</label>
            <input
              className={field}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>State</label>
            <input
              className={field}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>ZIP</label>
            <input
              className={field}
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
          Emergency contact
        </h3>
        <p className="text-xs text-[#5A5A5A]">
          We will only use this if you are hurt or taken ill while volunteering and we cannot
          reach you.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Name *</label>
            <input
              required
              className={field}
              value={form.emergencyName}
              onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Phone *</label>
            <input
              required
              type="tel"
              className={field}
              value={form.emergencyPhone}
              onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Relationship</label>
            <input
              className={field}
              value={form.emergencyRelation}
              onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#5A5A5A]">
          What would you like to do?
        </h3>
        <div>
          <label className={label}>Skills and experience</label>
          <textarea
            rows={2}
            className={field}
            placeholder="Languages spoken, food handling, first aid, driving, trades..."
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Availability</label>
          <input
            className={field}
            placeholder="Weekday evenings, Saturday mornings..."
            value={form.availability}
            onChange={(e) => setForm({ ...form, availability: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-[#2A2A2A] cursor-pointer">
          <input
            type="checkbox"
            checked={form.interestedInYouthPrograms}
            onChange={(e) => setForm({ ...form, interestedInYouthPrograms: e.target.checked })}
          />
          <span>I'm interested in helping with youth programmes</span>
        </label>
        {form.interestedInYouthPrograms && (
          <p className="text-[11px] text-[#5A5A5A] pl-6">
            Roles with unsupervised access to minors require screening before they begin — a
            staff member will follow up about what that involves.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 bg-[#F4F1ED] border border-[#E5E0D8] rounded-xl px-4 py-3 text-xs text-[#5A5A5A]">
        <FileText className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Submitting this application does not make you a volunteer. Before your first shift
          you'll be asked to read and sign the Volunteer Agreement, the Release and Waiver, and
          the Code of Conduct. Photo consent is separate, and optional.
        </span>
      </div>

      <button
        type="submit"
        disabled={isSaving || (needsGuardianOverride && !guardianOverride)}
        className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50"
      >
        {isSaving ? 'Submitting...' : 'Submit application'}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Steps 2-5: read a document, type your name, sign it.
// ---------------------------------------------------------------------------

const SignStep: React.FC<{
  userId: string;
  applicationId: string;
  document: LegalDocument;
  defaultName: string;
  defaultEmail: string;
  onSigned: () => void;
}> = ({ userId, applicationId, document, defaultName, defaultEmail, onSigned }) => {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [agreed, setAgreed] = useState(false);
  const [choice, setChoice] = useState<'yes' | 'photos_only' | 'no'>('yes');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMediaConsent = document.kind === 'media_consent';

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMediaConsent && !agreed) return;

    setIsSaving(true);
    setError(null);
    try {
      await signDocument(userId, {
        versionId: document.versionId,
        applicationId,
        signerName: name,
        signerEmail: email,
        signerRole: 'volunteer',
        bodyHash: document.bodyHash,
        choice: isMediaConsent ? choice : undefined
      });
      onSigned();
    } catch (signError) {
      console.error('[PAWTX] Failed to record signature', signError);
      setError('Could not save your signature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSign} className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-xl font-serif font-bold text-[#2A2A2A]">{document.title}</h3>
        <p className="text-xs text-[#5A5A5A] mt-1">Version {document.version}</p>
      </div>

      <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 max-h-[28rem] overflow-y-auto">
        <MarkdownDocument markdown={document.bodyMd} />
      </div>

      {isMediaConsent ? (
        <div className="space-y-2">
          <label className={label}>Your choice</label>
          {(
            [
              ['yes', 'Yes — I consent as described above'],
              ['photos_only', 'Photographs only — no video or audio'],
              ['no', 'No — please do not include me']
            ] as const
          ).map(([value, text]) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-[#2A2A2A] cursor-pointer bg-[#F4F1ED] rounded-xl px-4 py-2.5"
            >
              <input
                type="radio"
                name="media-choice"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              <span>{text}</span>
            </label>
          ))}
        </div>
      ) : (
        <label className="flex items-start gap-2 text-sm font-bold text-[#2A2A2A] cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I have read this document in full. I understand it is a binding agreement, and I
            sign it freely.
          </span>
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Your full legal name (typed) *</label>
          <input
            required
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Email *</label>
          <input
            required
            type="email"
            className={field}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-[11px] text-[#5A5A5A]">
        By typing your name and submitting this form, you intend it as your electronic signature
        under the federal ESIGN Act and the Texas Uniform Electronic Transactions Act.
      </p>

      <button
        type="submit"
        disabled={isSaving || (!isMediaConsent && !agreed)}
        className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : isMediaConsent ? 'Save my choice' : 'Sign and continue'}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Guardian consent — a different person signs this one.
// ---------------------------------------------------------------------------

const GuardianConsentStep: React.FC<{
  userId: string;
  applicationId: string;
  document: LegalDocument;
  minorName: string;
  onSigned: () => void;
}> = ({ userId, applicationId, document, minorName, onSigned }) => {
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;

    setIsSaving(true);
    setError(null);
    try {
      await signDocument(userId, {
        versionId: document.versionId,
        applicationId,
        signerName: guardianName,
        signerEmail: guardianEmail,
        signerRole: 'guardian',
        minorName,
        relationship,
        bodyHash: document.bodyHash
      });
      onSigned();
    } catch (signError) {
      console.error('[PAWTX] Failed to record guardian consent', signError);
      setError('Could not save this consent. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSign} className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-xl font-serif font-bold text-[#2A2A2A]">{document.title}</h3>
        <p className="text-xs text-[#5A5A5A] mt-1">
          This section is completed by <strong>{minorName}</strong>'s parent or legal guardian —
          not by {minorName} themselves.
        </p>
      </div>

      <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 max-h-[28rem] overflow-y-auto">
        <MarkdownDocument markdown={document.bodyMd} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Parent/guardian's full legal name (typed) *</label>
          <input
            required
            className={field}
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Parent/guardian's email *</label>
          <input
            required
            type="email"
            className={field}
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Relationship to {minorName} *</label>
          <input
            required
            className={field}
            placeholder="Mother, father, legal guardian..."
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm font-bold text-[#2A2A2A] cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I have read this document in full, I confirm I am {minorName}'s parent or legal
          guardian, and I sign it freely.
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-4 py-3 text-xs text-[#A64D32]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-[11px] text-[#5A5A5A] flex items-start gap-1.5">
        <UserRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        By typing your name and submitting this form, you intend it as your electronic signature
        under the federal ESIGN Act and the Texas Uniform Electronic Transactions Act, and you
        confirm you are the minor's parent or legal guardian.
      </p>

      <button
        type="submit"
        disabled={isSaving || !agreed}
        className="bg-[#A64D32] hover:bg-[#8b3f28] text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Sign as parent/guardian'}
      </button>
    </form>
  );
};
