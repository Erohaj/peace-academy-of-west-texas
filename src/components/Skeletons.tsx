import React from 'react';

/**
 * Single Event Card Skeleton Loader
 */
export const EventCardSkeleton: React.FC = () => {
  return (
    <div className="bg-aged-paper rounded-[24px] overflow-hidden border border-warm-taupe shadow-sm flex flex-col h-full animate-pulse">
      {/* Image Skeleton */}
      <div className="relative h-56 bg-warm-taupe overflow-hidden">
        {/* Shimmer pulse effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        
        {/* Badge Skeletons */}
        <div className="absolute top-4 right-4 w-28 h-6 bg-taupe-deep rounded-full" />
        <div className="absolute bottom-4 left-4 w-20 h-5 bg-taupe-deep rounded-md" />
      </div>

      {/* Content Skeleton */}
      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          {/* Title Lines */}
          <div className="h-7 bg-warm-taupe rounded-md w-3/4" />
          <div className="h-7 bg-warm-taupe rounded-md w-1/2" />

          {/* Description Lines */}
          <div className="space-y-2 pt-2">
            <div className="h-3.5 bg-warm-taupe rounded-md w-full" />
            <div className="h-3.5 bg-warm-taupe rounded-md w-5/6" />
            <div className="h-3.5 bg-warm-taupe rounded-md w-4/6" />
          </div>

          {/* Date, Time, Location Details */}
          <div className="space-y-2.5 pt-3 border-t border-warm-taupe">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-taupe-deep rounded-full shrink-0" />
              <div className="h-3.5 bg-warm-taupe rounded-md w-32" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-taupe-deep rounded-full shrink-0" />
              <div className="h-3.5 bg-warm-taupe rounded-md w-24" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-taupe-deep rounded-full shrink-0" />
              <div className="h-3.5 bg-warm-taupe rounded-md w-40" />
            </div>
          </div>
        </div>

        {/* RSVP Button Skeleton */}
        <div className="pt-2">
          <div className="h-11 bg-taupe-deep rounded-full w-full" />
        </div>
      </div>
    </div>
  );
};

/**
 * Grid of Event Card Skeletons
 */
export const EventGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: count }).map((_, idx) => (
        <EventCardSkeleton key={idx} />
      ))}
    </div>
  );
};

/**
 * Monthly Event Calendar View Skeleton Loader
 */
export const CalendarSkeleton: React.FC = () => {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Calendar Top Header Skeleton */}
      <div className="bg-aged-paper rounded-3xl p-6 border border-warm-taupe space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warm-taupe rounded-2xl" />
            <div className="space-y-2">
              <div className="h-6 w-36 bg-warm-taupe rounded-md" />
              <div className="h-3 w-28 bg-taupe-deep rounded-md" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-16 h-8 bg-warm-taupe rounded-full" />
            <div className="w-20 h-8 bg-warm-taupe rounded-full" />
          </div>
        </div>

        {/* Quick Month Jump Chips Skeleton */}
        <div className="flex items-center gap-2 overflow-hidden pt-2 border-t border-warm-taupe">
          <div className="w-20 h-4 bg-taupe-deep rounded-md shrink-0" />
          <div className="w-20 h-6 bg-warm-taupe rounded-full shrink-0" />
          <div className="w-20 h-6 bg-warm-taupe rounded-full shrink-0" />
          <div className="w-20 h-6 bg-warm-taupe rounded-full shrink-0" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="bg-parchment rounded-3xl border border-warm-taupe overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-aged-paper border-b border-warm-taupe py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-center">
              <div className="h-3 w-8 bg-warm-taupe rounded-md" />
            </div>
          ))}
        </div>

        {/* Days cells */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-warm-taupe/60 bg-white">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[90px] sm:min-h-[110px] p-2 flex flex-col justify-between">
              <div className="w-5 h-5 bg-warm-taupe rounded-full" />
              {i % 4 === 0 && (
                <div className="h-4 bg-warm-taupe rounded-md w-full mt-2" />
              )}
              {i % 7 === 2 && (
                <div className="h-4 bg-taupe-deep rounded-md w-full mt-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Event Details Drawer Skeleton */}
      <div className="bg-aged-paper rounded-3xl p-6 sm:p-8 border border-warm-taupe space-y-6">
        <div className="h-6 w-48 bg-warm-taupe rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-warm-taupe rounded-2xl" />
          <div className="h-64 bg-warm-taupe rounded-2xl" />
        </div>
      </div>
    </div>
  );
};

/**
 * Gallery Item Card Skeleton Loader
 */
export const GalleryCardSkeleton: React.FC = () => {
  return (
    <div className="rounded-3xl overflow-hidden shadow-sm border border-warm-taupe bg-aged-paper animate-pulse h-72 relative">
      <div className="w-full h-full bg-warm-taupe" />
      <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
        <div className="h-4 w-16 bg-taupe-deep rounded-md" />
        <div className="h-6 w-3/4 bg-taupe-deep rounded-md" />
        <div className="h-3 w-1/2 bg-taupe-deep rounded-md" />
      </div>
    </div>
  );
};

/**
 * Gallery Grid Skeleton
 */
export const GalleryGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, idx) => (
        <GalleryCardSkeleton key={idx} />
      ))}
    </div>
  );
};
