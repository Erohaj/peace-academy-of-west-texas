import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PageTitleProps, subTitleTag, titleTag } from './pageTitle';
import { ORG_LINKS } from '../data/orgLinks';
import {
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Heart,
  MessageCircle,
  Share2,
  ExternalLink,
  CheckCircle2,
  X as CloseIcon,
  Globe,
  Radio,
  SlidersHorizontal,
  Play
} from 'lucide-react';
import { SocialPost, SocialPlatform } from '../types';
import { INITIAL_SOCIAL_POSTS } from '../data/socialPosts';
import { useAppStore } from '../store/useAppStore';
import { AnimatedSection } from './AnimatedSection';
import { formatRelativeTime } from '../lib/relativeTime';
import { ModalShell } from './ModalShell';
import logoImg from '../assets/logo.webp';

const LIGHTBOX_TITLE_ID = 'social-lightbox-title';

/**
 * A post caption cut to six lines, with a toggle to read the rest.
 *
 * Instagram captions run long — hashtags and all — and a grid row is as tall
 * as its tallest card, so on the first real fetch one long post stretched its
 * two neighbours into mostly empty space. The
 * toggle appears only when the text is actually cut: measured, not guessed
 * from a character count, because emoji, line breaks and the card width all
 * change where six lines end. Re-measured on resize for the same reason.
 */
const ClampedCaption: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="space-y-1.5">
      <p
        ref={ref}
        className={`text-xs text-graphite leading-relaxed font-sans whitespace-pre-line ${expanded ? '' : 'line-clamp-6'}`}
      >
        {/* Collapsed, the blank lines between paragraphs go: six lines is
            little enough that one of them landing on a gap left the ellipsis
            alone on its own line. Expanded shows the caption as written. */}
        {expanded ? text : text.replace(/\n\s*\n/g, '\n')}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="text-xs font-bold text-terracotta-deep hover:text-graphite transition-colors cursor-pointer pawtx-focus rounded"
        >
          {expanded ? t('social.showLess') : t('social.readMore')}
        </button>
      )}
    </div>
  );
};

export const SocialMediaFeed: React.FC<PageTitleProps> = ({ asPageTitle }) => {
  const Title = titleTag(asPageTitle);
  const CardTitle = subTitleTag(asPageTitle);
  const { t } = useTranslation();
  const { language } = useAppStore();

  const [posts, setPosts] = useState<SocialPost[]>(INITIAL_SOCIAL_POSTS);
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load real Instagram/Facebook posts written by the fetch-social GitHub
  // Action into public/social-posts.json.
  //
  // There is no fallback any more: INITIAL_SOCIAL_POSTS is deliberately empty
  // because what used to fill it was invented -- fake captions under fake
  // handles, linking to Instagram URLs that 404. An empty feed with a notice
  // and the real channel links is the honest state, so a missing or empty file
  // leaves the component showing exactly that.
  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}social-posts.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((livePosts: SocialPost[]) => {
        if (cancelled || !Array.isArray(livePosts) || livePosts.length === 0) return;
        // The fetcher stores each image under public/social-media/ and writes
        // a root-relative path, because Meta's own image URLs expire within
        // days. Resolved against BASE_URL here, like the JSON itself, so the
        // feed survives the site moving back under a sub-path.
        livePosts = livePosts.map((post) =>
          post.mediaUrl && !/^https?:\/\//.test(post.mediaUrl)
            ? { ...post, mediaUrl: `${import.meta.env.BASE_URL}${post.mediaUrl}` }
            : post
        );
        // Empty today, since INITIAL_SOCIAL_POSTS is. Kept because the merge
        // is what a future hand-written post from a channel the fetcher cannot
        // reach -- YouTube, say -- would need, and it is the Facebook and
        // Instagram entries specifically that the live file replaces.
        const stillMocked = INITIAL_SOCIAL_POSTS.filter(
          (p) => p.platform !== 'facebook' && p.platform !== 'instagram'
        );
        const combined = [...livePosts, ...stillMocked].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        setPosts(combined);
      })
      .catch(() => {
        // The file is absent in local dev before the first scheduled run, and
        // a fetch failure is not worth surfacing: the empty state already says
        // there is nothing here and points at the real accounts.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Media Modal state
  const [previewMediaPost, setPreviewMediaPost] = useState<SocialPost | null>(null);

  // Filter posts
  const filteredPosts = useMemo(() => {
    if (selectedPlatform === 'all') return posts;
    return posts.filter((p) => p.platform === selectedPlatform);
  }, [posts, selectedPlatform]);

  // Until the Meta integration is connected there is nothing real to show, and
  // the filters below act on posts — filtering an empty feed is a dead button
  // that makes the section look broken rather than unfinished. The follow
  // banner stays: those links are real.
  const hasPosts = posts.length > 0;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // The only action a card offers on this page. Liking, commenting and saving
  // used to be here too, and none of them reached Meta: a like bumped the real
  // count in this tab only, and a comment toasted "Comment posted" under a
  // stock-photo avatar and went nowhere. On real posts that reads as having
  // commented on the org's Instagram. They happen on the platform now, behind
  // the external link; the counts stay, read-only, as last fetched.
  const handleShare = (postUrl: string) => {
    navigator.clipboard
      .writeText(postUrl)
      .then(() => showToast(t('social.shareCopied')))
      .catch(() => window.open(postUrl, '_blank', 'noopener,noreferrer'));
  };

  // There was also an AI summary here. With no Gemini key in the build — and
  // there must not be one, Vite inlines VITE_ variables into the public bundle
  // — it fell back to three hardcoded bullets about a cooking workshop, a
  // heritage parade and a relief drive that nobody could source, presented as
  // a summary of the org's own posts. Beside it sat a refresh button that
  // waited 700 ms and announced "Checked latest channels" without fetching
  // anything. Both are gone; the feed refreshes on the fetch-social schedule.

  // Helper for platform badge design
  const getPlatformBadge = (platform: SocialPost['platform']) => {
    switch (platform) {
      case 'instagram':
        return {
          icon: <Instagram className="w-3.5 h-3.5 text-white" />,
          label: 'Instagram',
          bgClass: 'bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 text-white'
        };
      case 'facebook':
        return {
          icon: <Facebook className="w-3.5 h-3.5 text-white" />,
          label: 'Facebook',
          bgClass: 'bg-[#1461C7] text-white'
        };
      case 'youtube':
        return {
          icon: <Youtube className="w-3.5 h-3.5 text-white" />,
          label: 'YouTube',
          bgClass: 'bg-[#CC0000] text-white'
        };
      case 'x':
        return {
          icon: <Twitter className="w-3.5 h-3.5 text-white" />,
          label: 'X / Twitter',
          bgClass: 'bg-[#14171A] text-white'
        };
      default:
        return {
          icon: <Globe className="w-3.5 h-3.5 text-white" />,
          label: 'Social',
          bgClass: 'bg-terracotta text-white'
        };
    }
  };

  const platformsList: { id: SocialPlatform; labelKey: string; icon: React.ReactNode }[] = [
    { id: 'all', labelKey: 'social.allPlatforms', icon: <SlidersHorizontal className="w-4 h-4" /> },
    { id: 'instagram', labelKey: 'social.instagram', icon: <Instagram className="w-4 h-4" /> },
    { id: 'facebook', labelKey: 'social.facebook', icon: <Facebook className="w-4 h-4" /> },
    { id: 'youtube', labelKey: 'social.youtube', icon: <Youtube className="w-4 h-4" /> },
    { id: 'x', labelKey: 'social.x', icon: <Twitter className="w-4 h-4" /> }
  ];

  return (
    <section id="social-feed-section" className="py-20 bg-parchment relative overflow-hidden border-t border-warm-taupe">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-graphite text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-semibold border border-graphite animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="down">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-warm-taupe pb-6">
            <div className="space-y-3 max-w-2xl">
              {/* Only once there are real posts behind it. It used to say
                  LIVE SOCIAL STREAM over a pulsing dot, but the feed is a
                  file rebuilt every six hours, so it no longer claims to be
                  live either. */}
              {hasPosts && (
                <div className="inline-flex items-center gap-2 bg-aged-paper border border-warm-taupe px-3.5 py-1.5 rounded-full">
                  <span className="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" aria-hidden="true"></span>
                  <span className="text-[11px] font-bold text-terracotta uppercase tracking-wider">
                    {t('social.liveBadge')}
                  </span>
                </div>
              )}

              <Title className="text-3xl sm:text-4xl font-extrabold text-graphite font-serif tracking-tight">
                {t('social.sectionTitle')}
              </Title>
              <p className="text-sm text-charcoal leading-relaxed">
                {t('social.subtitle')}
              </p>
            </div>

          </div>
        </AnimatedSection>

        {/* Follow Us Social Banner — the only place on the site that links out
            to the org's channels, so it sits at the top of the section rather
            than below the feed where it was easy to scroll past. */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="bg-aged-paper rounded-3xl p-8 border border-warm-taupe flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="space-y-2">
              <div className="text-xs font-bold text-terracotta uppercase tracking-wider flex items-center justify-center md:justify-start gap-2">
                <Radio className="w-4 h-4" />
                {/* Was a "8.5k+ Followers Across Channels" line that nobody
                    could source. A follower count on a charity's own site is
                    the kind of claim people check, so it names the channels
                    instead of counting them. */}
                <span>{t('social.channelsLabel')}</span>
              </div>
              <CardTitle className="text-2xl font-extrabold text-graphite font-serif">
                {t('social.followUs')}
              </CardTitle>
            </div>

            {/* Platform Follow Quick Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={ORG_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Instagram className="w-4 h-4" />
                <span>Instagram</span>
              </a>

              <a
                href={ORG_LINKS.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-[#1461C7] text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Facebook className="w-4 h-4" />
                <span>Facebook</span>
              </a>

              <a
                href={ORG_LINKS.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-[#CC0000] text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Youtube className="w-4 h-4" />
                <span>YouTube</span>
              </a>

              <a
                href={ORG_LINKS.x}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-[#14171A] text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Twitter className="w-4 h-4" />
                <span>X / Twitter</span>
              </a>
            </div>
          </div>
        </AnimatedSection>

        {/* Platform Channel Filter Tabs — icon-only, so they read as controls
            rather than a second set of links next to the follow banner above.
            The channel name stays in title/aria-label: without a visible label
            these buttons are otherwise unidentifiable to a screen reader. */}
        {hasPosts && (
        <AnimatedSection direction="up" delayMs={50}>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {platformsList.map((plat) => {
              const isActive = selectedPlatform === plat.id;
              const label = t(plat.labelKey);
              return (
                <button
                  key={plat.id}
                  onClick={() => setSelectedPlatform(plat.id)}
                  title={label}
                  aria-label={label}
                  aria-pressed={isActive}
                  className={`p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-terracotta text-white shadow-sm'
                      : 'bg-parchment text-charcoal hover:bg-white hover:text-terracotta border border-warm-taupe'
                  }`}
                >
                  {plat.icon}
                </button>
              );
            })}
          </div>
        </AnimatedSection>
        )}

        {/* Nothing to stream yet. Saying so plainly beats the six invented
            posts that used to sit here under the live badge — the follow
            banner above still sends people to the real channels. */}
        {!hasPosts && (
          <AnimatedSection direction="up" delayMs={50}>
            <div className="bg-aged-paper border border-warm-taupe rounded-3xl px-8 py-12 text-center space-y-3">
              <Radio className="w-8 h-8 text-terracotta mx-auto" />
              <CardTitle className="text-xl font-extrabold text-graphite font-serif">
                {t('social.emptyTitle')}
              </CardTitle>
              <p className="text-sm text-charcoal leading-relaxed max-w-md mx-auto">
                {t('social.emptyBody')}
              </p>
            </div>
          </AnimatedSection>
        )}

        {/* Social Posts Grid Stream */}
        {hasPosts && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPosts.map((post, idx) => {
            const badge = getPlatformBadge(post.platform);
            const contentText = language === 'es' ? post.contentEs : post.content;
            const timeAgo =
              formatRelativeTime(post.publishedAt, language) ||
              (language === 'es' ? post.publishedAtRelativeEs : post.publishedAtRelative);

            return (
              <AnimatedSection key={post.id} direction="up" delayMs={50 + (idx % 3) * 80}>
                <div className="bg-aged-paper rounded-[28px] border border-warm-taupe shadow-sm hover:shadow-md transition-all flex flex-col h-full overflow-hidden group">
                  
                  {/* Card Top Author Bar */}
                  <div className="p-5 flex items-center justify-between border-b border-warm-taupe/60 bg-white/40">
                    <div className="flex items-center gap-3">
                      <img
                        src={post.author.avatarUrl || logoImg}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-full object-cover border border-warm-taupe"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-graphite">{post.author.name}</span>
                          {post.author.verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 fill-sky-500/20 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#6B6B69]">
                          <span>{post.author.handle}</span>
                          <span>•</span>
                          <span>{timeAgo}</span>
                        </div>
                      </div>
                    </div>

                    {/* Platform Badge */}
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-xs ${badge.bgClass}`}>
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                  </div>

                  {/* Post Media Preview */}
                  {post.mediaUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewMediaPost(post)}
                      aria-label={t('social.expandMedia')}
                      className="relative block w-full h-60 bg-warm-taupe overflow-hidden cursor-pointer group/media pawtx-focus"
                    >
                      <img
                        src={post.mediaUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-500"
                      />
                      <span className="absolute inset-0 bg-black/20 opacity-0 group-hover/media:opacity-100 group-focus-visible/media:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="bg-white/90 text-graphite text-xs font-bold px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm">
                          {t('social.expandMedia')}
                        </span>
                      </span>
                      {/* Instagram reels are videos too, so a play glyph rather
                          than the YouTube logo this used to carry. */}
                      {post.mediaType === 'video' && (
                        <span className="absolute bottom-3 right-3 bg-black/75 text-white px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-md">
                          <Play className="w-3 h-3 fill-white" />
                          <span>{t('social.video')}</span>
                        </span>
                      )}
                    </button>
                  )}

                  {/* Post Content Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <ClampedCaption text={contentText} />

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {post.tags.map((tag) => (
                          <span key={tag} className="text-[10px] font-semibold text-terracotta-deep bg-terracotta/10 px-2 py-0.5 rounded-md">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement counts as Meta reported them at the last
                        fetch — read-only, because nothing on this page can
                        like or comment on the real post. */}
                    <div className="pt-3 border-t border-warm-taupe flex items-center justify-between text-charcoal">
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span
                          className="flex items-center gap-1.5"
                          role="img"
                          aria-label={t('social.likesCount', { count: post.likesCount })}
                          title={t('social.likesCount', { count: post.likesCount })}
                        >
                          <Heart className="w-4 h-4" aria-hidden="true" />
                          <span aria-hidden="true">{post.likesCount}</span>
                        </span>
                        <span
                          className="flex items-center gap-1.5"
                          role="img"
                          aria-label={t('social.commentsCount', { count: post.commentsCount })}
                          title={t('social.commentsCount', { count: post.commentsCount })}
                        >
                          <MessageCircle className="w-4 h-4" aria-hidden="true" />
                          <span aria-hidden="true">{post.commentsCount}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleShare(post.postUrl)}
                          className="p-1.5 rounded-full hover:bg-black/5 hover:text-graphite transition-colors cursor-pointer pawtx-focus"
                          title={t('social.share')}
                          aria-label={t('social.share')}
                        >
                          <Share2 className="w-4 h-4" />
                        </button>

                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-full hover:bg-black/5 text-xs font-bold text-terracotta-deep hover:text-graphite transition-colors flex items-center gap-1.5 pawtx-focus"
                        >
                          <span>{t('social.viewOn', { platform: badge.label })}</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
        )}

        {/* Media lightbox — ModalShell, so it has the Escape, click-outside,
            focus trap and scroll lock the site's other overlays have. */}
        <ModalShell
          isOpen={previewMediaPost !== null}
          onClose={() => setPreviewMediaPost(null)}
          labelledBy={LIGHTBOX_TITLE_ID}
          panelClassName="max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        >
          {previewMediaPost && (
            <>
              <button
                type="button"
                onClick={() => setPreviewMediaPost(null)}
                aria-label={t('social.close')}
                className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors cursor-pointer pawtx-focus"
              >
                <CloseIcon className="w-5 h-5" />
              </button>

              <div className="bg-black flex items-center justify-center max-h-[60vh] overflow-hidden">
                <img
                  src={previewMediaPost.mediaUrl}
                  alt=""
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={previewMediaPost.author.avatarUrl || logoImg}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-full border border-warm-taupe"
                    />
                    <div>
                      <div id={LIGHTBOX_TITLE_ID} className="font-bold text-sm text-graphite">
                        {previewMediaPost.author.name}
                      </div>
                      <div className="text-xs text-[#6B6B69]">{previewMediaPost.author.handle}</div>
                    </div>
                  </div>

                  <a
                    href={previewMediaPost.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-full bg-terracotta text-white text-xs font-bold flex items-center gap-2 hover:bg-terracotta-deep transition-colors shrink-0 pawtx-focus"
                  >
                    <span>{t('social.viewOn', { platform: getPlatformBadge(previewMediaPost.platform).label })}</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </div>

                <p className="text-xs text-graphite leading-relaxed whitespace-pre-line">
                  {language === 'es' ? previewMediaPost.contentEs : previewMediaPost.content}
                </p>
              </div>
            </>
          )}
        </ModalShell>

      </div>
    </section>
  );
};
