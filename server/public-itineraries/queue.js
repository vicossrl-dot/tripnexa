// Called inside the original save transaction: invalidation is committed with the edit.
export async function queuePublicItinerary(db, tripId) {
  if (!tripId) return;
  await db.execute("UPDATE public_itineraries SET status='draft',indexable=FALSE,eligibility_reason='source_changed' WHERE source_trip_id=? AND admin_hidden=FALSE", [tripId]);
  await db.execute('INSERT INTO public_itinerary_jobs(trip_id) VALUES(?) ON DUPLICATE KEY UPDATE attempts=0,reason=NULL,updated_at=CURRENT_TIMESTAMP(3)', [tripId]);
}
