import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Clock, Calendar, Award, CheckCircle2, LogOut, ArrowRight, ShieldCheck, Filter, AlertCircle, LayoutDashboard, CalendarCheck, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { VOLUNTEER_ROLES } from '../data/volunteerRoles';
import { VolunteerRole } from '../types';

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
    // Aliased: this component already has its own `activeTab` for the
    // dashboard's inner tabs, which is unrelated to the site-wide one.
    setActiveTab: setSiteTab,
    language,
    raw
  } = useAppStore();

  const serviceLog = raw.serviceLog;

  const [emailInput, setEmailInput] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'shifts' | 'mySchedule' | 'hours'>('overview');
  const [selectedRole, setSelectedRole] = useState<VolunteerRole | 'all'>('all');
  const [loginSent, setLoginSent] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

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

  const myBookedShifts = shifts.filter((s) => s.isTakenByMe);

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
      <section className="py-20 bg-[#FDFBF7] min-h-[85vh] flex items-center justify-center text-[#2A2A2A]">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-[#F4F1ED] rounded-[28px] p-8 border border-[#E5E0D8] shadow-xl space-y-6">
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#5B6346]/10 text-[#5B6346] rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                {t('volunteer.portalTitle')}
              </h2>
              <p className="text-xs text-[#5A5A5A]">
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
                className="w-full bg-white hover:bg-[#F4F1ED] border border-[#E5E0D8] text-[#2A2A2A] py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-50"
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
                <span className="h-px flex-1 bg-[#E5E0D8]" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#5A5A5A]">
                  {t('volunteer.orDivider')}
                </span>
                <span className="h-px flex-1 bg-[#E5E0D8]" />
              </div>

              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A5A] mb-1">
                    {t('volunteer.magicLinkTitle')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#5A5A5A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={t('volunteer.emailPlaceholder')}
                      className="w-full bg-[#FDFBF7] border border-[#E5E0D8] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#A64D32]"
                    />
                  </div>
                  <p className="text-[11px] text-[#5A5A5A] mt-1.5">{t('volunteer.magicLinkDesc')}</p>
                </div>

                {loginError && (
                  <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-xl px-3 py-2.5 text-xs text-[#A64D32]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingLink}
                  className="w-full bg-[#A64D32] hover:bg-[#8b3f28] text-white py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
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
                <CheckCircle2 className="w-10 h-10 text-[#5B6346] mx-auto" />
                <div className="text-sm font-bold font-serif">
                  {t('volunteer.magicLinkSentTitle')}
                </div>
                <p className="text-xs text-[#5A5A5A]">
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
    <section className="py-12 bg-[#FDFBF7] min-h-screen text-[#2A2A2A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Dashboard Header Bar */}
        <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
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
                className="w-14 h-14 rounded-full object-cover border-2 border-[#A64D32]"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-14 h-14 rounded-full border-2 border-[#A64D32] bg-[#A64D32]/10 text-[#A64D32] flex items-center justify-center font-serif font-bold text-xl"
              >
                {initials}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                {t('volunteer.welcomeBack', { name: volunteer?.fullName })}
              </h2>
              <p className="text-xs text-[#5A5A5A]">
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
                className="px-4 py-2 rounded-full bg-[#A64D32] hover:bg-[#8b3f28] text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t('footer.adminPanel')}</span>
              </button>
            )}

            <button
              onClick={logout}
              className="px-4 py-2 rounded-full border border-[#E5E0D8] text-xs font-bold uppercase tracking-wider text-[#5A5A5A] hover:bg-[#FDFBF7] hover:text-red-700 transition-colors flex items-center gap-1.5 cursor-pointer"
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
            <div className="bg-[#F4F1ED] rounded-2xl p-3 border border-[#E5E0D8] shadow-sm space-y-1">
              
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-[#A64D32] text-white shadow-sm'
                    : 'text-[#2A2A2A] hover:bg-[#FDFBF7]'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>{t('volunteer.tabOverview')}</span>
              </button>

              <button
                onClick={() => setActiveTab('shifts')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'shifts'
                    ? 'bg-[#A64D32] text-white shadow-sm'
                    : 'text-[#2A2A2A] hover:bg-[#FDFBF7]'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>{t('volunteer.tabShifts')}</span>
              </button>

              <button
                onClick={() => setActiveTab('mySchedule')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'mySchedule'
                    ? 'bg-[#A64D32] text-white shadow-sm'
                    : 'text-[#2A2A2A] hover:bg-[#FDFBF7]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CalendarCheck className="w-4 h-4" />
                  <span>{t('volunteer.tabMySchedule')}</span>
                </div>
                {myBookedShifts.length > 0 && (
                  <span className="bg-[#5B6346] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {myBookedShifts.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('hours')}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'hours'
                    ? 'bg-[#A64D32] text-white shadow-sm'
                    : 'text-[#2A2A2A] hover:bg-[#FDFBF7]'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>{t('volunteer.tabHours')}</span>
              </button>

            </div>
          </div>

          {/* Main Area Content */}
          <div className="lg:col-span-9 space-y-6">

            {/* Shift booking failures surface here rather than silently
                reverting the optimistic update the store just rolled back. */}
            {shiftError && (
              <div className="flex items-start gap-2 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-4 py-3 text-xs text-[#A64D32]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{shiftError}</span>
              </div>
            )}

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  
                  <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-[#A64D32]">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.totalHours')}</span>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-[#2A2A2A]">
                      {volunteer?.totalHours} hrs
                    </div>
                  </div>

                  <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-[#A64D32]">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.shiftsCompleted')}</span>
                      <CalendarCheck className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-[#2A2A2A]">
                      {volunteer?.shiftsCompleted}
                    </div>
                  </div>

                  <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-[#A64D32]">
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">{t('volunteer.badgesEarned')}</span>
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="text-3xl font-serif font-bold text-[#2A2A2A]">
                      {volunteer?.badges.length}
                    </div>
                  </div>

                </div>

                {/* Service Progress Bar ("Reward of the Self") */}
                <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-serif font-bold text-[#2A2A2A]">
                        {t('volunteer.hoursGoalTitle')}
                      </h3>
                      <p className="text-xs text-[#5A5A5A]">
                        {t('volunteer.hoursGoalProgress', { current: volunteer?.totalHours, target: 30 })}
                      </p>
                    </div>
                    <Sparkles className="w-6 h-6 text-[#A64D32]" />
                  </div>

                  <div className="w-full bg-[#FDFBF7] rounded-full h-3 border border-[#E5E0D8] overflow-hidden">
                    <div
                      className="bg-[#A64D32] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((volunteer?.totalHours || 0) / 30) * 100)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {volunteer?.badges.map((badge, idx) => (
                      <span
                        key={idx}
                        className="bg-[#FDFBF7] text-[#A64D32] border border-[#E5E0D8] px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Award className="w-3.5 h-3.5" />
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Quick Next Shift Card */}
                <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-3">
                  <h3 className="text-base font-serif font-bold text-[#2A2A2A]">
                    Your Upcoming Shifts
                  </h3>
                  {myBookedShifts.length > 0 ? (
                    <div className="space-y-3">
                      {myBookedShifts.map((shift) => (
                        <div key={shift.id} className="bg-[#FDFBF7] p-4 rounded-xl border border-[#E5E0D8] flex items-center justify-between">
                          <div>
                            <div className="font-bold text-sm text-[#2A2A2A]">{shift.title}</div>
                            <div className="text-xs text-[#5A5A5A]">{shift.date} • {shift.time}</div>
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
                    <p className="text-xs text-[#5A5A5A]">
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
                <div className="bg-[#F4F1ED] p-4 rounded-2xl border border-[#E5E0D8] flex items-center gap-3 overflow-x-auto">
                  <Filter className="w-4 h-4 text-[#5A5A5A] shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5A5A5A] shrink-0">{t('volunteer.roleFilter')}:</span>
                  {roles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRole(r)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
                        selectedRole === r
                          ? 'bg-[#A64D32] text-white'
                          : 'bg-[#FDFBF7] text-[#2A2A2A] hover:bg-[#E5E0D8]'
                      }`}
                    >
                      {r === 'all' ? 'All Roles' : r}
                    </button>
                  ))}
                </div>

                {/* Shift Table */}
                <div className="bg-[#F4F1ED] rounded-2xl border border-[#E5E0D8] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FDFBF7] border-b border-[#E5E0D8] text-[#5A5A5A] font-bold uppercase tracking-wider">
                        <tr>
                          <th className="p-4">{t('volunteer.date')} & Shift</th>
                          <th className="p-4">{t('volunteer.role')}</th>
                          <th className="p-4">{t('volunteer.duration')}</th>
                          <th className="p-4">{t('volunteer.spots')}</th>
                          <th className="p-4 text-right">{t('volunteer.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E0D8]">
                        {filteredShifts.map((shift) => {
                          const spotsAvailable = shift.spotsTotal - shift.spotsFilled;
                          const isBooked = shift.isTakenByMe;
                          const title = language === 'es' ? shift.titleEs : shift.title;

                          return (
                            <tr key={shift.id} className="hover:bg-[#FDFBF7]/60 transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-sm text-[#2A2A2A]">{title}</div>
                                <div className="text-xs text-[#5A5A5A]">{shift.date} ({shift.time})</div>
                              </td>
                              <td className="p-4">
                                <span className="bg-[#FDFBF7] text-[#2A2A2A] border border-[#E5E0D8] px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider">
                                  {shift.role}
                                </span>
                              </td>
                              <td className="p-4 font-semibold text-[#2A2A2A]">
                                {shift.durationHours} hrs
                              </td>
                              <td className="p-4">
                                <span className={`font-bold ${spotsAvailable > 0 ? 'text-[#5B6346]' : 'text-red-600'}`}>
                                  {spotsAvailable} left
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => handleToggleShift(shift.id)}
                                  className={`px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
                                    isBooked
                                      ? 'bg-[#5B6346] text-white'
                                      : 'bg-[#A64D32] hover:bg-[#8b3f28] text-white shadow-sm'
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
              <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-4 animate-fadeIn">
                <h3 className="text-xl font-serif font-bold text-[#2A2A2A]">
                  {t('volunteer.tabMySchedule')}
                </h3>

                {myBookedShifts.length > 0 ? (
                  <div className="space-y-4">
                    {myBookedShifts.map((shift) => (
                      <div key={shift.id} className="bg-[#FDFBF7] p-5 rounded-2xl border border-[#E5E0D8] flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="font-bold text-base text-[#2A2A2A]">{shift.title}</div>
                          <div className="text-xs text-[#5A5A5A] flex items-center gap-3">
                            <span><Calendar className="w-3.5 h-3.5 inline text-[#A64D32] mr-1" />{shift.date}</span>
                            <span><Clock className="w-3.5 h-3.5 inline text-[#A64D32] mr-1" />{shift.time}</span>
                            <span className="font-bold text-[#A64D32]">{shift.durationHours} Hours</span>
                          </div>
                          <p className="text-xs text-[#5A5A5A] pt-1">{shift.description}</p>
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
                    <AlertCircle className="w-8 h-8 text-[#5A5A5A] mx-auto opacity-50" />
                    <p className="text-sm text-[#5A5A5A]">You haven't registered for any shifts yet.</p>
                    <button
                      onClick={() => setActiveTab('shifts')}
                      className="text-xs text-[#A64D32] font-bold uppercase tracking-wider underline cursor-pointer"
                    >
                      Browse Available Shifts
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* HOURS & BADGES TAB */}
            {activeTab === 'hours' && (
              <div className="bg-[#F4F1ED] rounded-2xl p-6 border border-[#E5E0D8] shadow-sm space-y-6 animate-fadeIn">
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif font-bold text-[#2A2A2A]">
                    Service Log & Achievement Badges
                  </h3>
                  <p className="text-xs text-[#5A5A5A]">
                    Your hours contribute directly to PAWTX 501(c)(3) community outreach programs.
                  </p>
                </div>

                <div className="bg-[#FDFBF7] p-6 rounded-2xl border border-[#E5E0D8] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#2A2A2A]">Total Verified Hours:</span>
                    <span className="text-2xl font-bold font-serif text-[#A64D32]">{currentHours} Hours</span>
                  </div>

                  {/* The ledger itself. Booking a shift no longer moves this
                      number — staff credit the hours after the shift, which is
                      what makes the figure something PAWTX can vouch for. */}
                  {serviceLog.length > 0 ? (
                    <ul className="divide-y divide-[#E5E0D8] border-t border-[#E5E0D8] pt-2">
                      {serviceLog.map((entry) => {
                        const shift = shifts.find((s) => s.id === entry.shift_id);
                        return (
                          <li key={entry.id} className="flex items-center justify-between py-2.5 gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-[#2A2A2A] truncate">
                                {shift
                                  ? language === 'es' ? shift.titleEs : shift.title
                                  : entry.note || t('volunteer.serviceEntryFallback')}
                              </div>
                              <div className="text-[11px] text-[#5A5A5A]">
                                {new Date(`${entry.served_on}T12:00:00`).toLocaleDateString(
                                  language === 'es' ? 'es-US' : 'en-US',
                                  { dateStyle: 'medium' }
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-bold text-[#5B6346] whitespace-nowrap">
                              {Number(entry.hours)} hrs
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-[#5A5A5A] border-t border-[#E5E0D8] pt-4">
                      {t('volunteer.noVerifiedHours')}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#E5E0D8]">
                    {volunteer?.badges.map((badge) => (
                      <div key={badge} className="p-4 bg-[#F4F1ED] rounded-xl border border-[#E5E0D8] text-center space-y-1">
                        <Award className="w-6 h-6 text-[#A64D32] mx-auto" />
                        <div className="font-bold text-xs text-[#2A2A2A]">{badge}</div>
                        <div className="text-[10px] text-[#5B6346] font-bold uppercase tracking-wider">Unlocked</div>
                      </div>
                    ))}

                    {milestonePct < 100 && (
                      <div className="p-4 bg-[#F4F1ED] rounded-xl border border-[#E5E0D8] text-center space-y-2">
                        <Award className="w-6 h-6 text-gray-400 mx-auto" />
                        <div className="font-bold text-xs text-[#2A2A2A]">West Texas Legend ({nextMilestoneHours} Hrs)</div>
                        <div className="w-full bg-[#E5E0D8] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#A64D32] h-full rounded-full transition-all duration-500"
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
              </div>
            )}

          </div>

        </div>

      </div>
    </section>
  );
};
