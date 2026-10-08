import {useEffect} from 'react';
import {api} from '@/api/client';
import {useLocale} from './react';
import {setGeneratedTranslations} from './runtime';
export default function GeneratedContent({tripId,version=''}){
 const locale=useLocale();
 useEffect(()=>{
  let active=true,sequence=0;setGeneratedTranslations({});
  const refresh=passport=>{const current=++sequence;api.localizeTrip(tripId,passport).then(data=>{if(active&&current===sequence)setGeneratedTranslations(data.translations,true);}).catch(()=>{});};
  const changed=event=>{if(event.detail.tripId===tripId)refresh(event.detail.passport);};
  let passport=null;try{passport=localStorage.getItem('tripnexa.passport-country');}catch{}
  refresh(passport);window.addEventListener('generated-content-changed',changed);
  return()=>{active=false;window.removeEventListener('generated-content-changed',changed);setGeneratedTranslations({});};
 },[tripId,locale,version]);
 return null;
}
