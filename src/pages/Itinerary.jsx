import { translateText, t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import MealReviewNotice from '@/components/itinerary/MealReviewNotice';
import MealOptionsDialog from '@/components/itinerary/MealOptionsDialog';
import OptionalPlaces from '@/components/itinerary/OptionalPlaces';
import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { TripNavigation, TripLoading, PageHeading, TripSubtitle, StatusBadge, EmptyState } from '@/components/trip/TripUI';
import { tripDates, friendlyDate, planState } from '@/lib/trip-presentation';
import { shiftDayAfter, buildMapsLink } from '@/lib/planningEngine';
import ItineraryDay from '@/components/itinerary/ItineraryDay';
import ChangeItineraryDialog from '@/components/itinerary/ChangeItineraryDialog';
import BookingStatus from '@/components/itinerary/BookingStatus';
import EditVisitDialog from '@/components/itinerary/EditVisitDialog';
import { InteractiveTripMaps, TripMapAction, DayMapRail } from '@/components/itinerary/InteractiveTripMaps';
import { TripWeather, TripWeatherAction } from '@/components/itinerary/TripWeather';
import {PremiumTripFeatures,TripExportAction,BeforeYouGoCard} from '@/components/trip/PremiumTripFeatures';

export default function Itinerary() {
  useLocale();
 const {tripId}=useParams();const [search,setSearch]=useSearchParams();
 const [trip,setTrip]=useState(null),[plan,setPlan]=useState(null),[items,setItems]=useState([]),[walletItems,setWalletItems]=useState([]),[selections,setSelections]=useState([]);
 const [meal,setMeal]=useState(null);
 const [changing,setChanging]=useState(false);
 const [editing,setEditing]=useState(null),[acting,setActing]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function applyPlan(data){setPlan(data);setItems(data.items);}
 useEffect(()=>{let active=true;Promise.all([api.entities.Trip.get(tripId),api.getItinerary(tripId),api.wallet.list(tripId),api.entities.PlaceSelection.filter({trip_id:tripId},'created_date',1000)]).then(([t,p,w,s])=>{if(active){setTrip(t);applyPlan(p);setWalletItems(w.items);setSelections(s);}}).catch(failure=>{if(active)setError(failure.message);});return()=>{active=false;};},[tripId]);
 if(!trip||!plan)return <TripLoading error={error}/>;
 const dates=tripDates(trip,plan), day=search.get('day')||'all';
 const displayed=dates.includes(day)?[day]:dates;
  const handleAction = async (item, action) => {
    setActing(item.id);
    if (action === "skip" || action === "done") {
      const updated = { ...item, notes: (item.notes || "") + (action === "done" ? " [Done]" : " [Skipped]") };
      try { await api.entities.ItineraryItem.update(item.id, { notes: updated.notes }); } catch (e) {}
      setItems((prev) => prev.map((i) => i.id === item.id ? updated : i));
    }
    if (action === "delay15" || action === "delay30" || action === "delay60") {
      const mins = action === "delay15" ? 15 : action === "delay30" ? 30 : 60;
      const dayItems = items.filter((i) => i.date === item.date).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      const { shifted, overflow } = shiftDayAfter({ dayItems, itemId: item.id, delayMin: mins });
      // Persist all shifted items
      const updates = shifted
        .filter((it) => it.id && (it.start_time !== dayItems.find((d) => d.id === it.id)?.start_time))
        .map((it) => api.entities.ItineraryItem.update(it.id, { start_time: it.start_time, end_time: it.end_time }).catch(() => {}));
      await Promise.all(updates);
      const note = overflow ? ` [Delay ${mins} min — some activities pass 23:00]` : ` [Delay ${mins} min — rest of day recalculated]`;
      try {
        await api.entities.ItineraryItem.update(item.id, { notes: (item.notes || "") + note });
      } catch (e) {}
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i.id, i]));
        for (const it of shifted) {
          if (map.has(it.id)) map.set(it.id, { ...map.get(it.id), start_time: it.start_time, end_time: it.end_time, notes: it.id === item.id ? (item.notes || "") + note : map.get(it.id).notes });
        }
        return Array.from(map.values());
      });
    }
    setActing(null);
  };


 return <PremiumTripFeatures trip={trip} plan={{...plan,items}}><div className="trip-experience pb-16"><TripNavigation trip={trip} onUpdated={setTrip} actions={<TripExportAction/>}/>
  <main className="trip-container py-7 max-w-[1100px]">
   <PageHeading eyebrow={t('qa.itinerary')} title={trip.name} description={<TripSubtitle trip={trip}/>}><div className="flex flex-wrap items-center gap-3"><StatusBadge {...planState(plan)}/>{items.length>0&&<button className="trip-button primary" onClick={()=>setChanging(true)}>{t("ui.change.itinerary.d693f72")}</button>}</div></PageHeading>
   {error&&<p role="alert" className="text-red-300 mb-4">{translateText(error)}</p>}
   {notice&&<p role="status" className="text-emerald-300 mb-4 text-sm">{translateText(notice)}</p>}
   {plan.stale&&<div className="trip-card flex flex-wrap items-center justify-between gap-3 mb-5"><div><p className="font-medium">{t("ui.plan.changed.baa23e1")}</p><p className="trip-muted">{t("ui.your.saved.schedule.is.unchanged.regenerate.to.apply.your.new.inp.04eb20c")}</p></div><Link className="trip-button secondary" to={`/trip/${tripId}/plan?step=5`}>{t("ui.update.plan.592acaa")}</Link></div>}
   {plan.requiresRegeneration&&<div className="trip-card mb-5"><p className="trip-muted">{t("ui.this.saved.plan.uses.earlier.scheduling.rules.regenerate.to.updat.df56cc6")}</p><Link className="trip-link inline-block mt-3" to={`/trip/${tripId}/plan?step=5`}>{t("ui.review.and.regenerate.4a8f954")}</Link></div>}
   <MealReviewNotice choices={plan.mealChoicesToReview}/>
   <OptionalPlaces places={plan.unscheduledOptional} tripId={tripId}/>
   {plan.conflicts?.length>0&&<details className="trip-card mb-5"><summary className="trip-disclosure">{plan.conflicts.length}{" "}{t("ui.scheduling.details.to.review.d61d6ee")}</summary>{plan.conflicts.map((conflict,index)=><p key={index} className="trip-muted mt-2">{conflict.place}: {translateText(conflict.reason)}</p>)}<Link className="trip-link inline-block mt-3" to={`/trip/${tripId}/plan?step=5`}>{t("ui.review.details.1640b0d")}</Link></details>}
   {!items.length?<EmptyState title={t("ui.your.trip.plan.is.ready.to.be.built.923e5c8")} description={t("ui.generate.an.itinerary.from.your.saved.places.stays.and.preference.d31176d")}><Link className="trip-button primary" to={`/trip/${tripId}/plan?step=5`}>{t("ui.generate.itinerary.70f7c06")}</Link></EmptyState>:<>
    <TripWeather trip={trip} dates={dates} revision={JSON.stringify([plan.version,items,walletItems,selections])}><InteractiveTripMaps trip={trip} items={items} dates={dates} day={day} stays={walletItems} selections={selections}><nav aria-label={t("ui.itinerary.days.2e2e8df")} className="trip-day-selector"><button className="trip-button secondary" aria-pressed={!dates.includes(day)} onClick={()=>setSearch({})}>{t("ui.all.days.fc91b0e")}</button>{dates.map((date,index)=><button key={date} data-day-select={date} className="trip-button secondary" aria-pressed={day===date} onClick={()=>setSearch({day:date})}>{t("ui.day.8f2364e")}{" "}{index+1} · {friendlyDate(date)}</button>)}<TripMapAction/><TripWeatherAction/></nav>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_240px] gap-8 mt-5 items-start"><div className="space-y-10">{displayed.map(date=><ItineraryDay key={date} date={date} index={dates.indexOf(date)} items={items.filter(item=>item.date===date)} trip={trip} walletItems={walletItems} selections={selections} onEdit={setEditing} onAction={handleAction} acting={acting} onMealOptions={setMeal}/>) }{displayed.includes(dates.at(-1))&&<BeforeYouGoCard/>}</div>
    <aside className="space-y-4 trip-itinerary-rail"><DayMapRail/><div className="trip-card"><p className="trip-eyebrow">{t("ui.on.the.go.164229e")}</p><p className="trip-muted mt-3">{t("ui.times.and.transfers.are.estimates.check.live.routes.opening.hours.c7ddf63")}</p><Link className="trip-link inline-block mt-4 text-sm" to={`/trip/${tripId}/wallet`}>{t("ui.open.travel.wallet.b599454")}</Link></div>
     <details className="trip-card"><summary className="cursor-pointer font-medium">{t("ui.routes.maps.6b975f7")}</summary><div className="space-y-3 mt-4">{items.filter(item=>item.step_type==='transport'&&(!dates.includes(day)||item.date===day)).map(item=>{const url=buildMapsLink({origin:item.route_origin,destination:item.route_destination,mode:item.route_mode});return url?<a key={item.id} href={url} target="_blank" rel="noopener noreferrer" className="trip-link block text-sm">{item.route_origin} → {item.route_destination}</a>:null;})}</div></details>
     <details className="trip-card"><summary className="cursor-pointer font-medium">{t("ui.tickets.bookings.7de6319")}</summary><div className="space-y-3 mt-4">{items.filter(item=>item.step_type==='visit'&&item.ticket_status!=='free').map(item=><div key={item.id}><p className="text-sm font-medium">{item.title}</p><p className="trip-muted">{friendlyDate(item.date)} · {item.start_time}</p><BookingStatus item={item} tripId={tripId} walletItems={walletItems} selections={selections}/></div>)}<Link to={`/trip/${tripId}/wallet?category=place`} className="trip-link block text-sm">{t("ui.view.saved.tickets.12722f9")}</Link></div></details>
    </aside></div></InteractiveTripMaps></TripWeather>
   </>}
  </main>
  {meal&&<MealOptionsDialog trip={trip} item={meal} onClose={()=>setMeal(null)} onSaved={data=>{applyPlan(data);setNotice("Restaurant saved for this meal");}}/>}
  {changing&&<ChangeItineraryDialog trip={trip} version={plan.version} onClose={()=>setChanging(false)} onSaved={data=>{applyPlan(data);setNotice("Itinerary changes saved");}}/>}
  {editing&&<EditVisitDialog key={editing.id} item={editing} trip={trip} version={plan.version} onClose={()=>setEditing(null)} onSaved={data=>{applyPlan(data);setNotice('Itinerary saved');}}/>}
 </div></PremiumTripFeatures>;
}
