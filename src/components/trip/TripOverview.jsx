import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, BedDouble, MapPin, Wallet, Route, Plane, Ticket, FileText, Zap } from 'lucide-react';
import TravelBackground from './TravelBackground';
import TripHealth from './TripHealth';
import { SummaryCard, StatusBadge, EmptyState } from './TripUI';
import { tripDates, dateRange, daySummary, friendlyDate, planState, walletTitle } from '@/lib/trip-presentation';
import { travelLabel } from '@/lib/travel-types';
import { validateTripForFinalize } from '@/lib/planningEngine';

export default function TripOverview({trip,plan,items,places,onUpdated}) {
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
      <TravelBackground type={trip.travel_type}/>
      <div className="relative z-10 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3"><p className="trip-eyebrow">{trip.travel_type?'Traveling by '+travelLabel(trip.travel_type):'Your next journey'}</p><StatusBadge {...state}/></div>
        <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-5 break-words">{trip.name}</h1>
        <p className="text-lg sm:text-xl text-white/85 mt-3 flex items-center gap-2"><MapPin size={19} className="shrink-0"/>{[trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', ')||'Choose a destination'}</p>
        <p className="text-sm sm:text-base text-white/75 mt-4">{dateRange(trip)}{dates.length>0&&` · ${dates.length} ${dates.length===1?'day':'days'}`}{trip.adults>0&&` · ${trip.adults} ${trip.adults===1?'adult':'adults'}`}{trip.children_ages&&` · ${trip.children_ages.split(',').filter(Boolean).length} children`}</p>
        <div className="flex flex-wrap gap-2 mt-7"><Link to={base+'/itinerary'} className="trip-button primary"><Route size={17}/>View Itinerary</Link><Link to={base+'/plan'} className="trip-button secondary">Update Plan</Link><Link to={base+'/wallet'} className="trip-button secondary"><Wallet size={17}/>Travel Wallet</Link></div>
      </div>
    </section>
    <TripHealth tripId={trip.id} onUpdated={onUpdated}/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 my-6" data-trip-summaries>
      <SummaryCard icon={CalendarDays} title="Travel dates" to={base+'/plan?step=0'}><p className="font-semibold">{dateRange(trip)}</p><p className="trip-muted mt-2">Arrival · {trip.arrival_datetime?trip.arrival_datetime.slice(11,16):'Time not set'}<br/>Departure · {trip.departure_datetime?trip.departure_datetime.slice(11,16):'Time not set'}</p></SummaryCard>
      <SummaryCard icon={BedDouble} title="Stay / Hotel" to={base+(stays[0]?'/wallet?item='+stays[0].id:'/plan?step=1')}><p className="font-semibold break-words">{stays[0]?walletTitle(stays[0]):'No stay added yet'}</p><p className="trip-muted mt-2">{stays.length?`${stays.length} ${stays.length===1?'stay':'stays'} · ${friendlyDate(stays[0].date)} – ${friendlyDate(stays[0].end_date)}`:'Add accommodation or plan without a hotel.'}</p></SummaryCard>
      <SummaryCard icon={Route} title="Your plan" to={base+(plan.items.length?'/itinerary':'/plan?step=3')}><p className="font-semibold">{desired} desired {desired===1?'place':'places'}</p><p className="trip-muted mt-2">{accepted} accepted suggestions</p><div className="mt-3"><StatusBadge {...state}/></div></SummaryCard>
      <SummaryCard icon={Wallet} title="Travel Wallet" to={base+'/wallet'}><div className="grid grid-cols-2 gap-2 text-sm">{[['flight','Flight files'],['stay','Stay files'],['place','Tickets'],['document','Documents']].map(([key,label])=><p key={key}><span className="font-semibold text-lg mr-1" data-summary-count={key}>{counts(key)}</span><span className="text-white/60">{label}</span></p>)}</div></SummaryCard>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <section className="trip-card"><div className="flex items-center justify-between gap-3 mb-5"><div><p className="trip-eyebrow">The whole journey</p><h2 className="text-xl font-semibold mt-1">Trip at a glance</h2></div><span className="trip-muted">{dates.length} days</span></div>
        {!plan.items.length?<EmptyState title="Your itinerary hasn't been generated yet." description="Choose your places and preferences, then build your schedule."><Link to={base+'/plan'} className="trip-button primary">Continue planning</Link></EmptyState>:<div className="divide-y divide-white/10">{dates.map((date,index)=><Link key={date} data-day-preview={date} to={base+'/itinerary?day='+date} className="flex gap-4 items-center py-4 group"><span className="rounded-xl bg-white/5 text-lime text-center w-12 py-2 shrink-0"><span className="block text-[10px] uppercase">Day</span><span className="font-semibold text-xl">{index+1}</span></span><div className="min-w-0 flex-1"><h3 className="font-semibold">{friendlyDate(date,{weekday:'short'})}</h3><p className="trip-muted mt-1">{daySummary(plan.items.filter(item=>item.date===date))}</p></div><ArrowRight size={17} className="text-white/40 group-hover:text-lime"/></Link>)}</div>}
        {plan.items.length>0&&<Link className="trip-link inline-flex items-center gap-2 mt-5" to={base+'/itinerary'}>View full itinerary <ArrowRight size={16}/></Link>}
      </section>
      <div className="space-y-5">
      <details open className="trip-card" data-semantic-shortcuts><summary className="font-semibold cursor-pointer"><Zap size={16} className="inline mr-2 text-lime"/>Quick access</summary><nav className="grid gap-1 mt-3" aria-label="Quick access">{[{label:'Stay / Hotel',path:'/plan?step=1',Icon:BedDouble},{label:'Flights',path:'/wallet?category=flight',Icon:Plane},{label:'Tickets',path:'/wallet?category=place',Icon:Ticket},{label:'Documents',path:'/wallet?category=document',Icon:FileText},{label:'Desired Places',path:'/plan?step=3',Icon:MapPin}].map(({label,path,Icon})=><Link key={label} to={base+path} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 text-sm text-white/75"><Icon size={16}/>{label}<ArrowRight size={14} className="ml-auto"/></Link>)}</nav></details></div>
    </div>
  </>;
}
