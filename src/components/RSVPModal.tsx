import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Calendar, Heart, User, Mail, Phone, Users as UsersIcon, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getGoogleCalendarUrl } from '../lib/eventDates';
import { ActionError } from '../types';

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
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});

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
    setErrors({});
  }, [activeEventId]);

  if (!selectedEventForRsvp) return null;

  const title = language === 'es' ? selectedEventForRsvp.titleEs : selectedEventForRsvp.title;

  const validateStep1 = () => {
    const errs: { fullName?: string; email?: string } = {};
    if (!fullName.trim()) errs.fullName = 'Name is required';
    if (!email.trim() || !email.includes('@')) errs.email = 'Valid email is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
    }
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
      optionalDonation: donationAmount || 0
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      
      {/* Modal Container */}
      <div className="bg-[#FDFBF7] rounded-[28px] border border-[#E5E0D8] shadow-[rgba(42,43,47,0.1)_12px_32px_80px_0px] max-w-lg w-full overflow-hidden relative text-[#2A2A2A] animate-scaleUp">
        
        {/* Header Bar */}
        <div className="bg-[#F4F1ED] px-6 py-4 border-b border-[#E5E0D8] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#A64D32]">
              {step === 1 && t('rsvpModal.step1Title')}
              {step === 2 && t('rsvpModal.step2Title')}
              {step === 3 && 'Confirmation'}
              {step === 4 && errorCopy.title}
            </div>
            <h3 className="text-lg font-serif font-bold text-[#2A2A2A] truncate max-w-[300px]">
              {title}
            </h3>
          </div>

          <button
            onClick={closeRsvpModal}
            className="p-2 rounded-full hover:bg-black/5 text-[#5A5A5A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          
          {/* STEP 1: Basic Guest Info */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                  {t('rsvpModal.fullName')} *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('rsvpModal.fullNamePlaceholder')}
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32] focus:ring-1 focus:ring-[#A64D32]"
                  />
                </div>
                {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                  {t('rsvpModal.email')} *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('rsvpModal.emailPlaceholder')}
                    className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32] focus:ring-1 focus:ring-[#A64D32]"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                    {t('rsvpModal.phone')}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('rsvpModal.phonePlaceholder')}
                      className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32] focus:ring-1 focus:ring-[#A64D32]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                    {t('rsvpModal.guests')}
                  </label>
                  <div className="relative">
                    <UsersIcon className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={guestCount}
                      onChange={(e) => setGuestCount(Number(e.target.value))}
                      className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32] focus:ring-1 focus:ring-[#A64D32]"
                    >
                      <option value={0}>0 (Just Me)</option>
                      <option value={1}>+1 Guest</option>
                      <option value={2}>+2 Guests</option>
                      <option value={3}>+3 Guests</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <span>{t('rsvpModal.continueToStep2')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </form>
          )}

          {/* STEP 2: Optional Donation Upsell */}
          {step === 2 && (
            <div className="space-y-6">
              
              <div className="bg-[#F4F1ED] p-4 rounded-2xl border border-[#E5E0D8] space-y-2">
                <div className="flex items-center gap-2 text-[#A64D32] font-bold text-sm">
                  <Heart className="w-4 h-4 fill-[#A64D32]" />
                  <span>{t('rsvpModal.optionalDonationTitle')}</span>
                </div>
                <p className="text-xs text-[#5A5A5A]">
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
                          ? 'border-[#A64D32] bg-[#A64D32] text-white shadow-sm'
                          : 'border-[#E5E0D8] bg-[#FDFBF7] text-[#2A2A2A] hover:bg-[#F4F1ED]'
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
                  donationAmount === 0 ? 'text-[#A64D32] underline font-bold' : 'text-[#5A5A5A] hover:text-[#2A2A2A]'
                }`}
              >
                {t('rsvpModal.noDonationOption')}
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 border border-[#E5E0D8] py-3 rounded-full text-xs font-bold uppercase tracking-wider text-[#5A5A5A] hover:bg-[#F4F1ED] cursor-pointer"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="w-2/3 bg-[#A64D32] hover:bg-[#8b3f28] text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
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
              
              <div className="w-16 h-16 bg-[#5B6346]/20 text-[#5B6346] rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h4 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                  {t('rsvpModal.successTitle')}
                </h4>
                <p className="text-sm text-[#5A5A5A] max-w-sm mx-auto">
                  {t('rsvpModal.successMessage', { email, title })}
                </p>
              </div>

              {/* Event Ticket Summary Box */}
              <div className="bg-[#F4F1ED] p-4 rounded-2xl border border-[#E5E0D8] text-left text-xs space-y-1.5">
                <div className="font-bold text-[#2A2A2A] text-sm font-serif">{title}</div>
                <div className="text-[#5A5A5A] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#A64D32]" />
                  <span>{selectedEventForRsvp.date} ({selectedEventForRsvp.time})</span>
                </div>
                <div className="text-[#5A5A5A]">Guest Pass: {fullName} (+{guestCount} guests)</div>
              </div>

              {/* Actions: Add to Calendar & Pass */}
              <div className="flex flex-col gap-2 pt-2">
                <a
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#2A2A2A] hover:bg-black text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{t('rsvpModal.addToCalendar')}</span>
                </a>

                <button
                  onClick={closeRsvpModal}
                  className="w-full border border-[#E5E0D8] hover:bg-[#F4F1ED] text-[#2A2A2A] py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {t('rsvpModal.closeModal')}
                </button>
              </div>

            </div>
          )}

          {/* STEP 4: Failure Screen */}
          {step === 4 && (
            <div className="text-center py-6 space-y-5 animate-fadeIn">

              <div className="w-16 h-16 bg-[#A64D32]/15 text-[#A64D32] rounded-full flex items-center justify-center mx-auto shadow-sm">
                <AlertCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h4 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                  {errorCopy.title}
                </h4>
                <p className="text-sm text-[#5A5A5A] max-w-sm mx-auto">
                  {errorCopy.text}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {/* A full event or a duplicate registration will not resolve by
                    retrying, so only offer the button when it can actually help. */}
                {errorCopy.retryable && (
                  <button
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting}
                    className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? t('rsvpModal.submitting') : t('rsvpModal.tryAgain')}
                  </button>
                )}

                <button
                  onClick={closeRsvpModal}
                  className="w-full border border-[#E5E0D8] hover:bg-[#F4F1ED] text-[#2A2A2A] py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {t('rsvpModal.closeModal')}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
