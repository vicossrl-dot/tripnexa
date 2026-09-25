import { Link } from 'react-router-dom';

export default function OptionalPlaces({ places = [], tripId }) {
  if (!places.length) return null;
  return <details className="trip-card mb-5" data-optional-places>
    <summary className="trip-disclosure">{places.length} optional {places.length === 1 ? 'idea' : 'ideas'} saved for later</summary>
    <p className="trip-muted mt-3">Your plan includes the options that fit your available time and pace. These ideas are still saved; they are not scheduling problems.</p>
    <ul className="list-disc pl-5 mt-3 space-y-1 text-sm">{places.map(place => <li key={place.selection_id}>{place.name}</li>)}</ul>
    <p className="trip-muted mt-3">Use Change itinerary to add or swap an idea. Or set its priority to Mandatory in Desired places, then regenerate your plan.</p>
    <Link className="trip-link inline-block mt-3" to={`/trip/${tripId}/plan?step=3`}>Review options</Link>
  </details>;
}
