import { translateText, t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { BedDouble, Plane, TrainFront, MapPin, Utensils, Ticket, Bus, Car, Ship, Footprints, Coffee, Landmark, Compass, Clock } from 'lucide-react';
import { itineraryTimeLabel } from '@/lib/itinerary-time-label';

export function itineraryIdentity(item, trip = {}) {
  const type = item.step_type || item.category;
  const travel = item.route_mode || item.transport_mode || item.travel_type || trip.travel_type;
  const transport = {train:TrainFront,rail:TrainFront,car:Car,taxi:Car,ship:Ship,ferry:Ship,bus:Bus,walk:Footprints,walking:Footprints,flight:Plane,plane:Plane};
  if (['stay','hotel','accommodation','check_in','check_out'].includes(type) || type === 'access' && /^check[- ]/i.test(item.title || '')) return {Icon:BedDouble,label:'Stay'};
  if (['flight','arrival','departure'].includes(type)) return {Icon:type==='flight'?Plane:transport[travel] || Plane,label:type==='flight'?'Flight':type==='arrival'?'Arrival':'Departure'};
  if (['train','transport','transfer'].includes(type)) return {Icon:type==='train'?TrainFront:transport[travel] || Bus,label:type==='train'?'Train':'Transport'};
  if (['meal','restaurant'].includes(type)) return {Icon:Utensils,label:'Meal'};
  if (['ticket','document'].includes(type)) return {Icon:Ticket,label:'Ticket'};
  if (type==='museum' || item.category==='museum' || item.place_type==='museum') return {Icon:Landmark,label:'Museum'};
  if (['free','free_time','rest','break'].includes(type)) return {Icon:Coffee,label:'Free time'};
  if (['access','buffer'].includes(type)) return {Icon:Clock,label:'Buffer'};
  return {Icon:type==='activity'?Compass:MapPin,label:type==='activity'?'Activity':'Place'};
}

export function ItineraryIcon({item,trip}) {
  useLocale();
  const {Icon,label}=itineraryIdentity(item,trip);
  return <span className="itinerary-type-icon" data-item-icon={label}><Icon size={20} aria-hidden="true"/><span className="sr-only">{translateText(label)}</span></span>;
}

export function ItineraryTime({item}) {
  useLocale();
  return <span className="itinerary-time" aria-label={translateText(itineraryTimeLabel(item))}><strong>{item.start_time || t("ui.time.tbd.b94a2f1")}</strong>{item.end_time&&<span>– {item.end_time}{itineraryTimeLabel(item).includes('(+1 day)')?t("ui.1.day.f0bbf4a"):''}</span>}</span>;
}
