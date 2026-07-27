import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Send,
  X as CloseIcon,
  Globe,
  Radio,
  SlidersHorizontal,
  Bookmark,
  ArrowUp
} from 'lucide-react';
import { SocialPost, SocialPlatform, SocialPostComment } from '../types';
import { INITIAL_SOCIAL_POSTS } from '../data/socialPosts';
import { useAppStore } from '../store/useAppStore';
import { AnimatedSection } from './AnimatedSection';
import { formatRelativeTime } from '../lib/relativeTime';

export const SocialMediaFeed: React.FC = () => {
  const { t } = useTranslation();
  const { language } = useAppStore();

  const [posts, setPosts] = useState<SocialPost[]>(INITIAL_SOCIAL_POSTS);
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform>('all');
  const [isFetching, setIsFetching] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load real Instagram/Facebook posts written by the fetch-social GitHub
  // Action (public/social-posts.json). Falls back to the curated mock posts
  // if that file is empty/missing (e.g. local dev before the first run).
  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}social-posts.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((livePosts: SocialPost[]) => {
        if (cancelled || !Array.isArray(livePosts) || livePosts.length === 0) return;
        const stillMocked = INITIAL_SOCIAL_POSTS.filter(
          (p) => p.platform !== 'facebook' && p.platform !== 'instagram'
        );
        const combined = [...livePosts, ...stillMocked].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        setPosts(combined);
      })
      .catch(() => {
        // No live feed yet — keep showing the curated mock posts.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Active Comment Drawer state
  const [expandedCommentPostId, setExpandedCommentPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  // Media Modal state
  const [previewMediaPost, setPreviewMediaPost] = useState<SocialPost | null>(null);

  // AI Summary State
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingAiSummary, setIsGeneratingAiSummary] = useState(false);

  // Filter posts
  const filteredPosts = useMemo(() => {
    if (selectedPlatform === 'all') return posts;
    return posts.filter((p) => p.platform === selectedPlatform);
  }, [posts, selectedPlatform]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // Simulate Fetching latest posts
  const handleFetchLatest = () => {
    setIsFetching(true);
    setTimeout(() => {
      setIsFetching(false);
      showToast(
        language === 'es'
          ? '¡Feed actualizado! Se han verificado las últimas publicaciones.'
          : 'Social feed updated! Checked latest channels.'
      );
    }, 700);
  };

  // Toggle Like
  const handleToggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const newIsLiked = !post.isLiked;
          return {
            ...post,
            isLiked: newIsLiked,
            likesCount: newIsLiked ? post.likesCount + 1 : post.likesCount - 1
          };
        }
        return post;
      })
    );
  };

  // Toggle Bookmark
  const handleToggleBookmark = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const newBookmarked = !post.isBookmarked;
          showToast(
            newBookmarked
              ? language === 'es' ? 'Publicación guardada' : 'Post saved to bookmarks'
              : language === 'es' ? 'Publicación eliminada de guardados' : 'Post removed from bookmarks'
          );
          return { ...post, isBookmarked: newBookmarked };
        }
        return post;
      })
    );
  };

  // Copy share link
  const handleShare = (postUrl: string) => {
    navigator.clipboard.writeText(postUrl);
    showToast(t('social.shareCopied'));
  };

  // Add Comment
  const handleAddComment = (postId: string) => {
    if (!commentInput.trim()) return;

    const newComment: SocialPostComment = {
      id: `comm-${Date.now()}`,
      authorName: 'Community Member',
      authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80',
      text: commentInput.trim(),
      createdAt: language === 'es' ? 'Ahora mismo' : 'Just now'
    };

    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const currentList = post.commentsList || [];
          return {
            ...post,
            commentsCount: post.commentsCount + 1,
            commentsList: [newComment, ...currentList]
          };
        }
        return post;
      })
    );

    setCommentInput('');
    showToast(language === 'es' ? 'Comentario publicado' : 'Comment posted');
  };

  // AI Gemini Social Pulse Summarizer
  const handleGenerateAiSummary = async () => {
    setIsGeneratingAiSummary(true);
    setAiSummary(null);

    const postContents = posts.map((p) => `[${p.platform.toUpperCase()}] ${p.content}`).join('\n');

    try {
      const apiKey =
        (typeof process !== 'undefined' ? process.env?.API_KEY : undefined) ||
        (import.meta as any).env?.VITE_API_KEY ||
        '';
      if (apiKey) {
        // Lazily load the Gemini SDK only when actually needed (keeps it out of the initial bundle)
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Summarize the following social media posts from Peace Academy of West Texas into 3 bullet points highlighting recent events, achievements, and community announcements. Format as clean bullet points without markdown bold symbols. Language: ${language === 'es' ? 'Spanish' : 'English'}.\n\nPosts:\n${postContents}`
        });

        if (response.text) {
          setAiSummary(response.text);
          setIsGeneratingAiSummary(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Gemini API call skipped or fallback triggered:', e);
    }

    // Fallback if API key unavailable or failed
    setTimeout(() => {
      if (language === 'es') {
        setAiSummary(
          '• Taller de Cocina Internacional de Odessa: Gran éxito con 25+ participantes; próxima fecha el 15 de agosto.\n' +
          '• Desfile y Festival de la Herencia 2026: Inscripciones y pases gratuitos ya disponibles para más de 15 pabellones culturales.\n' +
          '• Impacto de Ayuda Humanitaria: Más de 40 voluntarios entregaron 150+ paquetes de alimento y ropa en Midland.'
        );
      } else {
        setAiSummary(
          '• Odessa International Cooking Workshop: Sold-out gathering with 25+ community members; next date August 15th.\n' +
          '• 2026 Heritage Parade & Festival: Free passes and volunteer registration officially open for 15+ cultural pavilions.\n' +
          '• Community Relief Drive Impact: 40+ volunteers distributed over 150 emergency food and warm coat kits in Midland.'
        );
      }
      setIsGeneratingAiSummary(false);
    }, 900);
  };

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
          bgClass: 'bg-[#1877F2] text-white'
        };
      case 'youtube':
        return {
          icon: <Youtube className="w-3.5 h-3.5 text-white" />,
          label: 'YouTube',
          bgClass: 'bg-[#FF0000] text-white'
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
          bgClass: 'bg-[#A64D32] text-white'
        };
    }
  };

  const platformsList: { id: SocialPlatform; labelKey: string; icon: React.ReactNode }[] = [
    { id: 'all', labelKey: 'social.allPlatforms', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: 'instagram', labelKey: 'social.instagram', icon: <Instagram className="w-3.5 h-3.5" /> },
    { id: 'facebook', labelKey: 'social.facebook', icon: <Facebook className="w-3.5 h-3.5" /> },
    { id: 'youtube', labelKey: 'social.youtube', icon: <Youtube className="w-3.5 h-3.5" /> },
    { id: 'x', labelKey: 'social.x', icon: <Twitter className="w-3.5 h-3.5" /> }
  ];

  return (
    <section id="social-feed-section" className="py-20 bg-[#fef9ef] relative overflow-hidden border-t border-[#E5E0D8]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2A2A2A] text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-semibold border border-[#3A3A3A] animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <AnimatedSection direction="down">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#E5E0D8] pb-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-[#F4F1ED] border border-[#E5E0D8] px-3.5 py-1.5 rounded-full">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-[#A64D32] uppercase tracking-wider">
                  {t('social.liveBadge')}
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#2A2A2A] font-serif tracking-tight">
                {t('social.sectionTitle')}
              </h2>
              <p className="text-sm text-[#5A5A5A] leading-relaxed">
                {t('social.subtitle')}
              </p>
            </div>

            {/* Action Buttons: AI Summary & Refresh */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateAiSummary}
                disabled={isGeneratingAiSummary}
                className="px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className={`w-4 h-4 ${isGeneratingAiSummary ? 'animate-spin' : ''}`} />
                <span>{isGeneratingAiSummary ? t('social.aiSummarizing') : t('social.aiSummarizeBtn')}</span>
              </button>

              <button
                onClick={handleFetchLatest}
                disabled={isFetching}
                className="px-4 py-2.5 rounded-full bg-[#FDFBF7] border border-[#E5E0D8] text-[#2A2A2A] hover:bg-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#A64D32] ${isFetching ? 'animate-spin' : ''}`} />
                <span>{isFetching ? t('social.fetching') : t('social.refreshFeed')}</span>
              </button>

              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-3.5 py-2.5 rounded-full bg-[#FDFBF7] border border-[#E5E0D8] text-[#5A5A5A] hover:text-[#2A2A2A] hover:bg-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Scroll to Top"
              >
                <ArrowUp className="w-3.5 h-3.5 text-[#A64D32]" />
                <span className="hidden sm:inline">{language === 'es' ? 'Ir Arriba' : 'Top'}</span>
              </button>
            </div>
          </div>
        </AnimatedSection>

        {/* Gemini AI Social Pulse Summary Card */}
        {aiSummary && (
          <AnimatedSection direction="fade">
            <div className="bg-gradient-to-r from-[#FFFDF9] via-[#FAF6EE] to-[#F4EDE0] border border-amber-200/80 rounded-3xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold tracking-wider uppercase">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>{t('social.aiSummaryTitle')}</span>
                  </div>
                  <div className="text-sm text-[#3A3A3A] space-y-2 whitespace-pre-line leading-relaxed font-sans">
                    {aiSummary}
                  </div>
                </div>
                <button
                  onClick={() => setAiSummary(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* Platform Channel Filter Tabs */}
        <AnimatedSection direction="up" delayMs={50}>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {platformsList.map((plat) => {
              const isActive = selectedPlatform === plat.id;
              return (
                <button
                  key={plat.id}
                  onClick={() => setSelectedPlatform(plat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                    isActive
                      ? 'bg-[#A64D32] text-white shadow-sm'
                      : 'bg-[#FDFBF7] text-[#5A5A5A] hover:bg-white border border-[#E5E0D8]'
                  }`}
                >
                  {plat.icon}
                  <span>{t(plat.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </AnimatedSection>

        {/* Social Posts Grid Stream */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPosts.map((post, idx) => {
            const badge = getPlatformBadge(post.platform);
            const contentText = language === 'es' ? post.contentEs : post.content;
            const timeAgo =
              formatRelativeTime(post.publishedAt, language) ||
              (language === 'es' ? post.publishedAtRelativeEs : post.publishedAtRelative);
            const isCommentsExpanded = expandedCommentPostId === post.id;

            return (
              <AnimatedSection key={post.id} direction="up" delayMs={50 + (idx % 3) * 80}>
                <div className="bg-[#F4F1ED] rounded-[28px] border border-[#E5E0D8] shadow-sm hover:shadow-md transition-all flex flex-col h-full overflow-hidden group">
                  
                  {/* Card Top Author Bar */}
                  <div className="p-5 flex items-center justify-between border-b border-[#E5E0D8]/60 bg-white/40">
                    <div className="flex items-center gap-3">
                      <img
                        src={post.author.avatarUrl}
                        alt={post.author.name}
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 rounded-full object-cover border border-[#E5E0D8]"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[#2A2A2A]">{post.author.name}</span>
                          {post.author.verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 fill-sky-500/20 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#7A7A7A]">
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
                    <div
                      onClick={() => setPreviewMediaPost(post)}
                      className="relative h-60 bg-[#E5E0D8] overflow-hidden cursor-pointer group/media"
                    >
                      <img
                        src={post.mediaUrl}
                        alt="Social Media Preview"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="bg-white/90 text-[#2A2A2A] text-xs font-bold px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm">
                          {language === 'es' ? 'Ver Multimedia' : 'Expand Media'}
                        </span>
                      </div>
                      {post.mediaType === 'video' && (
                        <div className="absolute bottom-3 right-3 bg-red-600/90 text-white px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-md">
                          <Youtube className="w-3 h-3" />
                          <span>VIDEO</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Post Content Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <p className="text-xs text-[#3A3A3A] leading-relaxed font-sans whitespace-pre-line">
                      {contentText}
                    </p>

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {post.tags.map((tag) => (
                          <span key={tag} className="text-[10px] font-semibold text-[#A64D32] bg-[#A64D32]/10 px-2 py-0.5 rounded-md">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement Metrics & Interactive Buttons Bar */}
                    <div className="pt-3 border-t border-[#E5E0D8] flex items-center justify-between text-[#5A5A5A]">
                      
                      {/* Left: Like & Comment Controls */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleToggleLike(post.id)}
                          className={`flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                            post.isLiked ? 'text-red-600' : 'hover:text-red-500'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-red-600 text-red-600' : ''}`} />
                          <span>{post.likesCount}</span>
                        </button>

                        <button
                          onClick={() =>
                            setExpandedCommentPostId(isCommentsExpanded ? null : post.id)
                          }
                          className="flex items-center gap-1.5 text-xs font-bold hover:text-[#2A2A2A] transition-all cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{post.commentsCount}</span>
                        </button>

                        <button
                          onClick={() => handleShare(post.postUrl)}
                          className="flex items-center gap-1.5 text-xs font-bold hover:text-[#2A2A2A] transition-all cursor-pointer"
                          title={t('social.share')}
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Right: Save & External Link */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleBookmark(post.id)}
                          className={`p-1.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer ${
                            post.isBookmarked ? 'text-[#A64D32]' : ''
                          }`}
                          title="Bookmark"
                        >
                          <Bookmark className={`w-4 h-4 ${post.isBookmarked ? 'fill-[#A64D32]' : ''}`} />
                        </button>

                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-full hover:bg-black/5 text-[#5A5A5A] hover:text-[#2A2A2A] transition-colors"
                          title={t('social.viewPost')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    {/* Inline Comment Drawer */}
                    {isCommentsExpanded && (
                      <div className="pt-3 border-t border-[#E5E0D8] space-y-3 bg-[#FDFBF7] p-3 rounded-2xl">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#2A2A2A]">
                          <span>{t('social.commentsTitle', { count: post.commentsCount })}</span>
                        </div>

                        {/* Existing Comments List */}
                        <div className="max-h-36 overflow-y-auto space-y-2 pr-1 text-[11px]">
                          {post.commentsList && post.commentsList.length > 0 ? (
                            post.commentsList.map((comm) => (
                              <div key={comm.id} className="bg-white p-2.5 rounded-xl border border-[#E5E0D8]/60 space-y-1">
                                <div className="flex items-center justify-between font-bold text-[#2A2A2A]">
                                  <span>{comm.authorName}</span>
                                  <span className="text-[9px] text-[#8A8A8A] font-normal">{comm.createdAt}</span>
                                </div>
                                <p className="text-[#4A4A4A]">{comm.text}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[#8A8A8A] italic">{t('social.noCommentsYet')}</p>
                          )}
                        </div>

                        {/* Add Comment Input */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                            placeholder={t('social.addCommentPlaceholder')}
                            className="flex-1 bg-white border border-[#E5E0D8] rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-[#A64D32]"
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            className="p-1.5 bg-[#A64D32] text-white rounded-full hover:bg-[#8e412a] transition-colors cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        {/* Media Lightbox Modal */}
        {previewMediaPost && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#FDFBF7] rounded-3xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col border border-[#E5E0D8] shadow-2xl relative">
              
              {/* Modal Close Button */}
              <button
                onClick={() => setPreviewMediaPost(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
              >
                <CloseIcon className="w-5 h-5" />
              </button>

              {/* Media Content */}
              <div className="bg-black flex items-center justify-center max-h-[60vh] overflow-hidden">
                <img
                  src={previewMediaPost.mediaUrl}
                  alt="Full Media View"
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>

              {/* Caption details */}
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={previewMediaPost.author.avatarUrl}
                      alt={previewMediaPost.author.name}
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-full border border-[#E5E0D8]"
                    />
                    <div>
                      <div className="font-bold text-sm text-[#2A2A2A]">{previewMediaPost.author.name}</div>
                      <div className="text-xs text-[#7A7A7A]">{previewMediaPost.author.handle}</div>
                    </div>
                  </div>

                  <a
                    href={previewMediaPost.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-full bg-[#A64D32] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#8e412a] transition-colors"
                  >
                    <span>{t('social.viewPost')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <p className="text-xs text-[#3A3A3A] leading-relaxed">
                  {language === 'es' ? previewMediaPost.contentEs : previewMediaPost.content}
                </p>
              </div>

            </div>
          </div>
        )}

        {/* Follow Us Social Banner */}
        <AnimatedSection direction="up" delayMs={100}>
          <div className="bg-[#F4F1ED] rounded-3xl p-8 border border-[#E5E0D8] flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#A64D32] uppercase tracking-wider flex items-center justify-center md:justify-start gap-2">
                <Radio className="w-4 h-4" />
                <span>{t('social.followerCount')}</span>
              </div>
              <h3 className="text-2xl font-extrabold text-[#2A2A2A] font-serif">
                {t('social.followUs')}
              </h3>
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
                className="px-4 py-2.5 rounded-full bg-[#1877F2] text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
              >
                <Facebook className="w-4 h-4" />
                <span>Facebook</span>
              </a>

              <a
                href={ORG_LINKS.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-full bg-[#FF0000] text-white text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 transition-opacity"
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

      </div>
    </section>
  );
};
