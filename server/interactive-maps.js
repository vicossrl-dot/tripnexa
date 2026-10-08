import { pool } from './db.js';
import { owned } from './entities.js';
import { requireFeature } from './billing/entitlements.js';
import { readSettings } from './admin/settings.js';

export async function interactiveMapConfiguration(userId, tripId) {
  // Ownership is required even when the existing billing kill switch is off.
  await owned(pool, 'Trip', tripId, userId);
  await requireFeature(userId, 'interactive_trip_maps', tripId);
  // This is an explicitly public, referrer-restricted browser credential. Never
  // fall back to config.googleMapsKey, which belongs exclusively to the server.
  const settings = await readSettings();
  const browserKey = settings.settings.google_enabled ? process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || '' : '';
  return { provider: 'google', configured: Boolean(browserKey), browserKey };
}
