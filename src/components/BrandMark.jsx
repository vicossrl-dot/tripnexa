import { translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import {useEffect,useState} from 'react';
import {Compass} from 'lucide-react';
import {usePublicSettings} from '@/lib/PublicSettingsContext';
import {resolveBrandMark} from '@/lib/public-settings';

export default function BrandMark({className,fallback}){
  useLocale();
 const {branding}=usePublicSettings();
 const [imageFailed,setImageFailed]=useState(false);
 useEffect(()=>setImageFailed(false),[branding.logo]);
 const mark=resolveBrandMark(branding,imageFailed);
 if(mark.type==='image')return <img src={mark.src} alt={translateText(mark.alt)} className={className} onError={()=>setImageFailed(true)}/>;
 return fallback?fallback(mark):<span className="rounded-xl bg-lime text-neutral-950 p-2"><Compass size={19}/></span>;
}