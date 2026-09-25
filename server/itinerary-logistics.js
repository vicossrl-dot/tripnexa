import { localMinute, datedEvent, eventInterval } from './itinerary-time.js';
import {openingWindows} from './place-hours.js';
const label=place=>place.address||place.name||place.title||'Accommodation to confirm';
export function buildLogistics(state,{movement,hotelFor}) {
 const {trip,tripItems}=state,items=[],conflicts=[];
 const add=(type,title,start,end,extra={})=>{if(start===null||end===null||end<=start){conflicts.push({code:'invalid_duration',place:title,date:'',reason:'Check the date and time; this journey has an invalid duration.'});return;}items.push(datedEvent(trip.id,type,title,start,end,{locked:true,...extra}));};
 const issue=(code,place,reason,date='')=>conflicts.push({code,place,date,reason});
 const flights=tripItems.filter(item=>item.category==='flight');
 const arrivalText=trip.arrival_datetime||flights.find(item=>item.arrival_datetime?.slice(0,10)===trip.start_date)?.arrival_datetime;
 const departureText=trip.departure_datetime||[...flights].reverse().find(item=>item.departure_datetime?.slice(0,10)===trip.end_date)?.departure_datetime;
 const hasArrival=!!(trip.arrival_location||arrivalText||['plane','train','ship','bus','car'].includes(trip.travel_type));
 const hasDeparture=!!(trip.departure_location||departureText);
 const arrival=hasArrival?(localMinute(arrivalText?.slice(0,16))??localMinute(trip.start_date+'T09:30')):null;
 const departure=hasDeparture?(localMinute(departureText?.slice(0,16))??localMinute(trip.end_date+'T18:30')):null;
 let availableAfter=arrival,leaveBefore=departure;
 const transportTrip={...trip,transport_preference:trip.transport_preference||(trip.travel_type==='car'?'car':'transit')};
 if(hasArrival&&!hasDeparture)issue('missing_departure_time','Departure','Confirm your departure date and time to plan the final day accurately.');
 for(const [direction,stamp] of [['Arrival',arrivalText],['Departure',departureText]]){
  if((direction==='Arrival'?hasArrival:hasDeparture)&&!stamp)issue('missing_'+direction.toLowerCase()+'_time',direction,`Confirm your ${direction.toLowerCase()} time to plan this day accurately.`);
  if(stamp&&localMinute(stamp.slice(0,16))===null)issue('invalid_time',direction,`Correct the ${direction.toLowerCase()} date and time; the saved value is invalid.`);
  if(stamp&&(stamp.slice(0,10)<trip.start_date||stamp.slice(0,10)>trip.end_date))issue('journey_date',direction,`The ${direction.toLowerCase()} date is outside the trip dates. Update the trip or journey dates.`,stamp.slice(0,10));
 }
 if(arrival!==null){
  const date=arrivalText?.slice(0,10)||trip.start_date,hotel=hotelFor(tripItems,date,trip.destination);
  const origin=trip.arrival_location||flights.find(f=>f.arrival_datetime===arrivalText)?.arrival_airport||'Arrival point';
  const allowance=trip.travel_type==='plane'||trip.arrival_mode==='flight'?60:20;
  const route=movement(transportTrip,{lat:trip.arrival_lat,lng:trip.arrival_lng},hotel);
  add('arrival',`Arrival · ${origin}`,arrival,arrival+allowance,{location:origin,notes:'Local arrival and estimated formalities.'});
  add('transport',`${origin} → ${label(hotel)}`,arrival+allowance,arrival+allowance+route.minutes,{route_origin:origin,route_destination:label(hotel),route_mode:route.mode,route_duration_min:route.minutes,source_status:route.source==='google'?'api_provided':'estimated',location:label(hotel),notes:'Airport/station transfer estimate; check the live route.'});
  availableAfter=arrival+allowance+route.minutes;
  if(!hotel.id||!hotel.address)issue('stay_address','Accommodation','Confirm the hotel address so the arrival transfer can be calculated.',date);
 }
 if(departure!==null){
  const date=departureText?.slice(0,10)||trip.end_date,hotel=hotelFor(tripItems,date,trip.destination);
  const target=trip.departure_location||flights.find(f=>f.departure_datetime===departureText)?.departure_airport||'Departure point';
  const lead=trip.travel_type==='plane'||trip.departure_mode==='flight'?120:30;
  const route=movement(transportTrip,hotel,{lat:trip.departure_lat,lng:trip.departure_lng});
  leaveBefore=departure-lead-route.minutes;
  add('transport',`${label(hotel)} → ${target}`,leaveBefore,departure-lead,{route_origin:label(hotel),route_destination:target,route_mode:route.mode,route_duration_min:route.minutes,source_status:route.source==='google'?'api_provided':'estimated',location:target,notes:'Departure transfer estimate; confirm check-in and boarding times.'});
  add('departure',`Departure · ${target}`,departure-lead,departure,{location:target,notes:'Estimated check-in and boarding allowance.'});
  if(!hotel.id||!hotel.address)issue('stay_address','Accommodation','Confirm the hotel address so the departure transfer can be calculated.',date);
 }
 if(availableAfter!==null&&leaveBefore!==null&&availableAfter>leaveBefore)issue('journey_overlap','Travel times','Arrival and departure journeys overlap. Check the dates, times and transfer duration.');
 // Wallet reservations are hard constraints even when not separately added in Desired places.
 for(const booking of tripItems.filter(item=>item.category==='place'&&(item.ticket_purchased||item.booking_status==='confirmed'))){
  if(state.places.some(place=>place.trip_item_id===booking.id||booking.place_id&&place.place_id===booking.place_id))continue;
  const start=localMinute(`${booking.date}T${booking.entry_time||booking.time}`);
  if(start===null){issue('booking_time',booking.title,'Confirm the date and entry time of this reservation in Travel Wallet.',booking.date||'');continue;}
  const duration=Math.max(15,Math.min(480,Number(booking.visit_duration_min)||120)),end=start+duration;
  const hours=openingWindows(booking.__hours,booking.date),local=start-localMinute(booking.date+'T00:00');
  if(hours!==null&&!hours.some(w=>local>=w.start&&local+duration<=w.end))issue('booking_hours',booking.title,'This booking time conflicts with the currently available place information. Please verify the reservation.',booking.date);
  const hotel=hotelFor(tripItems,booking.date,trip.destination),there=movement(trip,hotel,booking),back=movement(trip,booking,hotel,there.mode==='walk'?there.minutes:0);
  const buffer=Math.max(0,Math.min(120,Number(trip.buffer_min??15)||0));
  add('transport',`${label(hotel)} → ${label(booking)}`,start-buffer-there.minutes,start-buffer,{route_origin:label(hotel),route_destination:label(booking),route_mode:there.mode,route_duration_min:there.minutes,source_status:there.source==='google'?'api_provided':'estimated',location:label(booking)});
  if(buffer)add('access','Reservation arrival buffer',start-buffer,start,{location:label(booking)});
  add('access',`Reservation · ${booking.title}`,start,end,{location:label(booking),ticket_status:'purchased',notes:'Confirmed reservation from Travel Wallet. Verify duration with the operator.'});
  add('transport',`${label(booking)} → ${label(hotel)}`,end,end+back.minutes,{route_origin:label(booking),route_destination:label(hotel),route_mode:back.mode,route_duration_min:back.minutes,source_status:back.source==='google'?'api_provided':'estimated',location:label(hotel)});
  if(availableAfter!==null&&start-buffer-there.minutes<availableAfter||leaveBefore!==null&&end+back.minutes>leaveBefore)issue('journey_visit_conflict',booking.title,'This reservation conflicts with arrival or departure. Review its date and your journey times.',booking.date);
 }
 for(const stay of tripItems.filter(item=>item.category==='stay')){
  const checkIn=localMinute(`${stay.date}T${stay.check_in_time}`),checkOut=localMinute(`${stay.end_date}T${stay.check_out_time}`);
  if(checkIn!==null){const at=Math.max(checkIn,availableAfter??checkIn);if(checkOut!==null&&at>=checkOut)issue('stay_dates',stay.title,'Arrival is after this stay ends. Check the accommodation dates.',stay.date);else add('access',`Check-in · ${stay.title||'Accommodation'}`,at,at+15,{location:label(stay),notes:'Check-in allowance; confirm late arrival and luggage arrangements.'});}
  if(checkOut!==null){const end=Math.min(checkOut,leaveBefore??checkOut);add('access',`Check-out · ${stay.title||'Accommodation'}`,end-15,end,{location:label(stay),notes:'Confirm luggage storage if sightseeing after checkout.'});}
 }
 return {items,conflicts,availableAfter,leaveBefore};
}
export function validateSchedule(items,dayWindows=[]) {
 const issues=[],ordered=items.map(item=>({...eventInterval(item),item})).sort((a,b)=>a.start-b.start);
 for(let i=0;i<ordered.length;i++){
  const {item,start,end}=ordered[i];
  if(start===null||end===null||end<=start){issues.push({code:'invalid_duration',place:item.title,date:item.date,reason:'Check the start and end time of this activity.'});continue;}
  for(let j=i-1;j>=0;j--){const other=ordered[j];if(other.end>start&&other.start<end)issues.push({code:'overlap',place:item.title,date:item.date,reason:`Overlaps ${other.item.title}. Check the times of these activities.`});}
  const blocks=dayWindows.flatMap(day=>{let blocks=[];try{blocks=JSON.parse(day.blocked||'[]');}catch{}return blocks.map(block=>({start:localMinute(day.date+'T'+block.start),end:localMinute(day.date+'T'+block.end)}));});
  if(blocks.some(block=>block.start!==null&&block.end!==null&&start<block.end&&end>block.start))issues.push({code:'blocked_time',place:item.title,date:item.date,reason:'Overlaps time you marked unavailable. Review this fixed journey or reservation and the blocked interval.'});
 }
 return issues;
}
