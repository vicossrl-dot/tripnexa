export default function PrivateTravelFiles({ trip, stays = [] }) {
  const files = [
    ['Arrival ticket', trip?.arrival_ticket_url], ['Departure ticket', trip?.departure_ticket_url],
    ...stays.filter(stay => stay.reservation_file_url).map(stay => [`Reservation: ${stay.title}`, stay.reservation_file_url]),
  ].filter(([, url]) => /^\/api\/uploads\/[a-f0-9-]{36}$/.test(url || ''));
  if (!files.length) return null;
  return <section className="rounded-xl border border-white/10 bg-neutral-950/80 p-4 text-white space-y-2">
    <h3 className="text-sm font-semibold">Private tickets & reservations</h3>
    <div className="flex flex-wrap gap-4">{files.map(([label, url], index) => <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-lime underline">{label} · View / download</a>)}</div>
    <p className="text-xs text-white/50">Only you can access these files. They are not included in public sharing.</p>
  </section>;
}
