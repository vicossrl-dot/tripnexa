import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {api} from '@/api/client';
export default function CustomizeItinerary(){
  useLocale();
 const {publicId}=useParams(),navigate=useNavigate(),started=useRef(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(true);
 async function copy(){setBusy(true);setError('');try{const result=await api.customizeItinerary(publicId);navigate(result.redirect,{replace:true});}catch(e){setError(e.message);setBusy(false);}}
 useEffect(()=>{if(!started.current){started.current=true;copy();}},[publicId]);
 return <main className="min-h-screen grid place-items-center p-6 bg-stone-50"><section className="max-w-xl space-y-5 rounded-2xl border bg-white p-8"><p className="text-sm uppercase tracking-widest text-stone-500">{t("ui.your.next.trip.c0acc7d")}</p><h1 className="text-3xl font-semibold">{t("ui.make.this.itinerary.yours.713a82f")}</h1>{busy?<p role="status">{t("ui.creating.your.private.copy.d50d67c")}</p>:<><p role="alert">{translateText(error)}</p><button className="rounded-lg bg-neutral-900 text-white px-5 py-3" onClick={copy}>{t("ui.try.again.d8b8392")}</button></>}<p>{t("ui.your.dates.accommodation.and.personal.travel.details.are.yours.to.7527da0")}</p><Link className="underline inline-flex min-h-11 items-center" to="/pricing">{t("ui.see.available.plans.0ef4545")}</Link><a className="underline block" href="https://tripnexa.app/trip-examples/">{t("ui.back.to.trip.examples.c3c7af2")}</a></section></main>;
}
