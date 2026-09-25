// Presentation only: no defaults here are written back into trip data.
export function tripDates(trip, plan = null) {
  const dates = new Set(plan?.dates || []);
  const start = Date.parse(`${trip.start_date}T12:00:00Z`), end = Date.parse(`${trip.end_date}T12:00:00Z`);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 366 * 86400000) {
    for (let day = start; day <= end; day += 86400000) dates.add(new Date(day).toISOString().slice(0,10));
  }
  for (const item of plan?.items || []) if (item.date) dates.add(item.date);
  return [...dates].sort();
}
export function friendlyDate(date, options = {}) {
  if (!date || !Number.isFinite(Date.parse(date))) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',...options}).format(new Date(date.slice(0,10)+'T12:00:00'));
}
export const dateRange = trip => trip.start_date && trip.end_date ? `${friendlyDate(trip.start_date)} – ${friendlyDate(trip.end_date,{year:'numeric'})}` : 'Dates to be decided';
export function daySummary(items) {
  const count = type => items.filter(item=>item.step_type===type).length;
  return [count('arrival') && 'Arrival', count('visit') && `${count('visit')} ${count('visit')===1?'visit':'visits'}`, count('transport') && `${count('transport')} ${count('transport')===1?'transfer':'transfers'}`, count('departure') && 'Departure'].filter(Boolean).join(' · ') || (items.length ? 'Flexible time & breaks' : 'No activities scheduled');
}
export function walletTitle(item) {
  if (item.category==='flight' && item.departure_airport && item.arrival_airport) return `${item.departure_airport} → ${item.arrival_airport}`;
  const filename = /\.(pdf|jpe?g|png|webp|gif)$/i.test(item.title || '');
  if (item.title && !filename) return item.title;
  if (item.category==='flight' && item.flight_number) return [item.airline,item.flight_number].filter(Boolean).join(' ');
  if (item.category==='document' && item.attachments?.[0]?.document_type) return item.attachments[0].document_type;
  return item.title || item.attachments?.[0]?.label || item.attachments?.[0]?.original_name || 'Travel booking';
}
export function planState(plan, required = 0) {
  if (required) return {label:'Needs details',tone:'warning'};
  if (!plan?.items?.length) return {label:'Planning',tone:'muted'};
  if (plan.requiresRegeneration) return {label:'Update available',tone:'muted'};
  if (plan.stale) return {label:'Changes pending',tone:'warning'};
  if (plan.conflicts?.length) return {label:'Needs review',tone:'warning'};
  return {label:'Itinerary ready',tone:'success'};
}
