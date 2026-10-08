import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, BedDouble, MapPin, Wallet, Route, Plane, Ticket, FileText, Zap } from 'lucide-react';
import OverviewSlideshow from './OverviewSlideshow';
import TripHealth from './TripHealth';
import { SummaryCard, StatusBadge, EmptyState } from './TripUI';
import { tripDates, dateRange, daySummary, friendlyDate, planState, walletTitle } from '@/lib/trip-presentation';
import { travelLabel } from '@/lib/travel-types';
import { validateTripForFinalize } from '@/lib/planningEngine';
import {BeforeYouGoCard} from './PremiumTripFeatures';

export default function TripOverview({trip,plan,items,places,onUpdated}) {
  useLocale();
  const base='/trip/'+trip.id,dates=tripDates(trip,plan), stays=items.filter(item=>item.category==='stay');
  const validation=validateTripForFinalize({trip,tripItems:items,places}), state=planState(plan,validation.essential.length);
  const counts=category=>items.filter(item=>item.category===category).reduce((sum,item)=>sum+item.attachments.length,0);
  const desired=places.filter(place=>place.selection_source!=='ai'&&place.priority!=='excluded').length;
  const accepted=places.filter(place=>place.selection_source==='ai'&&['mandatory','preferred'].includes(place.priority)).length;
  const actions=[];
  for(const issue of [...validation.essential,...validation.optional]) {
    const title=`Add ${issue.fieldLabel.toLowerCase()}`;
    if(!actions.some(action=>action.title===title))actions.push({title,detail:issue.recordName,to:issue.recordType==='flight'&&'recordId' in issue?base+'/wallet?item='+issue.recordId:base+'/plan?step='+(issue.stepIndex??0),label:'Fix'});
    if(actions.length===3)break;
  }
  if(!plan.items.length)actions.push({title:'Build your day-by-day itinerary',detail:'Bring your places and preferences together.',to:base+'/plan?step=5',label:'Plan'});
  else actions.push({title:plan.stale?'Apply your planning changes':'Review your itinerary',detail:plan.stale?'Regenerate when you are ready.':'Your saved schedule is ready to explore.',to:base+(plan.stale?'/plan?step=5':'/itinerary'),label:'Review'});
  if(!items.some(item=>item.attachments.length))actions.push({title:'Keep your travel files together',detail:'Add tickets or documents whenever you have them.',to:base+'/wallet',label:'Open'});
  return <>
    <section className="trip-hero" data-trip-overview>
      <OverviewSlideshow trip={trip} items={plan.items} places={places}/>
      <div className="relative z-10 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3"><p className="trip-eyebrow">{trip.travel_type?t("ui.traveling.by.5040c8f")+translateText(travelLabel(trip.travel_type)):t("ui.your.next.journey.e3446bb")}</p><StatusBadge {...state}/></div>
        <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-5 break-words">{trip.name}</h1>
        <p className="text-lg sm:text-xl text-white/85 mt-3 flex items-center gap-2"><MapPin size={19} className="shrink-0"/>{[trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', ')||t("ui.choose.a.destination.ee63978")}</p>
        <p className="text-sm sm:text-base text-white/75 mt-4">{dateRange(trip)}{dates.length>0&&" · " + t("counts.days", {count: dates.length})}{trip.adults>0&&" · " + t("counts.adults", {count: trip.adults})}{trip.children_ages&&t("ui.value.children.c5bd2e4", {v0: trip.children_ages.split(',').filter(Boolean).length})}</p>
        <div className="flex flex-wrap gap-2 mt-7"><Link to={base+'/itinerary'} className="trip-button primary"><Route size={17}/>{t("ui.view.itinerary.495ad13")}</Link><Link to={base+'/plan'} className="trip-button secondary">{t("ui.update.plan.592acaa")}</Link><Link to={base+'/wallet'} className="trip-button secondary"><Wallet size={17}/>{t("ui.travel.wallet.45b8d18")}</Link></div>
      </div>
    </section>
    <TripHealth tripId={trip.id} onUpdated={onUpdated}/>
    <BeforeYouGoCard/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 my-6" data-trip-summaries>
      <SummaryCard icon={CalendarDays} title={t("ui.travel.dates.e8aee7f")} to={base+'/plan?step=0'}><p className="font-semibold">{dateRange(trip)}</p><p className="trip-muted mt-2">{t("ui.arrival.9ca5c64")}{" "}{trip.arrival_datetime?trip.arrival_datetime.slice(11,16):t("ui.time.not.set.3f6b56b")}<br/>{t("ui.departure.ba58275")}{" "}{trip.departure_datetime?trip.departure_datetime.slice(11,16):t("ui.time.not.set.3f6b56b")}</p></SummaryCard>
      <SummaryCard icon={BedDouble} title={t("ui.stay.hotel.8e04b73")} to={base+(stays[0]?'/wallet?item='+stays[0].id:'/plan?step=1')}><p className="font-semibold break-words">{stays[0]?walletTitle(stays[0]):t("ui.no.stay.added.yet.851e28d")}</p><p className="trip-muted mt-2">{stays.length?`${stays.length} ${stays.length===1?'stay':'stays'} · ${friendlyDate(stays[0].date)} – ${friendlyDate(stays[0].end_date)}`:t("ui.add.accommodation.or.plan.without.a.hotel.55623c4")}</p></SummaryCard>
      <SummaryCard icon={Route} title={t("ui.your.plan.d9ab76c")} to={base+(plan.items.length?'/itinerary':'/plan?step=3')}><p className="font-semibold">{desired}{" "}{t("ui.desired.b60b935")}{" "}{desired===1?t("ui.place.81df635"):t("ui.places.a48fcb7")}</p><p className="trip-muted mt-2">{accepted}{" "}{t("ui.accepted.suggestions.7dd1923")}</p><div className="mt-3"><StatusBadge {...state}/></div></SummaryCard>
      <SummaryCard icon={Wallet} title={t("ui.travel.wallet.45b8d18")} to={base+'/wallet'}><div className="grid grid-cols-2 gap-2 text-sm">{[["flight","Flight files"],["stay","Stay files"],["place","Tickets"],["document","Documents"]].map(([key,label])=><p key={key}><span className="font-semibold text-lg mr-1" data-summary-count={key}>{counts(key)}</span><span className="text-white/60">{translateText(label)}</span></p>)}</div></SummaryCard>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <section className="trip-card"><div className="flex items-center justify-between gap-3 mb-5"><div><p className="trip-eyebrow">{t("ui.the.whole.journey.a7b0bfe")}</p><h2 className="text-xl font-semibold mt-1">{t("ui.trip.at.a.glance.bcf3e9a")}</h2></div><span className="trip-muted">{dates.length}{" "}{t("ui.days.ab51004")}</span></div>
        {!plan.items.length?<EmptyState title={t("ui.your.itinerary.hasn.t.been.generated.yet.b9223fa")} description={t("ui.choose.your.places.and.preferences.then.build.your.schedule.99bd8ce")}><Link to={base+'/plan'} className="trip-button primary">{t("ui.continue.planning.a7f0c7a")}</Link></EmptyState>:<div className="divide-y divide-white/10">{dates.map((date,index)=><Link key={date} data-day-preview={date} to={base+'/itinerary?day='+date} className="flex gap-4 items-center py-4 group"><span className="rounded-xl bg-white/5 text-lime text-center w-12 py-2 shrink-0"><span className="block text-[10px] uppercase">{t("ui.day.8f2364e")}</span><span className="font-semibold text-xl">{index+1}</span></span><div className="min-w-0 flex-1"><h3 className="font-semibold">{friendlyDate(date,{weekday:'short'})}</h3><p className="trip-muted mt-1">{translateText(daySummary(plan.items.filter(item=>item.date===date)))}</p></div><ArrowRight size={17} className="text-white/40 group-hover:text-lime"/></Link>)}</div>}
        {plan.items.length>0&&<Link className="trip-link inline-flex items-center gap-2 mt-5" to={base+'/itinerary'}>{t("ui.view.full.itinerary.bc53287")}{" "}<ArrowRight size={16}/></Link>}
      </section>
      <div className="space-y-5">
      <details open className="trip-card" data-semantic-shortcuts><summary className="font-semibold cursor-pointer"><Zap size={16} className="inline mr-2 text-lime"/>{t("ui.quick.access.8b43b0c")}</summary><nav className="grid gap-1 mt-3" aria-label={t("ui.quick.access.8b43b0c")}>{[{label:"Stay / Hotel",path:'/plan?step=1',Icon:BedDouble},{label:"Flights",path:'/wallet?category=flight',Icon:Plane},{label:"Tickets",path:'/wallet?category=place',Icon:Ticket},{label:"Documents",path:'/wallet?category=document',Icon:FileText},{label:"Desired Places",path:'/plan?step=3',Icon:MapPin}].map(({label,path,Icon})=><Link key={label} to={base+path} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 text-sm text-white/75"><Icon size={16}/>{translateText(label)}<ArrowRight size={14} className="ml-auto"/></Link>)}</nav></details></div>
    </div>
  </>;
}
