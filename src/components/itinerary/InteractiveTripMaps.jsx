import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Component, createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, LockKeyhole, Expand, Footprints, Bus, Car, Route } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/api/client';
import { friendlyDate } from '@/lib/trip-presentation';
import { buildMapsLink } from '@/lib/planningEngine';
import { buildTripMap, mapItemElementId, visibleMapDay, MAP_MODE_LABELS } from '@/lib/interactive-trip-map';
import '@/styles/interactive-trip-maps.css';

const Canvas = lazy(() => import('./TripMapCanvas'));
const Context = createContext(null);
export const useTripMaps = () => useContext(Context);
class MapBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="trip-map-fallback" role="status">{t("ui.map.preview.isn.t.available.for.this.part.of.the.trip.91b5ca6")}</p> : this.props.children; }
}

export function InteractiveTripMaps({ trip, items, dates, day, stays, selections, children }) {
  useLocale();
  const [access, setAccess] = useState(null), [accessError, setAccessError] = useState(false), [configuration, setConfiguration] = useState(null);
  const [activeDate, setActiveDate] = useState(dates[0]), [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null), [railOpen, setRailOpen] = useState(false), [desktop, setDesktop] = useState(false);
  const restore = useRef(null);
  const days = useMemo(() => buildTripMap({ trip, items, dates, stays, selections }), [trip, items, dates, stays, selections]);
  useEffect(() => {
    const query = matchMedia('(min-width: 1024px)'); const update = () => setDesktop(query.matches);
    update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const navigation = document.querySelector('.trip-navigation');
    if (!navigation) return;
    const update = () => document.documentElement.style.setProperty('--trip-map-top', `${Math.ceil(navigation.getBoundingClientRect().height) + 16}px`);
    const observer = new ResizeObserver(update); observer.observe(navigation); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--trip-map-top'); };
  }, []);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setAccess(null); setAccessError(false); setConfiguration(null);
    const load = () => api.billing(`/trips/${encodeURIComponent(trip.id)}`).then(value => { if (active) { setAccess(value); setAccessError(false); } }).catch(() => { if (active) setAccessError(true); });
    void load(); window.addEventListener('billing-unlocked', load);
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('billing-unlocked', load); window.removeEventListener('focus', load); };
  }, [trip.id, attempt]);
  const opened = Boolean(modal || desktop && railOpen);
  useEffect(() => {
    if (!opened || !access?.premium || configuration) return;
    let active = true;
    api.interactiveMap(trip.id).then(value => { if (active) setConfiguration(value); }).catch(error => {
      if (!active) return;
      if (error.status === 402) setAccess({ premium: false });
      else setConfiguration({ configured: false });
    });
    return () => { active = false; };
  }, [opened, access, configuration, trip.id]);
  useEffect(() => {
    if (dates.includes(day)) { setActiveDate(day); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const navHeight = document.querySelector('.trip-navigation')?.getBoundingClientRect().height || 140;
      const sections = Array.from(document.querySelectorAll('[data-itinerary-day]')).map(element => ({ date: element.getAttribute('data-itinerary-day'), top: element.getBoundingClientRect().top }));
      setActiveDate(visibleMapDay(sections, navHeight + 70, dates[0]));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new IntersectionObserver(schedule, { threshold: [0, 0.1, 0.5, 1] });
    document.querySelectorAll('[data-itinerary-day]').forEach(element => observer.observe(element));
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule); update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [day, dates]);
  const upgrade = () => window.dispatchEvent(new CustomEvent('billing-required', { detail: { code: 'PREMIUM_FEATURE_REQUIRED', feature: 'interactive_trip_maps', tripId: trip.id, allowTripPack: true, error: 'Interactive Trip Maps are available with Pro or a premium trip credit.' } }));
  const open = date => {
    restore.current = { x: window.scrollX, y: window.scrollY, element: document.activeElement };
    setModal({ type: date ? 'day' : 'trip', date: date || 'all' });
  };
  const close = () => setModal(null);
  const selectStop = (stop, scroll = false) => {
    setSelectedId(stop.id);
    if (scroll && !modal) {
      const element = document.getElementById(mapItemElementId(stop.itemId));
      element?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      element?.focus({ preventScroll: true });
    }
  };
  const selectItem = id => {
    if (!access?.premium || !opened) return;
    const stop = days.flatMap(value => value.stops).find(value => value.itemId === id);
    if (stop) setSelectedId(current => days.some(value => value.stops.some(value => value.id === current && value.itemId === id)) ? current : stop.id);
  };
  const selectedItem = days.flatMap(value => value.stops).find(stop => stop.id === selectedId)?.itemId;
  const context = { access, accessError, retry: () => setAttempt(value => value + 1), configuration, days, activeDate, selectedId, selectedItem,
    modal, railOpen, desktop, open, close, upgrade, selectStop, selectItem, setRailOpen };
  return <Context.Provider value={context}>{children}
    <Dialog open={Boolean(modal)} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="trip-modal trip-map-dialog" onCloseAutoFocus={event => {
        event.preventDefault(); const previous = restore.current;
        requestAnimationFrame(() => { previous?.element?.focus({ preventScroll: true }); if (previous) window.scrollTo({ left: previous.x, top: previous.y, behavior: 'instant' }); });
      }}>
        <header><DialogTitle>{modal?.type === 'trip' ? t("ui.trip.map.1a8035e") : t("ui.day.map.64785c9")}</DialogTitle><DialogDescription>{modal?.type === 'trip' ? trip.name : friendlyDate(modal?.date, { weekday: 'long', month: 'long' })}</DialogDescription></header>
        {modal?.type === 'trip' && <nav className="trip-map-day-tabs" aria-label={t("ui.map.days.24c2e42")}>{["all", ...dates].map((date, index) => <button key={date} className="trip-button secondary" aria-pressed={modal.date === date} onClick={() => setModal({ type: 'trip', date })}>{date === 'all' ? t("ui.all.a52ace4") : t("ui.day.value.1ede734", {v0: index})}</button>)}</nav>}
        {modal && <MapContents date={modal.date} expanded/>}
      </DialogContent>
    </Dialog>
  </Context.Provider>;
}

export function TripMapAction({ date = null }) {
  useLocale();
  const maps = useTripMaps();
  if (!maps) return null;
  return <button className={`trip-button secondary ${date ? 'trip-day-map-action' : 'trip-map-action'}`} onClick={() => maps.open(date)}><MapIcon size={16} aria-hidden="true"/>{date ? t("ui.map.be176b0") : t("ui.trip.map.1a8035e")}</button>;
}

export function DayMapRail() {
  useLocale();
  const maps = useTripMaps(), anchor = useRef(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting));
    if (anchor.current) observer.observe(anchor.current); return () => observer.disconnect();
  }, []);
  if (!maps) return null;
  return <section ref={anchor} className="trip-card trip-day-map-rail" aria-label={t("ui.contextual.day.map.a902c2d")} data-map-day={maps.activeDate} data-map-open={maps.railOpen || undefined}>
    <p className="trip-eyebrow">{t("ui.day.map.64785c9")}</p><h3>{friendlyDate(maps.activeDate, { weekday: 'long', month: 'long' })}</h3>
    {!maps.railOpen ? <><p className="trip-muted">{t("ui.your.daily.stops.in.itinerary.order.77676b5")}</p><button className="trip-button secondary" onClick={() => maps.setRailOpen(true)}><MapIcon size={16} aria-hidden="true"/>{t("ui.open.day.map.de24b87")}</button></> : <>
      {maps.desktop && visible && !maps.modal && <MapContents date={maps.activeDate}/>}
      <div className="trip-map-rail-actions"><button className="trip-link" onClick={() => maps.open(maps.activeDate)}><Expand size={14} aria-hidden="true"/>{t("ui.expand.07548c2")}</button><button className="trip-link" onClick={() => maps.setRailOpen(false)}>{t("ui.close.map.ce8fdb9")}</button></div>
    </>}
  </section>;
}

function MapContents({ date, expanded = false }) {
  useLocale();
  const maps = useTripMaps(), overview = date === 'all';
  const detail = useRef(null);
  const shown = useMemo(() => overview ? maps.days : maps.days.filter(day => day.date === date), [maps.days, date, overview]);
  const stops = useMemo(() => shown.flatMap(day => day.stops), [shown]);
  useEffect(() => {
    const list = detail.current, selected = list?.querySelector('[aria-pressed=true]');
    if (selected) {
      const itemBox = selected.getBoundingClientRect(), listBox = list.getBoundingClientRect();
      if (itemBox.top < listBox.top || itemBox.bottom > listBox.bottom) list.scrollTop += itemBox.top - listBox.top - 8;
    }
  }, [maps.selectedId]);
  if (maps.accessError) return <div className="trip-map-fallback"><p>{t("ui.map.access.could.not.be.checked.f34b842")}</p><button className="trip-button secondary" onClick={maps.retry}>{t("ui.retry.942087c")}</button></div>;
  if (!maps.access) return <p role="status">{t("ui.checking.map.access.b2edca3")}</p>;
  if (!maps.access.premium) return <div className="trip-map-locked" data-map-locked><LockKeyhole size={24} aria-hidden="true"/><h3>{t("ui.interactive.trip.maps.9e40387")}</h3><p>{t("ui.see.your.daily.stops.and.travel.flow.together.ae22f24")}</p><button className="trip-button primary" onClick={() => { maps.close(); maps.upgrade(); }}>{t("ui.upgrade.to.unlock.da5e516")}</button></div>;
  const points = stops.filter(stop => stop.position);
  return <div className={`trip-map-content ${expanded ? 'expanded' : ''}`} data-map-unlocked>
    {points.length && maps.configuration?.configured ? <MapBoundary><Suspense fallback={<p className="trip-map-fallback" role="status">{t("ui.loading.map.7c8befe")}</p>}><Canvas configuration={maps.configuration} stops={stops} overview={overview} selectedId={maps.selectedId} onSelect={stop => maps.selectStop(stop, !expanded)}/></Suspense></MapBoundary> : <p className="trip-map-fallback" role="status">{!maps.configuration && points.length ? t("ui.loading.map.7c8befe") : t("ui.map.preview.isn.t.available.for.this.part.of.the.trip.91b5ca6")}</p>}
    <div className="trip-map-detail" ref={detail}>
      <p className="trip-map-note">{overview ? t("ui.grouped.by.day.select.a.day.for.its.stops.and.transfers.a.marker.dff86bc") : t("ui.stops.follow.your.saved.itinerary.open.transfer.links.for.live.ro.515d5cb")}</p>
      {stops.some(stop => !stop.position) && <p className="trip-map-note">{stops.filter(stop => !stop.position).length} {stops.filter(stop => !stop.position).length === 1 ? t("ui.stop.has.30267fd") : t("ui.stops.have.9d862bc")}{" "}{t("ui.no.saved.coordinates.b299de7")}</p>}
      {!stops.length && <p className="trip-map-note">{t("ui.no.mapped.stops.for.this.day.26bb27c")}</p>}
      {shown.map(day => <section key={day.date} className="trip-map-day-group">
        {overview && <h3 className={`trip-map-group-title day-color-${day.dayIndex % 5}`}>{t('pdf.day')} {day.dayIndex + 1} · {friendlyDate(day.date)}</h3>}
        <p className="trip-map-summary">{t('qa.map.summary',{visits:day.visits,transfers:day.segments.length,minutes:day.travelMinutes})}</p>
        <ol className="trip-map-stops">{day.entries.filter(entry => !overview || entry.type === 'stop').map(entry => entry.type === 'stop' ? <li key={entry.id}>
          <button className="trip-map-stop" aria-pressed={maps.selectedId === entry.id} onClick={() => maps.selectStop(entry, !expanded)}>
            <span className={`trip-map-stop-number day-color-${overview ? day.dayIndex % 5 : 0}`} aria-hidden="true">{entry.kind === 'stay' ? t("ui.h.44bd7ae") : entry.number}</span>
            <span><strong>{entry.name}</strong><small>{entry.time}{!entry.position && t("ui.location.unavailable.9952b79")}{maps.selectedId === entry.id && t("ui.selected.52b6fa4")}</small></span>
          </button>
        </li> : <li key={entry.id} className="trip-map-segment">{(() => { const Icon = { walk: Footprints, transit: Bus, taxi: Car, car: Car }[entry.mode] || Route; const url = buildMapsLink({ origin: entry.origin, destination: entry.destination, mode: entry.mode }); return <><Icon size={14} aria-hidden="true"/><span>{translateText(MAP_MODE_LABELS[entry.mode]) || t("ui.transfer.dde8bef")}{entry.duration != null && <> · {entry.duration} {t('ui.min.1f6fa6f')}</>}{url && <a href={url} target="_blank" rel="noopener noreferrer">{t('qa.map.route')}<span className="sr-only">: {t('qa.map.endpoints',{origin:entry.origin,destination:entry.destination})}</span></a>}</span></>; })()}</li>)}</ol>
      </section>)}
    </div>
  </div>;
}
