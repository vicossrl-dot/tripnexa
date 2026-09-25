import { mealChoice } from '@/lib/dining';
import MealDetails from './MealDetails';
import { itineraryTimeLabel } from '@/lib/itinerary-time-label';
import { Link } from 'react-router-dom';
import { PlaneLanding, PlaneTakeoff, Coffee, Utensils, Clock, MapPin, TrainFront, Car, Ship, Bus } from 'lucide-react';
import VisitCard from './VisitCard';
import TransportCard from './TransportCard';
import { relatedWalletItems } from '@/lib/wallet-links';
import { friendlyDate, daySummary } from '@/lib/trip-presentation';

export default function ItineraryDay({date,index,items,trip,walletItems,selections,onEdit,onAction,acting,onMealOptions}) {
 const transport=items.filter(item=>item.step_type==='transport').reduce((sum,item)=>sum+(item.route_duration_min||item.duration_min||0),0);
 return <section data-itinerary-day={date} className="min-w-0">
  <header className="flex flex-wrap items-end justify-between gap-3 mb-6 border-b border-white/10 pb-4"><div><p className="trip-eyebrow">Day {index+1}</p><h2 className="font-heading font-bold text-2xl mt-2">{friendlyDate(date,{weekday:'long',month:'long'})}</h2><p className="trip-muted mt-2">{daySummary(items)}{transport>0&&` · ${transport} min travel`}</p></div></header>
  {!items.length?<p className="trip-muted py-5">No activities scheduled for this day. Adjust your daily windows in Update Plan.</p>:<div className="trip-timeline">{items.map(item=>{
   const type=item.step_type,subtle=['buffer','break','access','free_time','free','rest'].includes(type);
   const TravelIcon={train:TrainFront,car:Car,ship:Ship,bus:Bus}[trip.travel_type];
   const Icon={arrival:TravelIcon||PlaneLanding,departure:TravelIcon||PlaneTakeoff,access:Clock,meal:Utensils,buffer:Clock,break:Coffee,free_time:Coffee,free:Coffee,rest:Coffee}[type]||MapPin;
   const label={arrival:'Arrival',departure:'Departure',access:item.title?.startsWith('Check-')?'Stay':'Arrival buffer',meal:'Meal break',buffer:'Buffer',break:'Rest / buffer',free_time:'Free time',free:'Free time',rest:'Rest'}[type]||type;
   return <article key={item.id} className={`trip-timeline-item ${subtle?'subtle':''}`} data-itinerary-type={type}>
    {type==='visit'?<VisitCard item={item} trip={trip} ticketAdded={relatedWalletItems(item,walletItems,selections).length>0}/>:['transport','transfer'].includes(type)?<TransportCard item={item} trip={trip}/>:<div className={subtle?'rounded-xl px-4 py-3 bg-white/[.025]':'trip-card'}><div className="flex flex-wrap items-center justify-between gap-2"><p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${type==='meal'?'text-amber-200/80':subtle?'text-white/50':'text-lime'}`}><Icon size={16}/>{label}</p><p className="font-mono text-xs text-white/65">{itineraryTimeLabel(item)}</p></div><h3 className={`${subtle?'text-sm text-white/60':'text-lg font-semibold'} mt-2 break-words`}>{item.title}</h3>{!mealChoice(item)&&item.location&&!item.title?.includes(item.location)&&<p className="trip-muted mt-1">{item.location}</p>}</div>}
    {type==='meal'&&<MealDetails item={item} onOptions={onMealOptions}/>}
    {relatedWalletItems(item,walletItems,selections).map(record=><Link key={record.id} data-wallet-quick-link to={`/trip/${trip.id}/wallet?item=${record.id}`} className="trip-link inline-flex text-sm mt-3 mr-4">{record.category==='flight'?'View boarding passes':record.category==='stay'?'View booking':'View tickets'}</Link>)}
    {type==='visit'&&<div className="flex flex-wrap items-center gap-3 mt-3"><button className="text-xs text-white/60 hover:text-white py-1" onClick={()=>onEdit(item)}>Edit / move / replace</button><details className="text-xs text-white/60"><summary className="cursor-pointer py-1">During your visit</summary><div className="flex flex-wrap gap-2 mt-2">{[['done','Done'],['delay15','+15 min'],['delay30','+30 min'],['skip','Skip']].map(([key,label])=><button key={key} disabled={acting===item.id} onClick={()=>onAction(item,key)} className="trip-button secondary">{label}</button>)}</div></details></div>}
   </article>;
  })}</div>}
 </section>;
}
