import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/api/client';

export default function PlacePhotos({ placeId, name, limit = 4 }) {
  const [photos,setPhotos]=useState([]),[active,setActive]=useState(null),[failed,setFailed]=useState([]);
  const root=useRef(null),touch=useRef(null);
  useEffect(()=>{
    setPhotos([]);setFailed([]);if(!placeId)return;
    const abort=new AbortController();let loaded=false;
    const observer=new IntersectionObserver(entries=>{if(!loaded&&entries.some(entry=>entry.isIntersecting)){loaded=true;api.places.photos(placeId,abort.signal).then(result=>setPhotos(result.photos)).catch(()=>{});observer.disconnect();}});
    observer.observe(root.current);return()=>{abort.abort();observer.disconnect();};
  },[placeId]);
  const visible=photos.filter((_,index)=>!failed.includes(index)).slice(0,limit);
  const move=direction=>setActive(index=>(index+direction+visible.length)%visible.length);
  const attribution=photo=><p className="text-xs text-white/60 mt-1">Google Maps · {photo.authors.map((author,index)=>author.url?<a key={index} href={author.url} target="_blank" rel="noopener noreferrer" className="underline mr-2">{author.name}</a>:<span key={index}>{author.name} </span>)}{photo.source&&<a className="underline" href={photo.source} target="_blank" rel="noopener noreferrer">View source</a>}</p>;
  return <div ref={root}>{visible.length>0&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{visible.map((photo,index)=><figure key={photo.url}><button className="w-full rounded-lg overflow-hidden focus-visible:ring-2 focus-visible:ring-lime" aria-label={`View photo ${index+1} of ${name}`} onClick={()=>setActive(index)}><img loading="lazy" src={photo.url} alt={`${name} · photo ${index+1}`} className="h-24 w-full object-cover hover:brightness-110" onError={()=>{setFailed(old=>[...old,photos.indexOf(photo)]);setActive(null);}}/></button>{attribution(photo)}</figure>)}</div>}
    <Dialog open={active!==null&&!!visible[active]} onOpenChange={open=>{if(!open)setActive(null);}}><DialogContent className="trip-modal max-w-4xl w-[95vw]" onKeyDown={event=>{if(event.key==='ArrowRight')move(1);if(event.key==='ArrowLeft')move(-1);}}><DialogTitle>{name}</DialogTitle><DialogDescription className="text-white/60">Place photos from Google Maps</DialogDescription>{active!==null&&visible[active]&&<><img src={visible[active].url} alt={name} className="max-h-[65dvh] w-full object-contain" onTouchStart={event=>{touch.current=event.touches[0].clientX;}} onTouchEnd={event=>{const delta=event.changedTouches[0].clientX-touch.current;if(Math.abs(delta)>50)move(delta<0?1:-1);}}/>{attribution(visible[active])}<div className="flex justify-between items-center"><button className="trip-button secondary" disabled={visible.length<2} onClick={()=>move(-1)}>Previous photo</button><span>{active+1} / {visible.length}</span><button className="trip-button secondary" disabled={visible.length<2} onClick={()=>move(1)}>Next photo</button></div></>}</DialogContent></Dialog>
  </div>;
}
