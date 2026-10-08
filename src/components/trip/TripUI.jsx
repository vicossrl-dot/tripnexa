import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Compass, LayoutDashboard, CalendarCheck, Route, Wallet, Share2, ArrowUpRight, Loader2 } from 'lucide-react';
import ShareDialog from './ShareDialog';
import LanguageButton from '@/components/LanguageButton';
import GeneratedContent from '@/i18n/GeneratedContent';
import { dateRange } from '@/lib/trip-presentation';
import BrandMark from '@/components/BrandMark';
import {usePublicSettings} from '@/lib/PublicSettingsContext';

export function TripNavigation({ trip, beforeNavigate = null, onUpdated = null, actions = null }) {
  useLocale();
  const [share,setShare] = useState(false), [error,setError] = useState('');
  const {branding}=usePublicSettings();
  const navigate=useNavigate();
  const go=async(event,to)=>{if(!beforeNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;event.preventDefault();try{await beforeNavigate();navigate(to);}catch(failure){setError(failure.message);}};
  const base='/trip/'+trip.id;
  return <header className="trip-navigation">
    <GeneratedContent tripId={trip.id} version={trip.updated_date||''}/>
    <div className="trip-container">
      <div className="trip-navigation-heading py-3">
        <Link to="/?trips=1" onClick={event=>go(event,'/?trips=1')} className="flex items-center gap-2 shrink-0" aria-label={t("ui.value.back.to.trips.faa1810", {v0: branding.appName})}><BrandMark className="h-8 max-w-40 object-contain shrink-0" fallback={mark=><><span className="rounded-xl bg-lime text-neutral-950 p-2"><Compass size={19}/></span><span className="font-heading font-black text-xl tracking-tight">{mark.wordmark}</span></>}/></Link>
        <div className="trip-wordmark" title={trip.name}><span className="trip-wordmark-caption">{t("ui.your.journey.35ee1ca")}</span><p>{trip.name}</p></div>
        <div className="flex flex-wrap justify-end gap-2"><Link to="/?trips=1" onClick={event=>go(event,'/?trips=1')} className="trip-button secondary">{t("ui.trips.86bbcd7")}</Link><button className="trip-button secondary" onClick={async()=>{try{await beforeNavigate?.();setShare(true);}catch(failure){setError(failure.message);}}}><Share2 size={15}/>{t("ui.share.29887a5")}</button><Link to="/profile" onClick={event=>go(event,'/profile')} className="trip-button secondary">{t("ui.account.7e1b0d5")}</Link><LanguageButton/>{actions}</div>
      </div>
      <nav aria-label={t("ui.trip.navigation.2751c01")} className="trip-section-nav grid grid-cols-4 gap-1 pb-3 sm:flex sm:gap-2">{[{path:'',label:"Overview",Icon:LayoutDashboard},{path:'/plan',label:"Update Plan",Icon:CalendarCheck},{path:'/itinerary',label:"Itinerary",Icon:Route},{path:'/wallet',label:"Travel Wallet",Icon:Wallet}].map(({path,label,Icon})=><NavLink end key={path} to={base+path} onClick={event=>go(event,base+path)} className={({isActive})=>`trip-nav-link ${isActive?'selected':''}`}><Icon size={16}/><span>{translateText(label)}</span></NavLink>)}</nav>
      {error&&<p role="alert" className="text-red-300 pb-3 text-sm">{translateText(error)}</p>}
    </div>
    <ShareDialog trip={trip} open={share} onClose={()=>setShare(false)} onUpdated={onUpdated || (()=>{})}/>
  </header>;
}
export function StatusBadge({label,tone='muted'}) {
  useLocale();return <span className={`trip-status ${tone}`}><span aria-hidden="true">●</span>{translateText(label)}</span>;}
export function PageHeading({eyebrow,title,description,children=null}) {
  useLocale();return <div className="flex flex-wrap items-end justify-between gap-4 mb-7"><div className="min-w-0"><p className="trip-eyebrow">{translateText(eyebrow)}</p><h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight mt-2 break-words">{translateText(title)}</h1>{description&&<p className="trip-muted mt-2">{translateText(description)}</p>}</div>{children}</div>;}
export function SummaryCard({icon:Icon,title,to,children}) {
  useLocale();return <Link to={to} className="trip-card trip-card-link block"><div className="flex justify-between items-center mb-4"><span className="flex items-center gap-2 trip-muted"><Icon size={17}/>{translateText(title)}</span><ArrowUpRight size={16} className="text-white/40"/></div>{children}</Link>;}
export function EmptyState({icon:Icon=Route,title,description,children=null}) {
  useLocale();return <div className="trip-empty"><Icon size={27} className="text-lime mb-4"/><h2 className="font-semibold text-lg">{translateText(title)}</h2><p className="trip-muted max-w-md mt-2 mb-5">{translateText(description)}</p>{children}</div>;}
export function TripLoading({error='',retry=null}) {
  useLocale();return <div className="trip-experience min-h-screen grid place-items-center p-6"><div role={error?'alert':'status'} className="trip-card max-w-md text-center">{error?<><p>{translateText(error)}</p>{retry&&<button className="trip-button secondary mt-4" onClick={retry}>{t("ui.try.again.d8b8392")}</button>}</>:<><Loader2 className="animate-spin mx-auto mb-3 text-lime"/>{t("ui.loading.your.trip.17a1a8b")}</>}<Link className="block trip-link mt-4" to="/?trips=1">{t("ui.back.to.trips.8cd3ec1")}</Link></div></div>;}
export function TripSubtitle({trip}) {
  useLocale();return <span>{[trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', ')} · {dateRange(trip)}</span>;}
