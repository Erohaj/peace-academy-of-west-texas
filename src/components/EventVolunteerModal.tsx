import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  CheckCircle2,
  AlertCircle,
  HandHeart,
  User,
  Mail,
  Phone,
  MessageSquare,
  Clock,
  ArrowRight,
  Award
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ActionError, Shift } from '../types';
import { ModalShell } from './ModalShell';

const TITLE_ID = 'event-volunteer-title';

/** How a shift reads to somebody deciding whether they can take it. */
type ShiftAvailability = 'open' | 'full' | 'closed';

function availabilityOf(shift: Shift, now: number): ShiftAvailability {
  // A shift still running stays open — the same rule signup_event_volunteer
  // enforces, so the form and the database agree about what is takeable.
  if (new Date(shift.endsAt).getTime() <= now) return 'closed';
  if (shift.spotsFilled >= shift.spotsTotal) return 'full';
  return 'open';
}

/**
 * Signing up to help at one event, without an account.
 *
 * The volunteer portal is the other path and the richer one: it carries the
 * signed paperwork and the hours ledger a certificate is built from. It also
 * asks for an account and six documents first, which is more than somebody who
 * heard about Saturday's parade on Friday is going to do. This form is the
 * other end of that trade — a name, an email and a shift — and it says plainly
 * what the trade costs, because "my hours never got recorded" is a complaint
 * that can only be answered before the event, not after.
 *
 * Capacity is never decided here. The remaining count below was read when the
 * page loaded; `signup_event_volunteer` re-checks it under a row lock, and a
 * shift that filled up in between comes back as an error this form shows
 * without closing, so the volunteer can pick another one.
 */
export const EventVolunteerModal: React.FC = () => {
  const { t } = useTranslation();
  const {
    selectedEventForVolunteer,
    closeVolunteerSignup,
    submitEventVolunteer,
    setActiveTab,
    shifts,
    language
  } = useAppStore();

  const [shiftId, setShiftId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ActionError | null>(null);
  const [errors, setErrors] = useState<{ shift?: string; fullName?: string; email?: string }>({});
  /** The shift just signed up for, which is also what puts the form on its confirmation. */
  const [signedUpFor, setSignedUpFor] = useState<Shift | null>(null);

  // Mounted once at the App root and rendering null while closed, so state
  // survives between openings — reset on each one, or reopening drops the
  // visitor back onto the previous confirmation with stale details.
  const activeEventId = selectedEventForVolunteer?.id;
  useEffect(() => {
    if (!activeEventId) return;
    setShiftId('');
    setFullName('');
    setEmail('');
    setPhone('');
    setNote('');
    setIsSubmitting(false);
    setSubmitError(null);
    setErrors({});
    setSignedUpFor(null);
  }, [activeEventId]);

  // `now` is captured per render rather than ticking: a shift ending mid-visit
  // would otherwise rearrange the list under the cursor, and the database has
  // the final say on whether it is still takeable anyway.
  const eventShifts = useMemo(() => {
    if (!activeEventId) return [];
    const now = Date.now();

    return shifts
      .filter((shift) => shift.eventId === activeEventId)
      .map((shift) => ({ shift, availability: availabilityOf(shift, now) }))
      // Open shifts first, then by start time: what somebody can actually take
      // belongs above what they cannot.
      .sort((a, b) => {
        if (a.availability === 'open' !== (b.availability === 'open')) {
          return a.availability === 'open' ? -1 : 1;
        }
        return a.shift.startsAt.localeCompare(b.shift.startsAt);
      });
  }, [shifts, activeEventId]);

  if (!selectedEventForVolunteer) return null;

  const eventTitle =
    language === 'es' ? selectedEventForVolunteer.titleEs : selectedEventForVolunteer.title;

  const shiftLabel = (shift: Shift) => (language === 'es' ? shift.titleEs : shift.title);

  const availabilityLabel = (shift: Shift, availability: ShiftAvailability) => {
    if (availability === 'closed') return t('eventVolunteer.closed');
    if (availability === 'full') return t('eventVolunteer.full');

    const remaining = shift.spotsTotal - shift.spotsFilled;
    // i18next plural suffixes are not wired up in this project, so the
    // singular is its own string rather than a count of one.
    return remaining === 1
      ? t('eventVolunteer.lastSpot')
      : t('eventVolunteer.spotsLeft', { count: remaining });
  };

  const errorMessage = (code: ActionError) => {
    switch (code) {
      case 'shift_full':
        return t('eventVolunteer.errors.full');
      case 'already_registered':
        return t('eventVolunteer.errors.alreadySignedUp');
      case 'shift_not_found':
        return t('eventVolunteer.errors.shiftGone');
      case 'shift_over':
        return t('eventVolunteer.errors.shiftOver');
      case 'invalid_volunteer_details':
        return t('eventVolunteer.errors.invalidDetails');
      default:
        return t('eventVolunteer.errors.network');
    }
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();

    const nextErrors: typeof errors = {};
    if (!shiftId) nextErrors.shift = t('eventVolunteer.errors.shiftRequired');
    if (!fullName.trim()) nextErrors.fullName = t('eventVolunteer.errors.nameRequired');
    if (!email.trim()) nextErrors.email = t('eventVolunteer.errors.emailRequired');
    // Deliberately loose. The database applies the same shape of check, and a
    // stricter pattern here would reject real addresses — the confirmation
    // this path does not yet send is what would catch a typo anyway.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = t('eventVolunteer.errors.emailInvalid');
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const result = await submitEventVolunteer({
      shiftId,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      note: note.trim() || undefined
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setSignedUpFor(eventShifts.find((entry) => entry.shift.id === shiftId)?.shift ?? null);
  };

  /**
   * Back to an empty form, keeping the name and email.
   *
   * Somebody taking a second shift is the same person, and making them retype
   * their address is how you get two spellings of it in the roster.
   */
  const handleSignUpAnother = () => {
    setSignedUpFor(null);
    setShiftId('');
    setNote('');
    setSubmitError(null);
    setErrors({});
  };

  const openPortal = () => {
    closeVolunteerSignup();
    setActiveTab('volunteer');
  };

  return (
    <ModalShell
      isOpen={Boolean(selectedEventForVolunteer)}
      onClose={closeVolunteerSignup}
      labelledBy={TITLE_ID}
      // A stray backdrop click while the signup is in flight, or on the screen
      // that just confirmed it, reads as "my signup was cancelled".
      closeOnBackdrop={!isSubmitting && !signedUpFor}
      panelClassName="max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="bg-aged-paper px-6 py-4 border-b border-warm-taupe flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
            {signedUpFor ? t('eventVolunteer.successTitle') : t('eventVolunteer.heading')}
          </div>
          <h3
            id={TITLE_ID}
            className="text-lg font-serif font-bold text-graphite truncate max-w-[300px]"
          >
            {eventTitle}
          </h3>
        </div>

        <button
          onClick={closeVolunteerSignup}
          aria-label={t('rsvpModal.closeModal')}
          className="p-2 rounded-full hover:bg-black/5 text-charcoal transition-colors cursor-pointer pawtx-focus shrink-0"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="p-6 overflow-y-auto">
        {signedUpFor ? (
          <div className="space-y-5">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-olive/20 text-olive rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
              </div>
              <p className="text-sm text-charcoal leading-relaxed">
                {t('eventVolunteer.successBody', { shift: shiftLabel(signedUpFor) })}
              </p>
            </div>

            <div className="bg-aged-paper border border-warm-taupe rounded-2xl p-4">
              <p className="text-xs text-charcoal leading-relaxed">
                {t('eventVolunteer.successPaperwork')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignUpAnother}
              className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              {t('eventVolunteer.signUpAnother')}
            </button>

            <button
              type="button"
              onClick={closeVolunteerSignup}
              className="w-full bg-graphite hover:bg-black text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
            >
              {t('rsvpModal.closeModal')}
            </button>
          </div>
        ) : eventShifts.length === 0 ? (
          <div className="space-y-5">
            <div className="bg-aged-paper border border-warm-taupe rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-terracotta font-bold text-sm">
                <HandHeart className="w-4 h-4" aria-hidden="true" />
                <span>{t('eventVolunteer.heading')}</span>
              </div>
              <p className="text-xs text-charcoal leading-relaxed">
                {t('eventVolunteer.noShifts')}
              </p>
            </div>

            <button
              type="button"
              onClick={closeVolunteerSignup}
              className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              {t('rsvpModal.closeModal')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <p className="text-sm text-charcoal leading-relaxed">
              {t('eventVolunteer.subtitle')}
            </p>

            {submitError && (
              // `alert` so a shift that filled up between page load and submit
              // is announced, not just repainted — the fix is to pick a
              // different one, which the visitor has to be told about.
              <div
                role="alert"
                className="bg-terracotta/10 border border-terracotta/30 rounded-xl p-3 flex items-start gap-2"
              >
                <AlertCircle
                  className="w-4 h-4 text-terracotta mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold text-terracotta">
                  {errorMessage(submitError)}
                </p>
              </div>
            )}

            <fieldset>
              <legend className="pawtx-label">{t('eventVolunteer.pickShift')} *</legend>
              <div
                className="space-y-2"
                aria-describedby={errors.shift ? 'volunteer-error-shift' : undefined}
              >
                {eventShifts.map(({ shift, availability }) => {
                  const isOpen = availability === 'open';
                  const isChosen = shiftId === shift.id;

                  return (
                    <label
                      key={shift.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                        isOpen
                          ? `cursor-pointer ${
                              isChosen
                                ? 'border-terracotta bg-terracotta/5'
                                : 'border-warm-taupe hover:bg-aged-paper'
                            }`
                          : 'border-warm-taupe/60 bg-aged-paper/40 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="radio"
                        name="volunteer-shift"
                        value={shift.id}
                        checked={isChosen}
                        disabled={!isOpen}
                        onChange={() => {
                          setShiftId(shift.id);
                          setErrors((current) => ({ ...current, shift: undefined }));
                          setSubmitError(null);
                        }}
                        className="mt-1 accent-terracotta shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-sm text-graphite">
                          {shiftLabel(shift)}
                        </span>
                        <span className="block text-xs text-charcoal mt-0.5">
                          {shift.date} • {shift.time}
                        </span>
                        <span className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-2xs font-bold uppercase tracking-wider bg-aged-paper border border-warm-taupe text-charcoal px-2 py-0.5 rounded-full">
                            {language === 'es' ? shift.roleEs : shift.role}
                          </span>
                          <span className="text-2xs text-charcoal inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-terracotta" aria-hidden="true" />
                            {shift.durationHours} h
                          </span>
                          <span
                            className={`text-2xs font-bold ${
                              isOpen ? 'text-olive' : 'text-charcoal'
                            }`}
                          >
                            {availabilityLabel(shift, availability)}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.shift && (
                <p
                  id="volunteer-error-shift"
                  className="text-xs font-semibold text-terracotta mt-1"
                >
                  {errors.shift}
                </p>
              )}
            </fieldset>

            <div>
              <label className="pawtx-label" htmlFor="volunteer-name">
                {t('eventVolunteer.fullName')} *
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                {/* aria-required rather than the native `required`: the
                    validation here is custom and translated, and the native
                    attribute would preempt it with a browser bubble in the
                    browser's own language. */}
                <input
                  id="volunteer-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('eventVolunteer.fullNamePlaceholder')}
                  aria-required="true"
                  aria-invalid={Boolean(errors.fullName)}
                  aria-describedby={errors.fullName ? 'volunteer-error-name' : undefined}
                  className="pawtx-field-icon"
                />
              </div>
              {errors.fullName && (
                <p id="volunteer-error-name" className="text-xs font-semibold text-terracotta mt-1">
                  {errors.fullName}
                </p>
              )}
            </div>

            <div>
              <label className="pawtx-label" htmlFor="volunteer-email">
                {t('eventVolunteer.email')} *
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="volunteer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('eventVolunteer.emailPlaceholder')}
                  aria-required="true"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'volunteer-error-email' : undefined}
                  className="pawtx-field-icon"
                />
              </div>
              {errors.email && (
                <p
                  id="volunteer-error-email"
                  className="text-xs font-semibold text-terracotta mt-1"
                >
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label className="pawtx-label" htmlFor="volunteer-phone">
                {t('eventVolunteer.phone')}
              </label>
              <div className="relative">
                <Phone
                  className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="volunteer-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('eventVolunteer.phonePlaceholder')}
                  className="pawtx-field-icon"
                />
              </div>
            </div>

            <div>
              <label className="pawtx-label" htmlFor="volunteer-note">
                {t('eventVolunteer.note')}
              </label>
              <div className="relative">
                <MessageSquare
                  className="w-4 h-4 text-charcoal absolute left-3.5 top-3.5"
                  aria-hidden="true"
                />
                <textarea
                  id="volunteer-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('eventVolunteer.notePlaceholder')}
                  rows={2}
                  // Matches the column's own CHECK, so a long note is trimmed
                  // in the field rather than rejected after submitting.
                  maxLength={500}
                  className="pawtx-field-icon resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-terracotta hover:bg-terracotta-deep text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              <HandHeart className="w-4 h-4" aria-hidden="true" />
              <span>
                {isSubmitting ? t('eventVolunteer.submitting') : t('eventVolunteer.submit')}
              </span>
            </button>

            {/* The limit of this path, where somebody who needs hours reads it
                before the event rather than after. */}
            <div className="bg-aged-paper border border-warm-taupe rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Award className="w-4 h-4 text-terracotta mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-charcoal leading-relaxed">
                  {t('eventVolunteer.hoursNotice')}
                </p>
              </div>
              <button
                type="button"
                onClick={openPortal}
                className="text-xs font-bold uppercase tracking-wider text-terracotta hover:text-terracotta-deep inline-flex items-center gap-1 cursor-pointer pawtx-focus rounded"
              >
                <span>{t('eventVolunteer.openPortal')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
};
