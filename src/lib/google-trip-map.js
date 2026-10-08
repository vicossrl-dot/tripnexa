// Google-only provider boundary. No geocoding, routing, Places calls or itinerary writes.
import { groupMapStops } from './interactive-trip-map';
/** @type {Window & {google?: {maps: any}, gm_authFailure?: () => void, __tripNexaMapsReady?: () => void}} */
const providerWindow = window;
let loading;
export function loadGoogleTripMaps(browserKey) {
  if (providerWindow.google?.maps?.Map) return Promise.resolve(providerWindow.google.maps);
  if (!browserKey) return Promise.reject(new Error('Map preview is unavailable.'));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previousAuthFailure = providerWindow.gm_authFailure;
    const fail = () => { cleanup(); script.remove(); loading = null; reject(new Error('Map preview is unavailable.')); };
    const timer = window.setTimeout(fail, 15000);
    const cleanup = () => { clearTimeout(timer); delete providerWindow.__tripNexaMapsReady; providerWindow.gm_authFailure = previousAuthFailure; };
    providerWindow.gm_authFailure = fail;
    providerWindow.__tripNexaMapsReady = () => {
      if (!providerWindow.google?.maps?.Map) return fail();
      cleanup(); resolve(providerWindow.google.maps);
    };
    const query = new URLSearchParams({ key: browserKey, v: 'quarterly', loading: 'async', callback: '__tripNexaMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.async = true; script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

export function createGoogleTripMap(maps, element, onSelect, onFailure) {
  let overlays = [], disposed = false;
  const previousAuthFailure = providerWindow.gm_authFailure;
  providerWindow.gm_authFailure = onFailure;
  const map = new maps.Map(element, { zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    gestureHandling: 'cooperative', clickableIcons: false, keyboardShortcuts: true, scrollwheel: false });
  class StopMarker extends maps.OverlayView {
    constructor(group, overview, offset) {
      super(); this.group = group; this.stop = group[0]; this.offset = offset; this.overview = overview;
      const stop = this.stop;
      this.button = document.createElement('button'); this.button.type = 'button';
      this.button.className = `trip-map-marker day-color-${overview ? stop.dayIndex % 5 : 0}`;
      this.button.dataset.mapStop = stop.id;
      this.button.textContent = stop.kind === 'stay' ? 'H' : String(stop.number);
      this.button.setAttribute('aria-label', `Day ${stop.dayIndex + 1}, ${stop.kind === 'stay' ? 'stay' : 'stop ' + stop.number}: ${stop.name}`);
      this.button.title = this.button.getAttribute('aria-label');
      this.button.onclick = () => onSelect(this.group[this.selectedIndex == null ? 0 : (this.selectedIndex + 1) % this.group.length]);
      this.button.onkeydown = event => event.stopPropagation();
      this.setMap(map);
    }
    onAdd() { this.getPanes().overlayMouseTarget.append(this.button); maps.OverlayView.preventMapHitsAndGesturesFrom(this.button); }
    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(new maps.LatLng(this.stop.position));
      if (point) { this.button.style.left = `${point.x + this.offset}px`; this.button.style.top = `${point.y}px`; }
    }
    onRemove() { this.button.remove(); }
  }
  const resize = new ResizeObserver(() => { if (!disposed) maps.event.trigger(map, 'resize'); }); resize.observe(element);
  return {
    update(stops, overview) {
      overlays.forEach(marker => marker.setMap(null));
      const positions = new Map();
      overlays = groupMapStops(stops, overview).map(group => {
        const stop = group[0];
        const key = JSON.stringify(stop.position), count = positions.get(key) || 0; positions.set(key, count + 1);
        // Separate buttons at coincident stops; coordinates themselves never change.
        return new StopMarker(group, overview, count ? (count % 2 ? 1 : -1) * Math.ceil(count / 2) * 22 : 0);
      });
      if (overlays.length) {
        const bounds = new maps.LatLngBounds(); overlays.forEach(marker => bounds.extend(marker.stop.position));
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) { map.setCenter(overlays[0].stop.position); map.setZoom(15); }
        else { map.fitBounds(bounds, 44); maps.event.addListenerOnce(map, 'idle', () => { if (!disposed && map.getZoom() > 16) map.setZoom(16); }); }
      }
    },
    select(id) {
      overlays.forEach(marker => {
        const index = marker.group.findIndex(stop => stop.id === id), selected = index !== -1;
        marker.selectedIndex = selected ? index : null;
        const stop = selected ? marker.group[index] : marker.group[0];
        marker.button.setAttribute('aria-pressed', String(selected)); marker.button.style.zIndex = selected ? '10' : '1';
        marker.button.className = `trip-map-marker day-color-${marker.overview ? stop.dayIndex % 5 : 0}`;
        marker.button.textContent = `${stop.kind === 'stay' ? 'H' : stop.number}${marker.group.length > 1 ? '+' : ''}`;
        const label = `Day ${stop.dayIndex + 1}, ${stop.kind === 'stay' ? 'stay' : 'stop ' + stop.number}: ${stop.name}${stop.time ? ', ' + stop.time : ''}${marker.group.length > 1 ? `. ${marker.group.length} stops here; activate to cycle through them` : ''}`;
        marker.button.setAttribute('aria-label', label); marker.button.title = label;
      });
      const selected = overlays.find(marker => marker.group.some(stop => stop.id === id));
      if (selected && !map.getBounds()?.contains(selected.stop.position)) map.panTo(selected.stop.position);
    },
    destroy() {
      disposed = true; resize.disconnect(); overlays.forEach(marker => marker.setMap(null));
      maps.event.clearInstanceListeners(map); element.replaceChildren(); providerWindow.gm_authFailure = previousAuthFailure;
    },
  };
}
