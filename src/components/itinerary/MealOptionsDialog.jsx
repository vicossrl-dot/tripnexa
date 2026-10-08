import { t, translateText, getLocale } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useEffect,useState } from 'react';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { api } from '@/api/client';
import { itineraryTimeLabel } from '@/lib/itinerary-time-label';
import PlacePhotos from '@/components/planning/PlacePhotos';
export default function MealOptionsDialog({trip,item,onClose,onSaved}) {
  useLocale();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.mealOptions(trip.id,item.id).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError("We couldn't load meal options right now. Your itinerary is unchanged.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[trip.id,item.id]);
 async function load(){setLoading(true);setError('');try{setData(await api.mealOptions(trip.id,item.id,true));}catch{setError('Meal options are temporarily unavailable. Please try again.');}finally{setLoading(false);}}
 async function choose(restaurant){setSaving(true);setError('');try{onSaved(await api.chooseMeal(trip.id,item.id,{token:data.token,place_id:restaurant.place_id}));onClose();}catch(failure){setError(failure.message);}finally{setSaving(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}><DialogContent className="trip-modal max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto"><DialogTitle>{t("ui.meal.options.4302a0c")}</DialogTitle><DialogDescription className="text-white/60">{translateText(itineraryTimeLabel(item))}{data?.context.anchor&&t("ui.near.value.4498c5c", {v0: data.context.anchor.name})}</DialogDescription>
  {loading&&<p role="status">{t("ui.finding.nearby.meal.options.07a890c")}</p>}{error&&<p role="alert" className="text-amber-200">{translateText(error)}</p>}
  {!loading&&data&&<><p className="text-xs text-white/60">{t("ui.google.maps.ce8a247")}{" "}{translateText(data.notice)}</p>{!data.restaurants.length&&<p>{t("ui.no.nearby.matches.for.these.preferences.try.another.cuisine.or.di.f13ec89")}</p>}<div className="space-y-4">{data.restaurants.map(restaurant=><article data-restaurant-card key={restaurant.place_id} className="rounded-xl border border-white/15 p-4 space-y-2"><h3 className="font-semibold">{restaurant.name}</h3><p className="text-sm text-white/70">{translateText(restaurant.category)}{restaurant.price_label&&` · ${translateText(restaurant.price_label)}`}</p><p className="text-sm">{restaurant.rating!=null?`${restaurant.rating} ★`:t("ui.rating.unavailable.969c920")}{restaurant.review_count!=null&&t("ui.value.reviews.f1bb533", {v0: restaurant.review_count.toLocaleString(getLocale())})}{" "}{t("ui.about.7ba6392")}{" "}{restaurant.distance_m}{" "}{t("ui.m.away.524d412")}</p><p className="text-sm text-white/60">{restaurant.address}</p><PlacePhotos placeId={restaurant.place_id} name={restaurant.name} limit={1}/><div className="flex flex-wrap items-center gap-3"><a className="trip-link text-sm" href={restaurant.maps_url} target="_blank" rel="noopener noreferrer">{t("ui.open.in.google.maps.7f22a63")}</a><button className="trip-button secondary" disabled={saving} onClick={()=>choose(restaurant)}>{t("ui.choose.for.this.meal.1fb83a6")}</button></div></article>)}</div></>}
  <div className="flex gap-3"><button className="trip-button secondary" disabled={loading||saving} onClick={load}>{error?t("ui.retry.942087c"):t("ui.refresh.options.1b8b26a")}</button><button className="trip-button secondary" disabled={saving} onClick={onClose}>{t("ui.close.7d9eb7a")}</button></div>
 </DialogContent></Dialog>;
}
