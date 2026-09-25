import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const body = await req.json();
    const { share_token } = body;
    
    if (!share_token) {
      return Response.json({ error: 'Missing share token' }, { status: 400 });
    }
    
    const base44 = createClientFromRequest(req);
    
    // Use service role to read public shared trip data (no user auth required)
    const trips = await base44.asServiceRole.entities.Trip.filter({
      share_token: share_token,
      share_enabled: true
    });
    
    if (!trips || trips.length === 0) {
      return Response.json({ error: 'Trip not found or sharing disabled' }, { status: 404 });
    }
    
    const trip = trips[0];
    const tripId = trip.id;
    
    // Fetch itinerary items
    const items = await base44.asServiceRole.entities.ItineraryItem.filter(
      { trip_id: tripId },
      "date",
      500
    );
    
    // Filter out private data
    const hideStay = trip.share_hide_stay;
    const publicTrip = {
      name: trip.name,
      destination: trip.destination,
      country: trip.country,
      start_date: trip.start_date,
      end_date: trip.end_date,
      timezone: trip.timezone,
      currency: trip.currency,
      plan_status: trip.plan_status,
      last_validated_at: trip.last_validated_at,
    };
    
    // Filter items: exclude private notes, confirmation numbers, source URLs with tickets
    const publicItems = items
      .filter((it) => {
        // If hiding stay, exclude stay-related items
        if (hideStay && it.step_type === "access") return false;
        return true;
      })
      .map((it) => ({
        id: it.id,
        date: it.date,
        sort_order: it.sort_order,
        step_type: it.step_type,
        title: hideStay && it.step_type === "transport" && it.route_origin === "Hotel"
          ? "Start point → " + it.route_destination
          : it.title,
        start_time: it.start_time,
        end_time: it.end_time,
        duration_min: it.duration_min,
        location: hideStay ? (it.step_type === "visit" ? it.location : null) : it.location,
        step_type_label: it.step_type,
        ticket_status: it.ticket_status === "purchased" ? "purchased" : it.ticket_status,
        // Exclude: notes with private info, source_url (ticket links), route_origin/destination if hiding stay
        notes: null,
        source_url: null,
        route_origin: hideStay ? null : it.route_origin,
        route_destination: it.route_destination,
        route_mode: it.route_mode,
        route_duration_min: it.route_duration_min,
      }));
    
    return Response.json({
      trip: publicTrip,
      items: publicItems,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}