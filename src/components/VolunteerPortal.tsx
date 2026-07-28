import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Clock, Calendar, Award, CheckCircle2, LogOut, ArrowRight, ShieldCheck, Filter, AlertCircle, LayoutDashboard, CalendarCheck, Sparkles, UserRound, FileCheck2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { VOLUNTEER_ROLES } from '../data/volunteerRoles';
import { VolunteerRole } from '../types';
import { OnboardingWizard } from './volunteer/OnboardingWizard';
import { CertificateView } from './CertificateView';
import { fetchMyCertificates, type CertificateRow } from '../lib/api/certificates';

export const VolunteerPortal: React.FC = () => {
  const { t } = useTranslation();
  const {
    isLoggedIn,
    volunteer,
    shifts,
    loginWithMagicLink,
    loginWithGoogle,
    logout,
    toggleShiftBooking,
    saveProfile,
    // Aliased: this component already has its own `activeTab` for the
    // dashboard's inner tabs, which is unrelated to the site-wide one.
    setActiveTab: setSiteTab,
    language,
    raw
  } = useAppStore();

  const serviceLog = raw.serviceLog;

  const [emailInput, setEmailInput] = useState('');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'shifts' | 'mySchedule' | 'hours' | 'profile' | 'forms'
  >('overview');
  const [selectedRole, setSelectedRole] = useState<VolunteerRole | 'all'>('all');
  const [loginSent, setLoginSent] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [certificatesLoaded, setCertificatesLoaded] = useState(false);
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null);

  // Loaded once, the first time the Hours tab is opened — not on every mount
  // of the portal, since most sessions never look at this tab at all.
  useEffect(() => {
    if (activeTab !== 'hours' || certificatesLoaded || !volunteer?.id) return;
    void fetchMyCertificates(volunteer.id)
      .then((rows) => {
        setCertificates(rows);
        setCertificatesLoaded(true);
      })
      .catch((error) => console.error('[PAWTX] Failed to load certificates', error));
  }, [activeTab, certificatesLoaded, volunteer?.id]);

  /**
   * True while the account has no real name on it.
   *
   * `fullName` falls back to the email address, so the check is against the
   * fallback rather than emptiness. Magic-link sign-in supplies no name at
   * all, and a service letter made out to an email address is not a document
   * anyone can hand to a school.
   */
  const needsName = Boolean(volunteer) && volunteer?.fullName === volunteer?.email;

  // Seeded from the profile once it arrives, and left alone afterwards so
  // typing is not overwritten by a background refresh.
  useEffect(() => {
    if (!volunteer) return;
    setNameInput(volunteer.fullName === volunteer.email ? '' : volunteer.fullName);
    setPhoneInput(volunteer.phone ?? '');
  }, [volunteer?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    const result = await saveProfile({ fullName: nameInput, phone: phoneInput });
    setIsSavingProfile(false);

    if (result.ok) setProfileMessage(t('volunteer.profileSaved'));
    else setProfileError(t('volunteer.profileError'));
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingLink(true);
    setLoginError(null);

    const result = await loginWithMagicLink(emailInput);
    setIsSendingLink(false);

    // Only claim the link was sent once it actually was. The previous version
    // flipped straight to the confirmation screen and logged the visitor in
    // regardless of whether any email existed.
    if (result.ok) {
      setLoginSent(true);
    } else {
      setLoginError(
        result.error === 'rate_limited'
          ? t('volunteer.magicLinkRateLimited')
          : t('volunteer.magicLinkError')
      );
    }
  };

  const handleGoogleSignIn = async () => {
    setLoginError(null);
    const result = await loginWithGoogle();
    // A successful call has already navigated to Google, so only failures
    // ever get to render — the provider not being enabled, most likely.
    if (!result.ok) setLoginError(t('volunteer.googleError'));
  };

  const handleToggleShift = async (shiftId: string) => {
    setShiftError(null);
    const result = await toggleShiftBooking(shiftId);
    if (!result.ok) {
      setShiftError(
        result.error === 'shift_full' ? t('volunteer.shiftFullError') : t('volunteer.shiftError')
      );
    }
  };

  // Only shifts that have not finished yet. Without the second half of this a
  // shift from last month sat under "Your Upcoming Shifts" for ever, offering
  // a Cancel button for something that had already happened. Whether it was
  // actually served is a separate question, answered by the hours log.
  const myBookedShifts = shifts.filter(
    (s) => s.isTakenByMe && new Date(s.endsAt).getTime() > Date.now()
  );

  // Up to two letters from the display name, falling back to the email when a
  // magic-link user has no name recorded yet.
  const initials = (volunteer?.fullName || volunteer?.email || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  // Next hours milestone shown as a locked badge on the Hours tab — computed
  // from the volunteer's real totalHours so it updates as shifts are booked,
  // instead of a hardcoded snapshot.
  const nextMilestoneHours = 50;
  const currentHours = volunteer?.totalHours || 0;
  const milestonePct = Math.min(100, (currentHours / nextMilestoneHours) * 100);
  const hoursToNextMilestone = Math.max(0, nextMilestoneHours - currentHours);

  const filteredShifts = shifts.filter((s) => {
    if (selectedRole === 'all') return true;
    return s.role === selectedRole;
  });

  // Derived from the role vocabulary rather than listed by hand: the hardcoded
  // version left out 'General Support', so a shift with that role could not be
  // reached by any filter but "All".
  const roles: (VolunteerRole | 'all')[] = ['all', ...VOLUNTEER_ROLES.map((entry) => entry.value)];

  // Auth Screen if not logged in
  if (!isLoggedIn) {
    return (
      <section className="py-20 bg-parchment min-h-[85vh] flex items-center justify-center text-graphite">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-aged-paper rounded-[28px] p-8 border border-warm-taupe shadow-xl space-y-6">
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-olive/10 text-olive rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-serif font-bold text-graphite">
                {t('volunteer.portalTitle')}
              </h1>
              <p className="text-xs text-charcoal">
                {t('volunteer.portalSubtitle')}
              </p>
            </div>

            {!loginSent ? (
              <>
              {/* Offered above the email form on purpose: it is one click, and
                  unlike the magic link it sends no email, so it keeps working
                  when Supabase Auth's outbound mail is throttled. */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSendingLink}
                className="w-full bg-white hover:bg-aged-paper border border-warm-taupe text-graphite py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.500h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/>
                  <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"/>
                  <path fill="#FBBC05" d="M11.6 28.1c-.5-1.4-.7-2.8-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z"/>
                  <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C34.9 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z"/>
                </svg>
                <span>{t('volunteer.continueWithGoogle')}</span>
              </button>

              <div className="flex items-center gap-3 py-4">
                <span className="h-px flex-1 bg-warm-taupe" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-charcoal">
                  {t('volunteer.orDivider')}
                </span>
                <span className="h-px flex-1 bg-warm-taupe" />
              </div>

              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-charcoal mb-1">
                    {t('volunteer.magicLinkTitle')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-charcoal absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={t('volunteer.emailPlaceholder')}
                      className="w-full bg-parchment border border-warm-taupe rounded-xl pl-10 pr-4 py-2.5 text-sm pawtx-focus focus:border-terracotta"
                    />
                  </div>
                  <p className="text-[11px] text-charcoal mt-1.5">{t('volunteer.magicLinkDesc')}</p>
                </div>

                {loginError && (
                  <div className="flex items-start gap-2 bg-terracotta/10 border border-terracotta/30 rounded-xl px-3 py-2.5 text-xs text-terracotta">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingLink}
                  className="w-full bg-terracotta hover:bg-terracotta-deep text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>
                    {isSendingLink ? t('volunteer.sendingMagicLink') : t('volunteer.sendMagicLink')}
                  </span>
                  {!isSendingLink && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <CheckCircle2 className="w-10 h-10 text-olive mx-auto" />
                <div className="text-sm font-bold font-serif">
                  {t('volunteer.magicLinkSentTitle')}
                </div>
                <p className="text-xs text-charcoal">
                  {t('volunteer.magicLinkSentText', { email: emailInput })}
                </p>
              </div>
            )}

          </div>
        </div>
      </section>
    );
  }

  // Logged In Volunteer Dashboard
  return (
    <section className="py-12 bg-parchment min-h-screen text-graphite">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Dashboard Header Bar */}
        <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Google sign-in supplies a real picture. Everyone else gets
                their initials — the previous fallback was a stock photo of a
                stranger standing in for whoever was signed in. */}
            {volunteer?.avatarUrl ? (
              <img
                src={volunteer.avatarUrl}
                alt={volunteer.fullName}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border-2 border-terracotta"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-14 h-14 rounded-full border-2 border-terracotta bg-terracotta/10 text-terracotta flex items-center justify-center font-serif font-bold text-xl"
              >
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-serif font-bold text-graphite">
                {t('volunteer.welcomeBack', { name: volunteer?.fullName })}
              </h1>
              <p className="text-xs text-charcoal">
                Active Volunteer • Joined {volunteer?.joinedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {/* Staff land here after signing in, so this is where the admin
                entrance belongs — the footer link alone meant scrolling the
                whole page to find it. Visibility is convenience only; the
                panel and every query behind it are gated by RLS. */}
            {volunteer?.role === 'admin' && (
              <button
                onClick={() => setSiteTab('admin')}
                className="px-4 py-2 rounded-full bg-terracotta hover:bg-terracotta-deep text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t('footer.adminPanel')}</span>
              </button>
            )}

            <button
              onClick={logout}
              className="px-4 py-2 rounded-full border border-warm-taupe text-xs font-bold uppercase tracking-wider text-charcoal hover:bg-parchment hover:text-red-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('volunteer.logout')}</span>
            </button>
          </div>
        </div>

        {/* Dashboard Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar Nav */}
          <div className="lg:col-span-3 space-y-2">
            <div className="bg-aged-paper rounded-2xl p-3 border border-warm-taupe shadow-sm space-y-1">
              
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>{t('volunteer.tabOverview')}</span>
              </button>

              <button
                onClick={() => setActiveTab('forms')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'forms'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>{t('volunteer.tabForms')}</span>
              </button>

              <button
                onClick={() => setActiveTab('shifts')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'shifts'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>{t('volunteer.tabShifts')}</span>
              </button>

              <button
                onClick={() => setActiveTab('mySchedule')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'mySchedule'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CalendarCheck className="w-4 h-4" />
                  <span>{t('volunteer.tabMySchedule')}</span>
                </div>
                {myBookedShifts.length > 0 && (
                  <span className="bg-olive text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {myBookedShifts.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('hours')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'hours'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>{t('volunteer.tabHours')}</span>
              </button>

              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-parchment'
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserRound className="w-4 h-4" />
                  <span>{t('volunteer.tabProfile')}</span>
                </div>
                {/* A dot rather than a number: there is one thing missing, and
                    it is the name that would otherwise appear on a service
                    letter. */}
                {needsName && (
                  <span className="w-2 h-2 rounded-full bg-terracotta" aria-hidden="true" />
                )}
              </button>

            </div>
          </div>

          {/* Main Area Content */}
          <div className="lg:col-span-9 space-y-6">

            {/* Shift booking failures surface here rather than silently
                reverting the optimistic update the store just rolled back. */}
            {shiftError && (
              <div className="flex items-start gap-2 bg-terracotta/10 border border-terracotta/30 rounded-2xl px-4 py-3 text-xs text-terracotta">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{shiftError}</span>
              </div>
            )}

            {/* FORMS TAB */}
            {activeTab === 'forms' && (
              <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm animate-fadeIn">
                <h3 className="text-2xl font-serif font-bold text-graphite mb-1">
                  {t('volunteer.tabForms')}
                </h3>
                <p className="text-xs text-charcoal mb-6">
                  {t('volunteer.formsIntro')}
                </p>
                <OnboardingWizard />
              </div>
            )}

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  
                  <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-terracotta">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.totalHours')}</span>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-graphite">
                      {volunteer?.totalHours} hrs
                    </div>
                  </div>

                  <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-terracotta">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.shiftsCompleted')}</span>
                      <CalendarCheck className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-graphite">
                      {volunteer?.shiftsCompleted}
                    </div>
                  </div>

                  <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-terracotta">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.badgesEarned')}</span>
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-graphite">
                      {volunteer?.badges.length}
                    </div>
                  </div>

                </div>

                {/* Service Progress Bar ("Reward of the Self") */}
                <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-serif font-bold text-graphite">
                        {t('volunteer.hoursGoalTitle')}
                      </h3>
                      <p className="text-xs text-charcoal">
                        {t('volunteer.hoursGoalProgress', { current: volunteer?.totalHours, target: 30 })}
                      </p>
                    </div>
                    <Sparkles className="w-6 h-6 text-terracotta" />
                  </div>

                  <div className="w-full bg-parchment rounded-full h-3 border border-warm-taupe overflow-hidden">
                    <div
                      className="bg-terracotta h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((volunteer?.totalHours || 0) / 30) * 100)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {volunteer?.badges.map((badge, idx) => (
                      <span
                        key={idx}
                        className="bg-parchment text-terracotta border border-warm-taupe px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Award className="w-3.5 h-3.5" />
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Quick Next Shift Card */}
                <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-3">
                  <h3 className="text-base font-serif font-bold text-graphite">
                    Your Upcoming Shifts
                  </h3>
                  {myBookedShifts.length > 0 ? (
                    <div className="space-y-3">
                      {myBookedShifts.map((shift) => (
                        <div key={shift.id} className="bg-parchment p-4 rounded-xl border border-warm-taupe flex items-center justify-between">
                          <div>
                            <div className="font-bold text-sm text-graphite">{shift.title}</div>
                            <div className="text-xs text-charcoal">{shift.date} • {shift.time}</div>
                          </div>
                          <button
                            onClick={() => handleToggleShift(shift.id)}
                            className="text-xs font-bold text-red-700 hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-charcoal">
                      No shifts currently booked. Check "Available Shifts" to join the team!
                    </p>
                  )}
                </div>

              </div>
            )}

            {/* AVAILABLE SHIFTS TAB */}
            {activeTab === 'shifts' && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Role Filter */}
                <div className="bg-aged-paper p-4 rounded-2xl border border-warm-taupe flex items-center gap-3 overflow-x-auto">
                  <Filter className="w-4 h-4 text-charcoal shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-charcoal shrink-0">{t('volunteer.roleFilter')}:</span>
                  {roles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRole(r)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                        selectedRole === r
                          ? 'bg-terracotta text-white'
                          : 'bg-parchment text-graphite hover:bg-warm-taupe'
                      }`}
                    >
                      {r === 'all' ? 'All Roles' : r}
                    </button>
                  ))}
                </div>

                {/* Shift Table */}
                <div className="bg-aged-paper rounded-2xl border border-warm-taupe shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-parchment border-b border-warm-taupe text-charcoal font-bold uppercase tracking-wider">
                        <tr>
                          <th className="p-4">{t('volunteer.date')} & Shift</th>
                          <th className="p-4">{t('volunteer.role')}</th>
                          <th className="p-4">{t('volunteer.duration')}</th>
                          <th className="p-4">{t('volunteer.spots')}</th>
                          <th className="p-4 text-right">{t('volunteer.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-taupe">
                        {filteredShifts.map((shift) => {
                          const spotsAvailable = shift.spotsTotal - shift.spotsFilled;
                          const isBooked = shift.isTakenByMe;
                          const title = language === 'es' ? shift.titleEs : shift.title;

                          return (
                            <tr key={shift.id} className="hover:bg-parchment/60 transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-sm text-graphite">{title}</div>
                                <div className="text-xs text-charcoal">{shift.date} ({shift.time})</div>
                              </td>
                              <td className="p-4">
                                <span className="bg-parchment text-graphite border border-warm-taupe px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider">
                                  {shift.role}
                                </span>
                              </td>
                              <td className="p-4 font-semibold text-graphite">
                                {shift.durationHours} hrs
                              </td>
                              <td className="p-4">
                                <span className={`font-bold ${spotsAvailable > 0 ? 'text-olive' : 'text-red-600'}`}>
                                  {spotsAvailable} left
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => handleToggleShift(shift.id)}
                                  className={`px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
                                    isBooked
                                      ? 'bg-olive text-white'
                                      : 'bg-terracotta hover:bg-terracotta-deep text-white shadow-sm'
                                  }`}
                                >
                                  {isBooked ? t('volunteer.shiftTaken') : t('volunteer.takeShift')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* MY SCHEDULE TAB */}
            {activeTab === 'mySchedule' && (
              <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-4 animate-fadeIn">
                <h3 className="text-xl font-serif font-bold text-graphite">
                  {t('volunteer.tabMySchedule')}
                </h3>

                {myBookedShifts.length > 0 ? (
                  <div className="space-y-4">
                    {myBookedShifts.map((shift) => (
                      <div key={shift.id} className="bg-parchment p-5 rounded-2xl border border-warm-taupe flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="font-bold text-base text-graphite">{shift.title}</div>
                          <div className="text-xs text-charcoal flex items-center gap-3">
                            <span><Calendar className="w-3.5 h-3.5 inline text-terracotta mr-1" />{shift.date}</span>
                            <span><Clock className="w-3.5 h-3.5 inline text-terracotta mr-1" />{shift.time}</span>
                            <span className="font-bold text-terracotta">{shift.durationHours} Hours</span>
                          </div>
                          <p className="text-xs text-charcoal pt-1">{shift.description}</p>
                        </div>

                        <button
                          onClick={() => handleToggleShift(shift.id)}
                          className="px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          {t('volunteer.cancelShift')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <AlertCircle className="w-8 h-8 text-charcoal mx-auto opacity-50" />
                    <p className="text-sm text-charcoal">You haven't registered for any shifts yet.</p>
                    <button
                      onClick={() => setActiveTab('shifts')}
                      className="text-xs text-terracotta font-bold uppercase tracking-wider underline cursor-pointer"
                    >
                      Browse Available Shifts
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* HOURS & BADGES TAB */}
            {activeTab === 'hours' && (
              <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-6 animate-fadeIn">
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif font-bold text-graphite">
                    Service Log & Achievement Badges
                  </h3>
                  <p className="text-xs text-charcoal">
                    Your hours contribute directly to PAWTX 501(c)(3) community outreach programs.
                  </p>
                </div>

                <div className="bg-parchment p-6 rounded-2xl border border-warm-taupe space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-graphite">Total Verified Hours:</span>
                    <span className="text-2xl font-bold font-serif text-terracotta">{currentHours} Hours</span>
                  </div>

                  {/* The ledger itself. Booking a shift no longer moves this
                      number — staff credit the hours after the shift, which is
                      what makes the figure something PAWTX can vouch for. */}
                  {serviceLog.length > 0 ? (
                    <ul className="divide-y divide-warm-taupe border-t border-warm-taupe pt-2">
                      {serviceLog.map((entry) => {
                        const shift = shifts.find((s) => s.id === entry.shift_id);
                        return (
                          <li key={entry.id} className="flex items-center justify-between py-2.5 gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-graphite truncate">
                                {shift
                                  ? language === 'es' ? shift.titleEs : shift.title
                                  : entry.note || t('volunteer.serviceEntryFallback')}
                              </div>
                              <div className="text-[11px] text-charcoal">
                                {new Date(`${entry.served_on}T12:00:00`).toLocaleDateString(
                                  language === 'es' ? 'es-US' : 'en-US',
                                  { dateStyle: 'medium' }
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-bold text-olive whitespace-nowrap">
                              {Number(entry.hours)} hrs
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-charcoal border-t border-warm-taupe pt-4">
                      {t('volunteer.noVerifiedHours')}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-warm-taupe">
                    {volunteer?.badges.map((badge) => (
                      <div key={badge} className="p-4 bg-aged-paper rounded-xl border border-warm-taupe text-center space-y-1">
                        <Award className="w-6 h-6 text-terracotta mx-auto" />
                        <div className="font-bold text-xs text-graphite">{badge}</div>
                        <div className="text-[10px] text-olive font-bold uppercase tracking-wider">Unlocked</div>
                      </div>
                    ))}

                    {milestonePct < 100 && (
                      <div className="p-4 bg-aged-paper rounded-xl border border-warm-taupe text-center space-y-2">
                        <Award className="w-6 h-6 text-gray-400 mx-auto" />
                        <div className="font-bold text-xs text-graphite">West Texas Legend ({nextMilestoneHours} Hrs)</div>
                        <div className="w-full bg-warm-taupe rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-terracotta h-full rounded-full transition-all duration-500"
                            style={{ width: `${milestonePct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                          {hoursToNextMilestone.toFixed(1)} hrs to go
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-charcoal">
                    My certificates
                  </h4>
                  {certificatesLoaded && certificates.length === 0 && (
                    <p className="text-xs text-charcoal">
                      No certificate has been issued yet. Ask a staff member once your hours cover
                      the period you need documented.
                    </p>
                  )}
                  {certificates.map((cert) => (
                    <div key={cert.id} className="bg-parchment border border-warm-taupe rounded-xl">
                      <button
                        onClick={() =>
                          setExpandedCertId(expandedCertId === cert.id ? null : cert.id)
                        }
                        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                      >
                        <span className="text-xs">
                          <span className="font-mono font-bold">{cert.certificate_no}</span>
                          <span className="text-charcoal ml-3">
                            {cert.period_start} — {cert.period_end} · {Number(cert.total_hours)} hrs
                          </span>
                          {cert.revoked_at && (
                            <span className="ml-3 text-[10px] font-bold uppercase tracking-wider bg-terracotta/15 text-terracotta px-2 py-0.5 rounded-full">
                              Withdrawn
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-terracotta">
                          {expandedCertId === cert.id ? 'Hide' : 'View / print'}
                        </span>
                      </button>
                      {expandedCertId === cert.id && (
                        <div className="border-t border-warm-taupe p-4">
                          <CertificateView certificate={cert} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm space-y-6 animate-fadeIn">
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif font-bold text-graphite">
                    {t('volunteer.tabProfile')}
                  </h3>
                  <p className="text-xs text-charcoal">
                    {t('volunteer.profileIntro')}
                  </p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
                  <div>
                    <label
                      htmlFor="volunteer-name"
                      className="block text-xs font-bold uppercase tracking-[0.2em] text-charcoal mb-1"
                    >
                      {t('volunteer.profileName')}
                    </label>
                    <input
                      id="volunteer-name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder={t('volunteer.profileNamePlaceholder')}
                      className="w-full bg-parchment border border-warm-taupe rounded-xl px-4 py-2.5 text-sm pawtx-focus focus:border-terracotta"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="volunteer-phone"
                      className="block text-xs font-bold uppercase tracking-[0.2em] text-charcoal mb-1"
                    >
                      {t('volunteer.profilePhone')}
                    </label>
                    <input
                      id="volunteer-phone"
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="w-full bg-parchment border border-warm-taupe rounded-xl px-4 py-2.5 text-sm pawtx-focus focus:border-terracotta"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase tracking-[0.2em] text-charcoal mb-1">
                      {t('volunteer.profileEmail')}
                    </span>
                    {/* Not editable: it is the identity the account signs in
                        with, and changing it here would not change that. */}
                    <p className="text-sm text-graphite">{volunteer?.email}</p>
                  </div>

                  {profileError && (
                    <div className="flex items-start gap-2 bg-terracotta/10 border border-terracotta/30 rounded-xl px-3 py-2.5 text-xs text-terracotta">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{profileError}</span>
                    </div>
                  )}

                  {profileMessage && (
                    <div className="flex items-start gap-2 bg-olive/10 border border-olive/30 rounded-xl px-3 py-2.5 text-xs text-olive">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{profileMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-terracotta hover:bg-terracotta-deep text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingProfile ? t('volunteer.profileSaving') : t('volunteer.profileSave')}
                  </button>
                </form>
              </div>
            )}

          </div>

        </div>

      </div>
    </section>
  );
};
