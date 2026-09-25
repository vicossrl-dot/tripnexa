// Also supports older saved itineraries without full destination-local datetimes.
export function itineraryTimeLabel(item) {
  const full = item.start_datetime === `${item.date}T${item.start_time}` && item.end_datetime?.slice(11) === item.end_time;
  const overnight = full ? item.end_datetime.slice(0,10) > item.date : item.end_time < item.start_time;
  return [item.start_time,item.end_time].filter(Boolean).join('–') + (overnight ? ' (+1 day)' : '');
}
