// Browser-only SDK contract fixture. Never imported by application/runtime code.
// Deliberately labels its neutral grid: screenshots are not live Google tiles.
export function installMapProviderFixture() {
  const instances = []; window.__mapFixture = { instances, created: 0, active: 0 };
  class LatLng {
    constructor(value, lng) { this.lat = typeof value === 'object' ? value.lat : value; this.lng = typeof value === 'object' ? value.lng : lng; }
    equals(other) { return this.lat === other.lat && this.lng === other.lng; }
  }
  class LatLngBounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(point); return this; }
    getNorthEast() { return new LatLng({ lat: Math.max(...this.points.map(p => p.lat)), lng: Math.max(...this.points.map(p => p.lng)) }); }
    getSouthWest() { return new LatLng({ lat: Math.min(...this.points.map(p => p.lat)), lng: Math.min(...this.points.map(p => p.lng)) }); }
    contains() { return true; }
  }
  class Map {
    constructor(element) {
      this.element = element; this.markers = []; this.zoom = 13; instances.push(this); window.__mapFixture.created++; window.__mapFixture.active++;
      element.style.cssText = 'position:relative;height:100%;background-color:#f0eee7;background-image:linear-gradient(#d8dbd280 1px,transparent 1px),linear-gradient(90deg,#d8dbd280 1px,transparent 1px);background-size:32px 32px';
      const note = document.createElement('div'); note.textContent = 'Map provider fixture · no live tiles'; note.style.cssText = 'position:absolute;bottom:5px;left:5px;font:10px sans-serif;color:#586153;background:white;padding:3px;z-index:15'; element.append(note);
    }
    setZoom(value) { this.zoom = value; }
    getZoom() { return this.zoom; }
    setCenter(value) { this.center = value; this.draw(); }
    fitBounds(value) { this.bounds = value; this.draw(); }
    getBounds() { return this.bounds; }
    panTo() {}
    draw() { this.markers.forEach(marker => marker.draw()); }
  }
  class OverlayView {
    setMap(map) { if (this.map) { this.onRemove(); this.map.markers = this.map.markers.filter(marker => marker !== this); } this.map = map; if (map) { map.markers.push(this); this.onAdd(); this.draw(); } }
    getPanes() { return { overlayMouseTarget: this.map.element }; }
    getProjection() {
      return { fromLatLngToDivPixel: point => {
        const box = this.map.element.getBoundingClientRect(), bounds = this.map.bounds;
        if (!bounds) return { x: box.width / 2, y: box.height / 2 };
        const low = bounds.getSouthWest(), high = bounds.getNorthEast();
        return { x: 35 + (point.lng - low.lng) / Math.max(high.lng - low.lng, 0.001) * (box.width - 70), y: 45 + (high.lat - point.lat) / Math.max(high.lat - low.lat, 0.001) * (box.height - 80) };
      } };
    }
    static preventMapHitsAndGesturesFrom() {}
  }
  window.google = { maps: { Map, LatLng, LatLngBounds, OverlayView, event: { trigger(map) { map.draw(); }, addListenerOnce(_map, _event, fn) { setTimeout(fn, 0); }, clearInstanceListeners() { window.__mapFixture.active--; } } } };
  window.__tripNexaMapsReady();
}
