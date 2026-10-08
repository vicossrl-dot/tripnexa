import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '../website/node_modules/@playwright/test/index.mjs';
import { mapFixture } from '../server/tests/interactive-maps-fixture.mjs';
import { installMapProviderFixture } from './interactive-map-provider-fixture.mjs';

const output = path.resolve('.local/interactive-maps/browser'); await mkdir(output, { recursive: true });
const fixture = await mapFixture(), browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { date: new Date().toISOString(), browser: browser.version(), provider: 'Controlled SDK fixture; no live tiles or Google API calls', checks: [], failures: [], errors: [], screenshots: [] };
const check = async (name, fn) => { try { await fn(); report.checks.push(name); console.log('PASS', name); } catch (error) { report.failures.push({ name, error: error.stack }); console.error('FAIL', name, error.message); } };
const route = `/trip/${fixture.paid.trip.id}/itinerary`;
let windowStarted = Date.now(), sessionsInWindow = 0;
async function session(user, width, provider = 'fixture') {
  if (sessionsInWindow === 3) {
    let remaining = Math.max(0, 62000 - (Date.now() - windowStarted));
    if (remaining) console.log('Pacing navigation to preserve the existing API rate limit.');
    while (remaining > 0) { const pause = Math.min(55000, remaining); await new Promise(resolve => setTimeout(resolve, pause)); remaining -= pause; }
    sessionsInWindow = 0; windowStarted = Date.now();
  }
  sessionsInWindow++;
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, reducedMotion: 'reduce', timezoneId: width === 360 ? 'Pacific/Kiritimati' : width === 375 ? 'Pacific/Honolulu' : 'Europe/Bucharest' });
  const [name, ...value] = user.cookie.split('='); await context.addCookies([{ name, value: value.join('='), url: fixture.origin }]);
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  page.setDefaultTimeout(12000);
  let loads = 0, configurationRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/interactive-map')) configurationRequests++; });
  await page.route('https://maps.googleapis.com/maps/api/js?*', async request => {
    loads++;
    if (provider === 'error') return request.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.gm_authFailure();' });
    await request.fulfill({ status: 200, contentType: 'application/javascript', body: `(${installMapProviderFixture.toString()})();` });
  });
  await page.goto(fixture.origin + `/trip/${user.trip.id}/itinerary`); await expect(page.locator('[data-itinerary-day]').first()).toBeVisible();
  return { context, page, loads: () => loads, configurationRequests: () => configurationRequests };
}
async function shot(page, name) { await page.screenshot({ path: path.join(output, `${name}.png`) }); report.screenshots.push(`${name}.png`); }
try {
  for (const width of [1920, 1440, 1280, 1024, 768, 430, 390, 375, 360]) {
    const { context, page, loads, configurationRequests } = await session(fixture.paid, width);
    try {
      await check(`${width}: initial itinerary has no map SDK or configuration request`, async () => {
        assert.equal(loads(), 0); assert.equal(configurationRequests(), 0); assert.equal(await page.locator('.trip-map-canvas').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if (width >= 1024) assert.equal(await page.locator('.trip-itinerary-rail').evaluate(element => getComputedStyle(element).position), 'sticky');
      });
      const links = await page.locator('.trip-timeline a[href*="google.com/maps/dir/"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
      if (width >= 1024) {
        await check(`${width}: right rail opens one sticky Day Map`, async () => {
          await page.getByRole('button', { name: 'Open Day Map', exact: true }).click();
          await expect(page.locator('[data-map-state=ready]')).toBeVisible();
          await page.locator('[data-itinerary-day]').first().evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + scrollY + 500));
          await expect.poll(() => page.locator('.trip-day-map-rail').evaluate(element => Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).top)))).toBeLessThan(3);
          assert.equal(await page.evaluate(() => window.__mapFixture.active), 1);
          const rail = await page.locator('.trip-day-map-rail').boundingBox(), timeline = await page.locator('.trip-timeline').first().boundingBox(); assert(rail.x >= timeline.x + timeline.width);
          await shot(page, `${width}-desktop-day-map`);
        });
        await check(`${width}: marker and timeline keyboard selection synchronize`, async () => {
          const marker = page.locator('.trip-map-marker[aria-label*="Museum"]').first(); await marker.click();
          await expect(page.locator('.trip-timeline-item[data-map-selected=true]')).toHaveCount(1);
          const target = page.locator('.trip-timeline-item[tabindex="0"][data-itinerary-type="visit"]').nth(1); await target.focus();
          const id = await target.getAttribute('id'); await expect(page.locator(`[data-map-stop="${id.replace('map-itinerary-', '')}"]`)).toHaveAttribute('aria-pressed', 'true');
        });
        await check(`${width}: scroll switches to day 2 without changing the selected day tabs`, async () => {
          await page.locator('[data-itinerary-day="2026-10-02"]').evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top - document.querySelector('.trip-navigation').getBoundingClientRect().height - 25));
          await expect(page.locator('.trip-day-map-rail')).toHaveAttribute('data-map-day', '2026-10-02');
          await expect(page.locator('nav[aria-label="Itinerary days"] button').first()).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('.trip-day-map-rail .trip-map-marker')).toHaveCount(1);
        });
      } else {
        await check(`${width}: mobile/tablet Day Map opens and restores exact scroll position`, async () => {
          await expect(page.locator('.trip-day-map-rail')).toBeHidden();
          const action = page.locator('[data-itinerary-day="2026-10-02"] .trip-day-map-action'); await action.scrollIntoViewIfNeeded();
          const before = await page.evaluate(() => scrollY); await action.click();
          await expect(page.locator('[role=dialog] [data-map-state=ready]')).toBeVisible();
          await expect(page.getByRole('dialog').getByText('Friday 2 October', { exact: true })).toBeVisible();
          await expect(page.locator('[role=dialog] .trip-map-marker')).toHaveCount(1);
          await page.locator('.trip-map-marker').focus(); await page.keyboard.press('Enter');
          await expect(page.locator('.trip-map-stop[aria-pressed=true]')).toHaveCount(1);
          await shot(page, `${width}-mobile-day-map`);
          await page.getByRole('button', { name: 'Close', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect.poll(() => page.evaluate(() => scrollY)).toBe(before); await expect(action).toBeFocused();
        });
      }
      await check(`${width}: Trip Map All/Day filters, missing coordinates and long lists`, async () => {
        await page.getByRole('button', { name: 'Trip Map', exact: true }).click();
        await expect(page.locator('[role=dialog] [data-map-state=ready]')).toBeVisible();
        await expect(page.locator('[role=dialog] .trip-map-day-group')).toHaveCount(12);
        await expect(page.locator('[role=dialog] .trip-map-segment')).toHaveCount(0);
        const box = await page.getByRole('dialog').boundingBox();
        assert(width < 768 ? Math.abs(box.width - width) < 2 && Math.abs(box.x) < 2 : box.width > Math.min(width - 100, 900));
        const grouped = page.locator('.trip-map-marker[aria-label*="cycle"]').first();
        await grouped.focus(); await page.keyboard.press('Enter'); const selected = await grouped.getAttribute('aria-label');
        await page.keyboard.press('Enter'); await expect(grouped).not.toHaveAttribute('aria-label', selected);
        if (width === 1440 || width === 390) await shot(page, `${width}-trip-map-all`);
        assert.equal(await page.evaluate(() => window.__mapFixture.active), 1);
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Day 1', exact: true }).click(); await expect(dialog.locator('.trip-map-segment')).toHaveCount(3);
        if (width === 1440 || width === 390) {
          await page.addScriptTag({ path: path.resolve('website/node_modules/axe-core/axe.min.js') });
          const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('.trip-map-dialog'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations);
          assert.deepEqual(violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => node.target) })), []);
        }
        await shot(page, `${width}-trip-map`);
        await dialog.getByRole('button', { name: 'Day 3', exact: true }).click(); await expect(dialog.getByText("Map preview isn't available for this part of the trip.")).toBeVisible();
        await expect(dialog.locator('.trip-map-stop')).toHaveCount(3);
        await dialog.getByRole('button', { name: 'Day 4', exact: true }).click(); await expect(dialog.locator('.trip-map-marker')).toHaveCount(18);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await dialog.getByRole('button', { name: 'Day 12', exact: true }).click(); await expect(dialog.locator('.trip-map-marker')).toHaveCount(3);
        await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
      });
      await check(`${width}: existing free Google route URLs and timeline are unchanged`, async () => {
        assert.deepEqual(await page.locator('.trip-timeline a[href*="google.com/maps/dir/"]').evaluateAll(elements => elements.map(element => element.getAttribute('href'))), links);
        assert.equal(await page.locator('[data-itinerary-day]').count(), 12);
      });
    } finally { await context.close(); }
  }
  for (const width of [1440, 390]) {
    const { context, page, loads } = await session(fixture.free, width);
    try {
      await check(`${width}: Free locked state opens the existing upgrade flow without loading Google`, async () => {
        await page.getByRole('button', { name: 'Trip Map', exact: true }).click(); await expect(page.locator('[data-map-locked]')).toBeVisible();
        assert.equal(loads(), 0); await shot(page, `${width}-free-locked`);
        await page.getByRole('button', { name: 'Upgrade to unlock', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Get more from your trip' })).toBeVisible();
        await page.getByRole('button', { name: 'Continue with my current plan' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
        assert((await page.locator('.trip-timeline a[href*="google.com/maps/dir/"]').count()) > 0);
      });
    } finally { await context.close(); }
  }
  const single = await session(fixture.paidSingle, 390);
  try {
    await check('One-day premium trip uses the same map and restores its short-page scroll', async () => {
      const action = single.page.locator('.trip-day-map-action'); await action.scrollIntoViewIfNeeded();
      const before = await single.page.evaluate(() => scrollY); await action.click();
      await expect(single.page.locator('[role=dialog] [data-map-state=ready]')).toBeVisible();
      await single.page.keyboard.press('Escape'); await expect(single.page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => single.page.evaluate(() => scrollY)).toBe(before);
    });
  } finally { await single.context.close(); }
  const broken = await session(fixture.paid, 390, 'error');
  try {
    await check('Provider authentication failure leaves the itinerary and route links usable', async () => {
      await broken.page.locator('.trip-day-map-action').first().click();
      await expect(broken.page.locator('[data-map-state=error]')).toBeVisible();
      await expect(broken.page.getByText("Map preview isn't available for this part of the trip.")).toBeVisible();
      await shot(broken.page, '390-provider-error');
      await broken.page.keyboard.press('Escape'); await expect(broken.page.getByRole('dialog')).toHaveCount(0);
      assert((await broken.page.locator('.trip-timeline a[href*="google.com/maps/dir/"]').count()) > 0);
    });
  } finally { await broken.context.close(); }
} finally {
  await browser.close(); await fixture.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failures: report.failures.length, errors: report.errors.length }));
  if (report.failures.length || report.errors.length) process.exitCode = 1;
}
