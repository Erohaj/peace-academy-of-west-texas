import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, CalendarDays, Image as ImageIcon, Inbox, Mail, HeartHandshake, HandHeart, ClipboardList, Award } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { EventsAdmin } from './EventsAdmin';
import { GalleryAdmin } from './GalleryAdmin';
import { ShiftsAdmin } from './ShiftsAdmin';
import { ApplicationsAdmin } from './ApplicationsAdmin';
import { CertificatesAdmin } from './CertificatesAdmin';
import { SubmissionsAdmin } from './SubmissionsAdmin';
import { fetchUnhandledMessageCount } from '../../lib/api/admin';

type AdminSection =
  | 'events'
  | 'shifts'
  | 'applications'
  | 'certificates'
  | 'gallery'
  | 'rsvps'
  | 'messages'
  | 'donations';

/**
 * Staff-only content management.
 *
 * The guard below hides the panel from non-admins, but it is a courtesy, not
 * a security control — anyone can edit the JavaScript that renders it. Writes
 * are actually gated by the RLS policies in
 * supabase/migrations/*_rls_and_rpc.sql, which check `profiles.role = 'admin'`
 * in the database on every statement.
 */
export const AdminPanel: React.FC = () => {
  const { t } = useTranslation();
  const { volunteer, isLoggedIn, authStatus, setActiveTab } = useAppStore();
  const [section, setSection] = useState<AdminSection>('events');
  const [unhandled, setUnhandled] = useState(0);

  const isAdmin = volunteer?.role === 'admin';

  /**
   * Keeps the badge on the Messages tab honest.
   *
   * Exposed to SubmissionsAdmin so that handling or deleting a message moves
   * the count immediately rather than at the next poll — a badge that still
   * says 3 after you have cleared all three is worse than no badge.
   */
  const refreshUnhandled = useCallback(() => {
    if (!isAdmin) return;
    fetchUnhandledMessageCount()
      .then(setUnhandled)
      .catch((error) => {
        // A badge is a convenience. Losing it must not take the panel with it,
        // and an admin who cannot count messages can still read them.
        console.error('[PAWTX] Could not count unhandled messages', error);
      });
  }, [isAdmin]);

  /**
   * Polls while the panel is open, so an enquiry that arrives mid-session
   * announces itself without a reload. Sixty seconds because this is a
   * head-only count against a table that sees a few messages a week — the
   * point is that somebody notices within a minute, not within a second.
   *
   * The visibility check keeps a forgotten background tab from asking all
   * night; `visibilitychange` catches up the moment it is looked at again.
   */
  useEffect(() => {
    if (!isAdmin) return;

    refreshUnhandled();

    const tick = () => {
      if (document.visibilityState === 'visible') refreshUnhandled();
    };

    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [isAdmin, refreshUnhandled]);

  // Send anyone who lands here without rights to the sign-in screen rather
  // than leaving them on an empty page.
  useEffect(() => {
    if (authStatus === 'ready' && !isLoggedIn) setActiveTab('volunteer');
  }, [authStatus, isLoggedIn, setActiveTab]);

  const sections = useMemo(
    () =>
      [
        { id: 'events' as const, label: 'Events', icon: CalendarDays },
        { id: 'shifts' as const, label: 'Volunteer Shifts', icon: HandHeart },
        { id: 'applications' as const, label: 'Applications', icon: ClipboardList },
        { id: 'certificates' as const, label: 'Certificates', icon: Award },
        { id: 'gallery' as const, label: 'Gallery', icon: ImageIcon },
        // Split in two on 2026-10-15. One tab held both, which meant an
        // enquiry waiting for an answer was below a roster that could run to
        // a hundred rows, and nothing anywhere said it was there.
        { id: 'rsvps' as const, label: 'RSVPs', icon: Inbox, badge: 0 },
        { id: 'messages' as const, label: 'Messages', icon: Mail, badge: unhandled },
        { id: 'donations' as const, label: 'Donations', icon: HeartHandshake, badge: 0 }
      ],
    [unhandled]
  );

  if (authStatus !== 'ready') {
    return (
      <section className="py-20 bg-parchment min-h-[70vh] flex items-center justify-center">
        <p className="text-sm text-charcoal">{t('common.loading')}</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="py-20 bg-parchment min-h-[70vh] flex items-center justify-center text-graphite">
        <div className="max-w-md w-full mx-auto px-4 text-center space-y-4">
          <div className="w-14 h-14 bg-terracotta/10 text-terracotta rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-serif font-bold">Staff access only</h1>
          <p className="text-sm text-charcoal">
            This area is limited to Peace Academy staff accounts. If you manage content for
            PAWTX, ask an administrator to grant your account access.
          </p>
          <button
            onClick={() => setActiveTab('home')}
            className="bg-graphite hover:bg-black text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer"
          >
            Back to site
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 bg-parchment min-h-screen text-graphite">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        <div className="bg-aged-paper rounded-2xl p-6 border border-warm-taupe shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
            {t('footer.adminPanel')}
          </div>
          <h1 className="text-2xl font-serif font-bold mt-1">
            Signed in as {volunteer?.fullName}
          </h1>
          <p className="text-xs text-charcoal mt-1">
            Changes publish to the live site immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <nav className="lg:col-span-3 space-y-2">
            {sections.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-3 transition-colors cursor-pointer ${
                  section === id
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-graphite hover:bg-aged-paper'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {badge > 0 && (
                  // Announced to a screen reader as words, because a bare
                  // number read out after "Messages" says nothing about what
                  // it counts.
                  <span
                    aria-label={`${badge} unanswered`}
                    className={`ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                      section === id ? 'bg-white text-terracotta' : 'bg-terracotta text-white'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="lg:col-span-9">
            {section === 'events' && <EventsAdmin />}
            {section === 'shifts' && <ShiftsAdmin />}
            {section === 'applications' && <ApplicationsAdmin />}
            {section === 'certificates' && <CertificatesAdmin />}
            {section === 'gallery' && <GalleryAdmin />}
            {section === 'rsvps' && <SubmissionsAdmin view="rsvps" />}
            {section === 'messages' && (
              <SubmissionsAdmin view="messages" onMessagesChanged={refreshUnhandled} />
            )}
            {section === 'donations' && <SubmissionsAdmin view="donations" />}
          </div>

        </div>
      </div>
    </section>
  );
};
