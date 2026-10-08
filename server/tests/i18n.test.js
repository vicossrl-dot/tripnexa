import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolveLocale, normalizeLocale, selectLocale, applyUserLocale, getLocale, acknowledgeLocale, t, translateText, formatDate, formatNumber, formatCurrency } from '../../src/i18n/runtime.js';
import { validateData, serialize } from '../schema.js';

test('six i18n catalogs have all keys and matching interpolation parameters', () => {
  assert.match(execFileSync(process.execPath, ['scripts/check-i18n.mjs'], { encoding: 'utf8' }), /parity passed/);
});
test('locale precedence, regional browser languages and English fallback', () => {
  const preferences = { explicit: 'fr', authenticated: 'de', local: 'ro', browser: ['ru-RU'] };
  assert.equal(resolveLocale(preferences), 'fr');
  delete preferences.explicit; assert.equal(resolveLocale(preferences), 'de');
  delete preferences.authenticated; assert.equal(resolveLocale(preferences), 'ro');
  delete preferences.local; assert.equal(resolveLocale(preferences), 'ru');
  assert.equal(resolveLocale({ browser: ['it-IT', 'es-MX'] }), 'es');
  assert.equal(resolveLocale({ browser: ['it-IT'] }), 'en');
  assert.equal(normalizeLocale('RO-ro'), 'ro');
  assert.equal(normalizeLocale('__proto__'), null);
});
test('immediate choice survives stale authenticated preference and interpolation preserves user values', () => {
  selectLocale('fr'); applyUserLocale('ro'); assert.equal(getLocale(), 'fr');
  const name = '<a>My private trip</a>';
  assert(t('ui.value.back.to.trips.faa1810', { v0: name }).includes(name));
  assert.equal(translateText('Unique private trip content 789'), 'Unique private trip content 789');
  acknowledgeLocale('fr'); applyUserLocale('de'); assert.equal(getLocale(), 'de');
  assert.equal(formatNumber(1234.5), new Intl.NumberFormat('de').format(1234.5));
  assert.equal(formatCurrency(1234.5, 'eur'), new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(1234.5));
  assert.equal(formatDate('2026-10-08', { month: 'long' }), 'Oktober');
  assert.equal(formatDate('invalid'), '—');
  selectLocale('ru');
  assert.equal(t('counts.updates', { count: 1 }), 'Сегодня доступно 1 обновление');
  assert.equal(t('counts.updates', { count: 2 }), 'Сегодня доступно 2 обновления');
  assert.equal(t('counts.updates', { count: 5 }), 'Сегодня доступно 5 обновлений');
  globalThis.location = { pathname: '/ADMIN/audit' };
  assert.equal(getLocale(), 'en');
  assert.equal(translateText('Select language'), 'Select language');
  delete globalThis.location;
  acknowledgeLocale('ru');
  selectLocale('en'); acknowledgeLocale('en');
});
test('user locale is a nullable, allowlisted preference and not a security field', () => {
  for (const ui_locale of ['en', 'ro', 'ru', 'de', 'fr', 'es']) assert.equal(validateData('User', { ui_locale }, true).ui_locale, ui_locale);
  assert.equal(validateData('User', { ui_locale: null }, true).ui_locale, null);
  assert.throws(() => validateData('User', { ui_locale: 'it' }, true));
  assert.throws(() => validateData('User', { ui_locale: 'ro', role: 'SUPER_ADMIN' }, true));
  const publicUser = serialize('User', { id: 'user', email: 'test@example.test', ui_locale: 'ro', password_hash: 'secret', totp_secret: 'secret' });
  assert.equal(publicUser.ui_locale, 'ro');
  assert.equal(publicUser.password_hash, undefined);
  assert.equal(publicUser.totp_secret, undefined);
});
