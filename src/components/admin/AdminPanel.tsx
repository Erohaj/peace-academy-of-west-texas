import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, CalendarDays, Image as ImageIcon, Inbox, HeartHandshake, HandHeart, ClipboardList, Award } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { EventsAdmin } from './EventsAdmin';
import { GalleryAdmin } from './GalleryAdmin';
import { ShiftsAdmin } from './ShiftsAdmin';
import { ApplicationsAdmin } from './ApplicationsAdmin';
import { CertificatesAdmin } from './CertificatesAdmin';
import { SubmissionsAdmin } from './SubmissionsAdmin';

type AdminSection =
  | 'events'
  | 'shifts'
  | 'applications'
  | 'certificates'
  | 'gallery'
  | 'rsvps'
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

  const isAdmin = volunteer?.role === 'admin';

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
        { id: 'rsvps' as const, label: 'RSVPs & Messages', icon: Inbox },
        { id: 'donations' as const, label: 'Donations', icon: HeartHandshake }
      ],
    []
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
            {sections.map(({ id, label, icon: Icon }) => (
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
            {section === 'donations' && <SubmissionsAdmin view="donations" />}
          </div>

        </div>
      </div>
    </section>
  );
};
