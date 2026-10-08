import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { api } from '@/api/client';

export default function OverviewSlideshow({ trip, items, places }) {
  useLocale();
  const slides = useMemo(() => {
    const seen = new Set();
    return items.filter(item => ['visit','meal'].includes(item.step_type)).flatMap(item => {
      const place = places.find(place => place.id === item.selection_id);
      const placeId = item.place_id || place?.place_id;
      if (!placeId || seen.has(placeId)) return [];
      seen.add(placeId);
      return [{ id:item.id, placeId, title:item.title || place?.name, type:item.step_type, date:item.date, time:item.start_time }];
    }).slice(0,10);
  }, [items,places]);
  const [index,setIndex] = useState(0), [photo,setPhoto] = useState(null), [paused,setPaused] = useState(false);
  const [reduced,setReduced] = useState(false);
  const displayed=useRef(new Map());
  const objectUrls=useRef(new Set());
  const [ready,setReady]=useState(false);
  const show=next=>setPhoto(old=>old?.url===next.url?old:{...next,previous:old?{url:old.url}:null});
  useEffect(() => {
    const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches);
    update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);
  },[]);
  useEffect(()=>{setIndex(0);setPhoto(null);displayed.current.clear();return()=>{for(const url of objectUrls.current)URL.revokeObjectURL(url);objectUrls.current.clear();};},[trip.id]);
  useEffect(() => {
    if (!slides.length) return;
    const abort=new AbortController();
    const slide=slides[index % slides.length];
    setReady(false);
    const previous=displayed.current.get(slide.placeId);
    if(previous&&previous.until>Date.now()){if(previous.photo)show(previous.photo);setReady(true);return;}
    // Fetch only the displayed place, never persist photo names or prefetch the entire itinerary.
    api.places.photos(slide.placeId,abort.signal).then(async result=>{
      for (const candidate of result.photos.slice(0,2)) {
        if(abort.signal.aborted)return;
        const response=await fetch(candidate.url,{signal:abort.signal,cache:'no-store',credentials:'same-origin'});
        if(!response.ok)continue;
        // Decode once in page memory; no persistent cache and no duplicate media request on render.
        const url=URL.createObjectURL(await response.blob());objectUrls.current.add(url);
        const loaded=await new Promise(resolve=>{const img=new Image();const timer=setTimeout(()=>resolve(false),10000);img.onload=()=>{clearTimeout(timer);resolve(true);};img.onerror=()=>{clearTimeout(timer);resolve(false);};img.src=url;});
        if(loaded&&!abort.signal.aborted){const next={...candidate,url,slide};displayed.current.set(slide.placeId,{photo:next,until:Infinity});show(next);return;}
        URL.revokeObjectURL(url);objectUrls.current.delete(url);
      }
      displayed.current.set(slide.placeId,{photo:null,until:Date.now()+60000});
    }).catch(()=>{displayed.current.set(slide.placeId,{photo:null,until:Date.now()+60000});}).finally(()=>{if(!abort.signal.aborted)setReady(true);});
    return()=>abort.abort();
  },[slides,index]);
  useEffect(()=>{
    if(paused||reduced||slides.length<2||!ready)return;
    const timer=setInterval(()=>{if(!document.hidden)setIndex(i=>(i+1)%slides.length);},2000);
    return()=>clearInterval(timer);
  },[slides.length,paused,reduced,ready]);
  return <>
    <div className="overview-scenery">{photo?.previous&&<img className="previous" src={photo.previous.url} alt="" aria-hidden="true"/>}{photo?<img key={photo.url} src={photo.url} alt={`${photo.slide.title} in ${trip.destination || 'your itinerary'}`}/>:trip.cover_image_url?.startsWith('/api/uploads/')?<img src={trip.cover_image_url} alt={trip.destination||trip.name} onError={event=>{event.currentTarget.style.display='none';}}/>:null}</div>
    {photo&&<div className="hero-place"><p className="hero-place-title">{photo.slide.title}</p><p>{photo.slide.type==='meal'?t("ui.food.drink.48f1e8b"):t("ui.explore.3b73900")} · {photo.slide.date} {photo.slide.time}</p><p className="hero-attribution"><a translate="no" className="google-maps-attribution" href={photo.source||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(photo.slide.title)}&query_place_id=${encodeURIComponent(photo.slide.placeId)}`} target="_blank" rel="noreferrer"><img src="/media/google-maps-attribution.png" alt={t("ui.google.maps.2923740")}/></a>{photo.authors.map((author,i)=><span key={i}> · {author.url?<a href={author.url} target="_blank" rel="noreferrer">{author.name}</a>:author.name}</span>)}</p></div>}
    {slides.length>1&&<div className="hero-controls" role="group" aria-label={t("ui.itinerary.highlights.fa8ac0a")}><button type="button" className="hero-pause" aria-label={paused?t("ui.play.highlights.5d8b3cb"):t("ui.pause.highlights.ec965d1")} onClick={()=>setPaused(p=>!p)}>{paused||reduced?<Play size={16}/>:<Pause size={16}/>}</button>{slides.map((slide,i)=><button type="button" key={slide.id} aria-label={t("ui.show.value.146f0e8", {v0: slide.title})} aria-pressed={index===i} onClick={()=>{setIndex(i);setPaused(true);}}><span/></button>)}</div>}
  </>;
}
