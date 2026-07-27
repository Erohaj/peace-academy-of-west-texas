import { IMAGES } from '../../data/mockData';

/**
 * Resolves the two image sources a content row can have.
 *
 * Photos bundled into the app live in src/assets/*.webp and get content-hashed
 * filenames at build time, so the database cannot store their URLs — it stores
 * an `image_key` that indexes the IMAGES registry. Photos an admin uploads go
 * to Supabase Storage and carry an absolute `image_url`.
 *
 * `image_url` wins when both are present, so replacing a seeded photo through
 * the admin panel does not require clearing the key first.
 */
export function resolveImage(imageKey: string | null, imageUrl: string | null): string {
  if (imageUrl) return imageUrl;
  if (imageKey && imageKey in IMAGES) return IMAGES[imageKey as keyof typeof IMAGES];
  // An admin can save an event before attaching a photo. A generic community
  // shot degrades better than an empty src, which renders a broken-image icon.
  return IMAGES.communitySign;
}
