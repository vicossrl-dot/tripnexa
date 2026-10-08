import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { mealChoice } from '@/lib/dining';
import MealDetails from './MealDetails';
import { ItineraryIcon, ItineraryTime, itineraryIdentity } from './ItineraryIdentity';
import { Link } from 'react-router-dom';

import VisitCard from './VisitCard';
import TransportCard from './TransportCard';
import { relatedWalletItems } from '@/lib/wallet-links';
import { friendlyDate, daySummary } from '@/lib/trip-presentation';
import { TripMapAction, useTripMaps } from './InteractiveTripMaps';
import { mapItemElementId } from '@/lib/interactive-trip-map';
import { DayWeatherChip } from './TripWeather';

export default function ItineraryDay({date,index,items,trip,walletItems,selections,onEdit,onAction,acting,onMealOptions}) {
  useLocale();
 const maps=useTripMaps();
 const transport=items.filter(item=>item.step_type==='transport').reduce((sum,item)=>sum+(item.route_duration_min||item.duration_min||0),0);
 return <section data-itinerary-day={date} className="itinerary-day-section min-w-0">
  <header className="flex flex-wrap items-end justify-between gap-3 mb-6 border-b border-white/10 pb-4"><div><p className="trip-eyebrow">{t("ui.day.8f2364e")}{" "}{index+1}</p><h2 className="font-heading font-bold text-2xl mt-2">{friendlyDate(date,{weekday:'long',month:'long'})}</h2><p className="trip-muted mt-2">{translateText(daySummary(items))}{transport>0&&t("ui.value.min.travel.16dc9c7", {v0: transport})}</p></div><div className="day-weather-actions"><DayWeatherChip date={date}/><TripMapAction date={date}/></div></header>
  {!items.length?<p className="trip-muted py-5">{t("ui.no.activities.scheduled.for.this.day.adjust.your.daily.windows.in.c2866db")}</p>:<div className="trip-timeline">{items.map(item=>{
   const type=item.step_type,subtle=['buffer','break','access','free_time','free','rest'].includes(type);
   const {label}=itineraryIdentity(item,trip);
   const mapped=maps?.access?.premium&&(maps.railOpen||maps.modal)&&maps.days.some(day=>day.stops.some(stop=>stop.itemId===item.id));
   return <article key={item.id} id={mapItemElementId(item.id)} className={`trip-timeline-item ${subtle?'subtle':''}`} data-itinerary-type={type} data-map-selected={maps?.selectedItem===item.id||undefined} tabIndex={mapped?0:undefined} aria-label={mapped?t("ui.value.select.on.map.1b9a93b", {v0: item.title}):undefined} onClick={()=>maps?.selectItem(item.id)} onFocus={()=>maps?.selectItem(item.id)}>
    {type==='visit'?<VisitCard item={item} trip={trip} ticketAdded={relatedWalletItems(item,walletItems,selections).length>0}/>:['transport','transfer'].includes(type)?<TransportCard item={item} trip={trip}/>:<div className={subtle?'rounded-xl px-4 py-3 bg-white/[.025]':'trip-card'}><div className="flex flex-wrap items-center justify-between gap-2"><p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${type==='meal'?'text-amber-800':subtle?'text-white/50':'text-lime'}`}><ItineraryIcon item={item} trip={trip}/>{translateText(label)}</p><ItineraryTime item={item}/></div><h3 className={`${subtle?'text-sm text-white/60':'text-lg font-semibold'} mt-2 break-words`}>{translateText(item.title)}</h3>{!mealChoice(item)&&item.location&&!item.title?.includes(item.location)&&<p className="trip-muted mt-1">{item.location}</p>}</div>}
    {type==='meal'&&<MealDetails item={item} onOptions={onMealOptions}/>}
    {relatedWalletItems(item,walletItems,selections).map(record=><Link key={record.id} data-wallet-quick-link to={`/trip/${trip.id}/wallet?item=${record.id}`} className="trip-link inline-flex text-sm mt-3 mr-4">{record.category==='flight'?t("ui.view.boarding.passes.76b36c2"):record.category==='stay'?t("ui.view.booking.bec81e9"):t("ui.view.tickets.435a05d")}</Link>)}
    {type==='visit'&&<div className="flex flex-wrap items-center gap-3 mt-3"><button className="text-xs text-white/60 hover:text-white py-1" onClick={()=>onEdit(item)}>{t("ui.edit.move.replace.caed03c")}</button><details className="text-xs text-white/60"><summary className="cursor-pointer py-1">{t("ui.during.your.visit.461deea")}</summary><div className="flex flex-wrap gap-2 mt-2">{[["done","Done"],["delay15","+15 min"],["delay30","+30 min"],["skip","Skip"]].map(([key,label])=><button key={key} disabled={acting===item.id} onClick={()=>onAction(item,key)} className="trip-button secondary">{translateText(label)}</button>)}</div></details></div>}
   </article>;
  })}</div>}
 </section>;
}
