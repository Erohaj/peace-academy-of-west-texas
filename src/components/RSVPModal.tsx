import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Calendar, Heart, User, Mail, Phone, Users as UsersIcon, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getGoogleCalendarUrl } from '../lib/eventDates';
import { ActionError, MediaConsent } from '../types';
import { donationsEnabled, emailEnabled } from '../lib/features';
import { ModalShell } from './ModalShell';

const TITLE_ID = 'rsvp-modal-title';

export const RSVPModal: React.FC = () => {
  const { t } = useTranslation();
  const { selectedEventForRsvp, closeRsvpModal, submitRsvp, language } = useAppStore();

  // Step 4 is the failure screen; the booking can be rejected by the database
  // (the event filled up, this email already registered) and used to land on
  // the success screen regardless.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  const [donationAmount, setDonationAmount] = useState<number | null>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ActionError | null>(null);
  // Deliberately starts unset. A pre-ticked "yes" is not permission anyone
  // gave, and this answer is the org's record of what it may publish.
  const [mediaConsent, setMediaConsent] = useState<MediaConsent | null>(null);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; mediaConsent?: string }>({});

  // The modal is mounted once at the App root and merely renders null while
  // closed, so its state survives between openings. Reset the wizard each time
  // it opens — otherwise reopening it drops the visitor back on the previous
  // RSVP's success screen with stale guest details.
  const activeEventId = selectedEventForRsvp?.id;
  useEffect(() => {
    if (!activeEventId) return;
    setStep(1);
    setFullName('');
    setEmail('');
    setPhone('');
    setGuestCount(0);
    setDonationAmount(10);
    setIsSubmitting(false);
    setSubmitError(null);
    setMediaConsent(null);
    setErrors({});
  }, [activeEventId]);

  if (!selectedEventForRsvp) return null;

  const title = language === 'es' ? selectedEventForRsvp.titleEs : selectedEventForRsvp.title;
  const needsMediaConsent = selectedEventForRsvp.collectMediaConsent;

  // Singular/plural picked here rather than through i18next's plural suffixes,
  // which nothing else in this project relies on. Only 1 is singular, so the
  // two Spanish and English forms cover every option in the list.
  const guestOptionLabel = (count: number) => {
    if (count === 0) return t('rsvpModal.guestsNone');
    return t(count === 1 ? 'rsvpModal.guestsCount' : 'rsvpModal.guestsCountPlural', { count });
  };

  const validateStep1 = () => {
    const errs: { fullName?: string; email?: string; mediaConsent?: string } = {};
    if (!fullName.trim()) errs.fullName = 'Name is required';
    if (!email.trim() || !email.includes('@')) errs.email = 'Valid email is required';
    if (needsMediaConsent && !mediaConsent) errs.mediaConsent = t('rsvpModal.mediaConsentRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    // The "Optional Event Support" step offers $10/$25/$50 buttons under
    // copy about tax-deductible giving, but takes no payment — it only
    // writes a number into the rsvps row. Someone who picks $25 leaves
    // believing they donated. Until the amount can actually be charged,
    // skip the step entirely rather than stage a transaction that isn't one.
    if (!donationsEnabled) {
      void handleFinalSubmit();
      return;
    }

    setStep(2);
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await submitRsvp({
      eventId: selectedEventForRsvp.id,
      fullName,
      email,
      phone,
      guestCount,
      // Zero when the donation step never ran — otherwise the default $10 in
      // component state would be recorded as a gift nobody chose.
      optionalDonation: donationsEnabled ? donationAmount || 0 : 0,
      // Only sent for events that asked; create_rsvp discards it otherwise.
      mediaConsent: needsMediaConsent ? mediaConsent : null
    });

    setIsSubmitting(false);

    if (result.ok) {
      setStep(3); // Success screen
    } else {
      setSubmitError(result.error ?? 'network');
      setStep(4); // Failure screen
    }
  };

  // Maps the coarse failure code to a message the visitor can act on. "Event
  // full" and "already registered" call for different next steps, so they must
  // not collapse into one generic apology.
  const errorCopy = (() => {
    switch (submitError) {
      case 'event_full':
        return { title: t('rsvpModal.errorFullTitle'), text: t('rsvpModal.errorFullText'), retryable: false };
      case 'already_registered':
        return {
          title: t('rsvpModal.errorDuplicateTitle'),
          text: t('rsvpModal.errorDuplicateText'),
          retryable: false
        };
      // The feed drops finished events, so this only appears on a page left
      // open across the event's end time. Retrying cannot help — the date has
      // passed — so the button that would offer it is withheld.
      case 'event_over':
        return {
          title: t('rsvpModal.errorOverTitle'),
          text: t('rsvpModal.errorOverText'),
          retryable: false
        };
      // Only reachable if the event gained the requirement after this page
      // loaded — retrying re-renders the form with the question on it.
      case 'media_consent_required':
        return {
          title: t('rsvpModal.errorConsentTitle'),
          text: t('rsvpModal.errorConsentText'),
          retryable: true
        };
      default:
        return {
          title: t('rsvpModal.errorGenericTitle'),
          text: t('rsvpModal.errorGenericText'),
          retryable: true
        };
    }
  })();

  const googleCalendarUrl = getGoogleCalendarUrl(selectedEventForRsvp, language === 'es');

  return (
    <ModalShell
      isOpen={Boolean(selectedEventForRsvp)}
      onClose={closeRsvpModal}
      labelledBy={TITLE_ID}
      // A stray backdrop click while the booking is in flight, or on the
      // screen that just confirmed it, reads as "my RSVP was cancelled".
      // Steps 3 and 4 are closed deliberately, with the button that says so.
      closeOnBackdrop={!isSubmitting && step < 3}
      panelClassName="max-w-lg w-full overflow-hidden"
    >
        {/* Header Bar */}
        <div className="bg-aged-paper px-6 py-4 border-b border-warm-taupe flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
              {step === 1 && t('rsvpModal.step1Title')}
              {step === 2 && t('rsvpModal.step2Title')}
              {step === 3 && t('rsvpModal.step3Title')}
              {step === 4 && errorCopy.title}
            </div>
            <h3 id={TITLE_ID} className="text-lg font-serif font-bold text-graphite truncate max-w-[300px]">
              {title}
            </h3>
          </div>

          <button
            onClick={closeRsvpModal}
            // Icon-only, so it reached a screen reader as an unlabelled
            // "button" — the same fix ContactModal already carries.
            aria-label={t('rsvpModal.closeModal')}
            className="p-2 rounded-full hover:bg-black/5 text-charcoal transition-colors cursor-pointer pawtx-focus"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          
          {/* STEP 1: Basic Guest Info */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-4">
              
              <div>
                <label className="pawtx-label">
                  {t('rsvpModal.fullName')} *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                  {/* aria-required rather than the native `required`: the
                      validation here is custom and translated, and the native
                      attribute would preempt it with a browser bubble in the
                      browser's own language. */}
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('rsvpModal.fullNamePlaceholder')}
                    aria-required="true"
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={errors.fullName ? 'rsvp-error-name' : undefined}
                    className="pawtx-field-icon"
                  />
                </div>
                {errors.fullName && (
                  <p id="rsvp-error-name" className="text-xs font-semibold text-terracotta mt-1">
                    {errors.fullName}
                  </p>
                )}
              </div>

              <div>
                <label className="pawtx-label">
                  {t('rsvpModal.email')} *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('rsvpModal.emailPlaceholder')}
                    aria-required="true"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'rsvp-error-email' : undefined}
                    className="pawtx-field-icon"
                  />
                </div>
                {errors.email && (
                  <p id="rsvp-error-email" className="text-xs font-semibold text-terracotta mt-1">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="pawtx-label">
                    {t('rsvpModal.phone')}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('rsvpModal.phonePlaceholder')}
                      className="pawtx-field-icon"
                    />
                  </div>
                </div>

                <div>
                  <label className="pawtx-label">
                    {t('rsvpModal.guests')}
                  </label>
                  <div className="relative">
                    <UsersIcon className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={guestCount}
                      onChange={(e) => setGuestCount(Number(e.target.value))}
                      className="pawtx-field-icon"
                    >
                      {[0, 1, 2, 3].map((count) => (
                        <option key={count} value={count}>
                          {guestOptionLabel(count)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Photo & video permission, for events the admin flagged. Shown
                  as three explicit choices rather than a single tickbox:
                  "photographs only" is a real answer people give, and a lone
                  checkbox would force it into a yes or a no. */}
              {needsMediaConsent && (
                <fieldset className="bg-aged-paper border border-warm-taupe rounded-2xl p-4 space-y-3">
                  <legend className="px-1 text-xs font-bold uppercase tracking-[0.2em] text-charcoal">
                    {t('rsvpModal.mediaConsentTitle')} *
                  </legend>

                  <p className="text-xs text-charcoal leading-relaxed">
                    {t('rsvpModal.mediaConsentIntro')}
                  </p>

                  <div className="space-y-2">
                    {([
                      ['yes', t('rsvpModal.mediaConsentYes')],
                      ['photos_only', t('rsvpModal.mediaConsentPhotosOnly')],
                      ['no', t('rsvpModal.mediaConsentNo')]
                    ] as [MediaConsent, string][]).map(([value, copy]) => (
                      <label
                        key={value}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          mediaConsent === value
                            ? 'border-terracotta bg-parchment'
                            : 'border-warm-taupe bg-parchment/60 hover:bg-parchment'
                        }`}
                      >
                        <input
                          type="radio"
                          name="media-consent"
                          className="mt-0.5"
                          checked={mediaConsent === value}
                          onChange={() => {
                            setMediaConsent(value);
                            setErrors((current) => ({ ...current, mediaConsent: undefined }));
                          }}
                        />
                        <span className="text-xs text-graphite leading-relaxed">{copy}</span>
                      </label>
                    ))}
                  </div>

                  {errors.mediaConsent && (
                    <p className="text-xs text-terracotta font-semibold">{errors.mediaConsent}</p>
                  )}
                </fieldset>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-terracotta hover:bg-terracotta-deep text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {/* Without the donation step this button is the last one, so
                      it must not promise a "step 2" that no longer exists. */}
                  <span>
                    {isSubmitting
                      ? t('rsvpModal.submitting')
                      : donationsEnabled
                        ? t('rsvpModal.continueToStep2')
                        : t('rsvpModal.confirmRsvp')}
                  </span>
                  {!isSubmitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

            </form>
          )}

          {/* STEP 2: Optional Donation Upsell */}
          {step === 2 && (
            <div className="space-y-6">
              
              <div className="bg-aged-paper p-4 rounded-2xl border border-warm-taupe space-y-2">
                <div className="flex items-center gap-2 text-terracotta font-bold text-sm">
                  <Heart className="w-4 h-4 fill-terracotta" />
                  <span>{t('rsvpModal.optionalDonationTitle')}</span>
                </div>
                <p className="text-xs text-charcoal">
                  {t('rsvpModal.optionalDonationSubtitle')}
                </p>
              </div>

              {/* Donation Amount Selectors */}
              <div className="grid grid-cols-3 gap-3">
                {[10, 25, 50].map((amt) => {
                  const isSelected = donationAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDonationAmount(amt)}
                      className={`py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'border-terracotta bg-terracotta text-white shadow-sm'
                          : 'border-warm-taupe bg-parchment text-graphite hover:bg-aged-paper'
                      }`}
                    >
                      ${amt}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setDonationAmount(0)}
                className={`w-full py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  donationAmount === 0 ? 'text-terracotta underline font-bold' : 'text-charcoal hover:text-graphite'
                }`}
              >
                {t('rsvpModal.noDonationOption')}
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 border border-warm-taupe py-3 rounded-full text-xs font-bold uppercase tracking-wider text-charcoal hover:bg-aged-paper cursor-pointer pawtx-focus"
                >
                  {t('common.back')}
                </button>

                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="w-2/3 bg-terracotta hover:bg-terracotta-deep text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>{t('rsvpModal.submitting')}</span>
                  ) : (
                    <>
                      <span>{t('rsvpModal.confirmRsvp')}</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: Success Confirmation Screen */}
          {step === 3 && (
            <div className="text-center py-6 space-y-5 animate-fadeIn">
              
              <div className="w-16 h-16 bg-olive/20 text-olive rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h4 className="pawtx-card-heading">
                  {t('rsvpModal.successTitle')}
                </h4>
                <p className="text-sm text-charcoal max-w-sm mx-auto">
                  {/* Only promise an email when one can actually be sent. */}
                  {emailEnabled
                    ? t('rsvpModal.successMessage', { email, title })
                    : t('rsvpModal.successMessageNoEmail', { title })}
                </p>
              </div>

              {/* Event Ticket Summary Box */}
              <div className="bg-aged-paper p-4 rounded-2xl border border-warm-taupe text-left text-xs space-y-1.5">
                <div className="font-bold text-graphite text-sm font-serif">{title}</div>
                <div className="text-charcoal flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-terracotta" />
                  <span>{selectedEventForRsvp.date} ({selectedEventForRsvp.time})</span>
                </div>
                <div className="text-charcoal">
                  {guestCount > 0
                    ? t('rsvpModal.guestPassWithGuests', {
                        name: fullName,
                        // Reuses the dropdown's label so "+1 guest" stays
                        // singular here too.
                        guests: guestOptionLabel(guestCount)
                      })
                    : t('rsvpModal.guestPass', { name: fullName })}
                </div>
              </div>

              {/* Actions: Add to Calendar & Pass */}
              <div className="flex flex-col gap-2 pt-2">
                <a
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-graphite hover:bg-black text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{t('rsvpModal.addToCalendar')}</span>
                </a>

                <button
                  onClick={closeRsvpModal}
                  className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {t('rsvpModal.closeModal')}
                </button>
              </div>

            </div>
          )}

          {/* STEP 4: Failure Screen */}
          {step === 4 && (
            <div className="text-center py-6 space-y-5 animate-fadeIn">

              <div className="w-16 h-16 bg-terracotta/15 text-terracotta rounded-full flex items-center justify-center mx-auto shadow-sm">
                <AlertCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h4 className="pawtx-card-heading">
                  {errorCopy.title}
                </h4>
                <p className="text-sm text-charcoal max-w-sm mx-auto">
                  {errorCopy.text}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {/* A full event or a duplicate registration will not resolve by
                    retrying, so only offer the button when it can actually help. */}
                {errorCopy.retryable && (
                  <button
                    onClick={() => void handleFinalSubmit()}
                    disabled={isSubmitting}
                    className="w-full bg-terracotta hover:bg-terracotta-deep text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? t('rsvpModal.submitting') : t('rsvpModal.tryAgain')}
                  </button>
                )}

                <button
                  onClick={closeRsvpModal}
                  className="w-full border border-warm-taupe hover:bg-aged-paper text-graphite py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {t('rsvpModal.closeModal')}
                </button>
              </div>

            </div>
          )}

        </div>
    </ModalShell>
  );
};
