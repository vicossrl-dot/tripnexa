// A read-only projection of the displayed itinerary. Never sort, geocode or schedule here.
export function mapCoordinates(value) {
  if (!value || !['lat', 'lng'].every(key => typeof value[key] === 'number' || typeof value[key] === 'string' && value[key].trim() !== '')) return null;
  const lat = Number(value.lat), lng = Number(value.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const aliases = value => [value.address, value.location, value.name, value.title].filter(Boolean).map(normalize);
const choice = item => { try { return JSON.parse(item.meal_choice || 'null'); } catch { return null; } };
export const MAP_MODE_LABELS = { walk: 'Walk', transit: 'Public transit', taxi: 'Taxi', car: 'Car' };
export const mapItemElementId = id => `map-itinerary-${id}`;

export function groupMapStops(stops, overview) {
  const groups = new Map();
  for (const stop of stops.filter(stop => stop.position)) {
    const key = overview ? JSON.stringify(stop.position) : stop.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(stop);
  }
  return [...groups.values()];
}

export function buildTripMap({ trip, items, dates, stays = [], selections = [] }) {
  return dates.map((date, dayIndex) => {
    const daily = items.filter(item => item.date === date), stops = [], segments = [], entries = [];
    const known = [
      ...daily.filter(item => !['transport', 'transfer', 'meal'].includes(item.step_type)).map(item => ({ ...item, name: item.title })),
      ...selections,
      ...stays.filter(stay => stay.category === 'stay' && (!stay.date || stay.date <= date) && (!stay.end_date || stay.end_date >= date)).map(stay => ({ ...stay, kind: 'stay' })),
      ...['arrival', 'departure'].map(direction => ({ name: trip[`${direction}_location`], address: trip[`${direction}_address`], lat: trip[`${direction}_lat`], lng: trip[`${direction}_lng`] })),
    ];
    const resolve = name => {
      if (!normalize(name)) return null;
      const matches = known.filter(place => aliases(place).includes(normalize(name)) && mapCoordinates(place));
      // An ambiguous address must not silently select a different place.
      const points = new Set(matches.map(place => JSON.stringify(mapCoordinates(place))));
      return points.size === 1 ? matches.find(place => place.kind === 'stay') || matches[0] : null;
    };
    let number = 0;
    const add = (item, suffix, name, source, address = '', time = item.start_time) => {
      const kind = source?.kind === 'stay' ? 'stay' : item.step_type === 'meal' ? 'meal' : suffix ? 'endpoint' : item.step_type;
      const stop = { id: `${item.id}${suffix}`, itemId: item.id, date, dayIndex, name: name || 'Location to confirm', address, time,
        kind, number: kind === 'stay' ? null : ++number, position: mapCoordinates(source) };
      stops.push(stop); entries.push({ type: 'stop', ...stop }); return stop;
    };
    const same = (stop, name) => stop && [stop.name, stop.address].some(value => normalize(value) && normalize(value) === normalize(name));
    const isStop = item => ['visit', 'arrival', 'departure', 'activity'].includes(item.step_type) || item.step_type === 'meal' && (choice(item) || mapCoordinates(item));
    for (let index = 0; index < daily.length; index++) {
      const item = daily[index];
      if (['transport', 'transfer'].includes(item.step_type)) {
        const origin = resolve(item.route_origin), destination = resolve(item.route_destination);
        if (item.route_origin && !same(stops.at(-1), item.route_origin)) add(item, '-origin', origin?.title || origin?.name || item.route_origin, origin, item.route_origin);
        const segment = { id: item.id, itemId: item.id, date, origin: item.route_origin || '', destination: item.route_destination || '',
          mode: item.route_mode || '', duration: item.route_duration_min ?? item.duration_min ?? null, time: item.start_time };
        segments.push(segment); entries.push({ type: 'segment', ...segment });
        const next = daily.slice(index + 1).find(candidate => isStop(candidate) || ['transport', 'transfer'].includes(candidate.step_type));
        const nextNames = next && !['transport', 'transfer'].includes(next.step_type) ? aliases(choice(next) || next) : [];
        if (item.route_destination && !nextNames.includes(normalize(item.route_destination))) add(item, '-destination', destination?.title || destination?.name || item.route_destination, destination, item.route_destination, item.end_time);
      } else if (isStop(item)) {
        const restaurant = item.step_type === 'meal' ? choice(item) : null;
        const selection = selections.find(place => place.id === item.selection_id && (!item.place_id || place.place_id === item.place_id) && (!item.address || normalize(place.address) === normalize(item.address)));
        const source = restaurant || (mapCoordinates(item) ? item : mapCoordinates(selection) ? selection : resolve(item.address || item.location));
        add(item, '', restaurant?.name || item.title, source, restaurant?.address || item.address || item.location || '');
      }
    }
    return { date, dayIndex, stops, segments, entries, missing: stops.filter(stop => !stop.position).length,
      visits: daily.filter(item => item.step_type === 'visit').length,
      travelMinutes: segments.reduce((sum, segment) => sum + (Number(segment.duration) || 0), 0) };
  });
}

// Keep the previous day until the next header passes a small, stable reading line.
export function visibleMapDay(sections, threshold, fallback) {
  let active = sections[0]?.date || fallback;
  for (const section of sections) { if (section.top <= threshold) active = section.date; else break; }
  return active;
}
