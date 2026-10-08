/// <reference types="vite/client" />
// Public media only. Private storage credentials never belong in Vite variables.
const value = import.meta.env.VITE_INTRO_VIDEO_URL || 'https://fast-imgs.b-cdn.net/tripnexa.mp4';
export const INTRO_VIDEO_URL = (() => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
})();
