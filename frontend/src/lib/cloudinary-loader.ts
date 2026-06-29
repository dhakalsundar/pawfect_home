'use client';

import type { ImageLoaderProps } from 'next/image';

/**
 * Rewrites a Cloudinary delivery URL to request the right size and format.
 *
 * `f_auto` serves AVIF/WebP to browsers that accept them, `q_auto` picks a quality that suits the
 * image content, and `w_` matches the rendered size — so a 4000px photo is not shipped to a 320px
 * card. Non-Cloudinary URLs pass through untouched, which matters because pet photos are still
 * plain URLs wherever Cloudinary is not configured.
 */
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.includes('res.cloudinary.com') || !src.includes('/upload/')) {
    return src;
  }

  const transformations = [`f_auto`, `q_${quality ?? 'auto'}`, `w_${width}`, 'c_limit'].join(',');

  // Insert the transformation segment directly after `/upload/`.
  return src.replace('/upload/', `/upload/${transformations}/`);
}

/** A tiny, heavily blurred variant, used as the `blurDataURL` placeholder. */
export function cloudinaryBlurUrl(src: string): string | undefined {
  if (!src.includes('res.cloudinary.com') || !src.includes('/upload/')) return undefined;
  return src.replace('/upload/', '/upload/w_24,q_10,e_blur:400,f_auto/');
}
