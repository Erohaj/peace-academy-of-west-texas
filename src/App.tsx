import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MissionSection } from './components/MissionSection';
import { BrochureShowcase } from './components/BrochureShowcase';
import { EventFeed } from './components/EventFeed';
import { SocialMediaFeed } from './components/SocialMediaFeed';
import { Gallery } from './components/Gallery';
import { VolunteerPortal } from './components/VolunteerPortal';
import { DonationWidget } from './components/DonationWidget';
import { RSVPModal } from './components/RSVPModal';
import { ContactModal } from './components/ContactModal';
import { SearchModal } from './components/SearchModal';
import { Footer } from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { readDonationReturn } from './lib/donationReturn';
import { SITE_NAME, SITE_TITLE } from './lib/seo';
import { ActiveTab } from './types';

// Staff-only, and a sizeable chunk of forms and tables. Loading it lazily
// keeps it out of the bundle every ordinary visitor downloads.
const AdminPanel = lazy(() =>
  import('./components/admin/AdminPanel').then((module) => ({ default: module.AdminPanel }))
);

/** Tabs that may be opened straight from a URL hash. */
const LINKABLE_TABS: ActiveTab[] = [
  'home',
  'events',
  'social',
  'gallery',
  'donate',
  'volunteer',
  'admin'
];

export const App: React.FC = () => {
  const { activeTab, setActiveTab, initialize, dataStatus, dataError, refreshContent, language } =
    useAppStore();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const { t } = useTranslation();

  // Loads events, gallery and shifts, and subscribes to auth changes. Guarded
  // inside the store against StrictMode's double effect in development.
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Stripe returns the donor to this page with ?donation=... . There is no
  // router, so route it by hand: the donation widget lives on the donate tab
  // (and on home), and the thank-you screen belongs on the former.
  useEffect(() => {
    if (readDonationReturn()) setActiveTab('donate');
  }, [setActiveTab]);

  // Bookmarkable section links, e.g. .../#admin — the admin panel is otherwise
  // reachable only through a footer link that appears after signing in, which
  // is a poor thing to have to rediscover. Runs after the donation check so a
  // Stripe return still wins; guarded by the tab whitelist so a stray hash
  // can't put the app in an unknown state. It grants nothing on its own:
  // AdminPanel still checks the session, and RLS still checks every query.
  //
  // Kept listening rather than read once at mount, so the back button steps
  // back through the tabs the visitor opened instead of leaving the site.
  // `popstate` as well as `hashchange` because a traversal that lands on the
  // bare URL, with no fragment left to change, only fires the former.
  useEffect(() => {
    // An absent fragment means "home" when the visitor navigated back to it,
    // but means nothing at all on the first render — the effect above may
    // have just sent a returning donor to the donate tab, and falling back to
    // home here would snatch the thank-you screen away from them.
    const applyHash = (fallBackToHome: boolean) => {
      const requested = window.location.hash.replace('#', '') as ActiveTab;
      if (requested && LINKABLE_TABS.includes(requested)) setActiveTab(requested);
      else if (fallBackToHome) setActiveTab('home');
    };

    const onHistoryNavigation = () => applyHash(true);

    applyHash(false);
    window.addEventListener('hashchange', onHistoryNavigation);
    window.addEventListener('popstate', onHistoryNavigation);
    return () => {
      window.removeEventListener('hashchange', onHistoryNavigation);
      window.removeEventListener('popstate', onHistoryNavigation);
    };
  }, [setActiveTab]);

  // The other direction: opening a tab records it in the URL, so the address
  // bar can be copied and the back button has somewhere to go.
  //
  // pushState rather than assigning location.hash, for two reasons: it can
  // clear the fragment entirely on the home tab (assigning '' leaves a bare
  // '#' behind), and it does not fire hashchange, so this cannot ping-pong
  // with the listener above.
  useEffect(() => {
    const target =
      activeTab === 'home'
        ? `${window.location.pathname}${window.location.search}`
        : `#${activeTab}`;

    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const resolved = new URL(target, window.location.href);

    if (`${resolved.pathname}${resolved.search}${resolved.hash}` !== current) {
      window.history.pushState(null, '', target);
    }
  }, [activeTab]);

  /**
   * The browser tab caption, which is the one piece of head metadata that
   * genuinely varies per tab: it is what the visitor reads in their tab strip
   * and what their history and bookmarks record.
   *
   * Descriptions and og: tags used to vary here too. They were removed
   * because they could not work: there is one URL for the whole site, so a
   * search engine has one page to index and a shared link always resolves to
   * the home page. The static tags in index.html describe it — and unlike
   * these, they are visible to crawlers, which do not run the bundle.
   */
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'events':
        return `${t('nav.events')} | ${SITE_NAME}`;
      case 'social':
        return `${t('nav.social')} | ${SITE_NAME}`;
      case 'gallery':
        return `${t('nav.gallery')} | ${SITE_NAME}`;
      case 'volunteer':
        return `${t('nav.volunteer')} | ${SITE_NAME}`;
      case 'donate':
        return `${t('nav.donate')} | ${SITE_NAME}`;
      case 'admin':
        return `${t('footer.adminPanel')} | ${SITE_NAME}`;
      case 'home':
      default:
        return SITE_TITLE;
    }
  };

  // Written straight onto the document rather than rendered as head elements.
  // React 19 hoists a rendered <title> into the head *alongside* the static
  // one in index.html, which has to stay there for crawlers — assigning to
  // document.title updates that one tag instead of adding a second.
  useEffect(() => {
    document.title = getTabTitle(activeTab);
    // Screen readers switch pronunciation on this, and it is otherwise stuck
    // at the "en" index.html was served with.
    document.documentElement.lang = language;
  }, [activeTab, language, t]);

  return (
    <div className="min-h-screen bg-[#fef9ef] font-sans antialiased text-[#292930] flex flex-col selection:bg-[#b05a36] selection:text-white">
      {/* Sticky Top Navigation */}
      <Navbar onOpenContact={() => setIsContactOpen(true)} />

      {/* Dynamic View Routing */}
      <main className="flex-grow pt-16">
        <ErrorBoundary>
          {/* Content comes from Supabase now, so a failed load has to be
              visible. Donations and the volunteer portal talk to the backend
              directly and surface their own errors, so this banner sits above
              the page rather than replacing it. */}
          {dataStatus === 'error' && (
            <div className="max-w-3xl mx-auto px-4 pt-8">
              <div className="flex items-start gap-3 bg-[#A64D32]/10 border border-[#A64D32]/30 rounded-2xl px-5 py-4">
                <AlertCircle className="w-5 h-5 text-[#A64D32] shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-bold text-[#A64D32]">
                    {dataError === 'not_configured'
                      ? t('common.notConfiguredTitle')
                      : t('common.loadErrorTitle')}
                  </div>
                  <p className="text-xs text-[#5A5A5A] mt-1">
                    {dataError === 'not_configured'
                      ? t('common.notConfiguredText')
                      : t('common.loadErrorText')}
                  </p>
                </div>
                {dataError !== 'not_configured' && (
                  <button
                    onClick={() => void refreshContent()}
                    className="shrink-0 flex items-center gap-1.5 bg-[#A64D32] hover:bg-[#8b3f28] text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('common.retry')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'home' && (
            <>
              <Hero />
              <MissionSection />
              <BrochureShowcase />
              <EventFeed />
              <SocialMediaFeed />
              <Gallery />
              <DonationWidget />
            </>
          )}

          {activeTab === 'events' && <EventFeed />}

          {activeTab === 'social' && <SocialMediaFeed />}

          {activeTab === 'gallery' && <Gallery />}

          {activeTab === 'volunteer' && <VolunteerPortal />}

          {activeTab === 'donate' && <DonationWidget />}

          {activeTab === 'admin' && (
            <Suspense
              fallback={
                <div className="py-20 text-center text-sm text-[#5A5A5A]">{t('common.loading')}</div>
              }
            >
              <AdminPanel />
            </Suspense>
          )}
        </ErrorBoundary>
      </main>

      {/* Global Footer */}
      <Footer onOpenContact={() => setIsContactOpen(true)} />

      {/* Modal Dialogs */}
      <RSVPModal />
      <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
      <SearchModal />

    </div>
  );
};

export default App;
