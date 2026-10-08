import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useEffect, useRef, useState } from 'react';
import { createGoogleTripMap, loadGoogleTripMaps } from '@/lib/google-trip-map';

export default function TripMapCanvas({ configuration, stops, overview, selectedId, onSelect }) {
  useLocale();
  const element = useRef(null), adapter = useRef(null), select = useRef(onSelect);
  const [state, setState] = useState('loading');
  select.current = onSelect;
  useEffect(() => {
    let disposed = false;
    setState('loading');
    loadGoogleTripMaps(configuration?.browserKey).then(maps => {
      if (disposed) return;
      adapter.current = createGoogleTripMap(maps, element.current, stop => select.current(stop), () => { if (!disposed) setState('error'); });
      setState('ready');
    }).catch(() => { if (!disposed) setState('error'); });
    return () => { disposed = true; adapter.current?.destroy(); adapter.current = null; };
  }, [configuration]);
  useEffect(() => { if (state === 'ready') adapter.current?.update(stops, overview); }, [stops, overview, state]);
  useEffect(() => { if (state === 'ready') adapter.current?.select(selectedId); }, [selectedId, stops, state]);
  return <div className="trip-map-canvas-wrap" data-map-state={state}>
    <div ref={element} className="trip-map-canvas" role="region" aria-label={t("ui.interactive.itinerary.map.a884b2c")} hidden={state === 'error'}/>
    {state !== 'ready' && <p className="trip-map-canvas-message" role="status">{state === 'error' ? t("ui.map.preview.isn.t.available.for.this.part.of.the.trip.91b5ca6") : t("ui.loading.map.7c8befe")}</p>}
  </div>;
}
