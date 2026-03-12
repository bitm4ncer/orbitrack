// Central sample base URL resolution.
// In dev (no VITE_SAMPLE_CDN), samples are served locally by the Vite dev server.
// In prod, VITE_SAMPLE_CDN points to the Cloudflare R2 public bucket.

const cdnBase = import.meta.env.VITE_SAMPLE_CDN as string | undefined;

export const SAMPLE_BASE_URL: string = cdnBase
  ? cdnBase.replace(/\/$/, '') + '/'
  : window.location.origin + (import.meta.env.BASE_URL as string);
