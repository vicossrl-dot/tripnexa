import { t, translateText, getLocale } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import {createContext,useContext,useEffect,useState,useRef} from 'react';
import {Download,CalendarPlus,FileText,BookOpen,LockKeyhole,ArrowUpRight,Compass,RefreshCw,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {api} from '@/api/client';
import {tripDates,dateRange,friendlyDate} from '@/lib/trip-presentation';
import {localizedCountryOptions,countryCode,countryName} from '@/lib/country-codes';
import {essentialsAbout,guidanceForSection,visibleEssentialsSections,verifiedTravelNotices,incompleteEssentialsMessage,essentialsUpdateMessage} from '@/lib/essentials-guidance';
import {essentialsWaitMessage} from '@/lib/essentials-updates';
import '@/styles/premium-trip-features.css';

const passportKey='tripnexa.passport-country';
function savedPassport(){try{return countryCode(localStorage.getItem(passportKey))||'';}catch{return '';}}
/** @type {import('react').Context<{premium:boolean|null,destination:string,open:(view:string)=>void,error:string,reload:()=>void}|null>} */
const Context=createContext(null);

export function PremiumTripFeatures({trip,plan,children}){
  const locale=useLocale();
 const [access,setAccess]=useState(null),[accessError,setAccessError]=useState(''),[attempt,setAttempt]=useState(0),[view,setView]=useState(null);
 const [passport,setPassport]=useState(savedPassport),[essentials,setEssentials]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [limitClock,setLimitClock]=useState(Date.now());
 const updates=essentials?.updates,limitReached=!!updates?.blocked&&(!updates.nextAllowedAt||Date.parse(updates.nextAllowedAt)>limitClock);
 useEffect(()=>{
  if(view!=='essentials'||!updates)return;
  const serverTime=Date.parse(updates.serverTime),started=performance.now();
  const tick=()=>setLimitClock((Number.isFinite(serverTime)?serverTime:Date.now())+performance.now()-started);
  tick();if(!updates.blocked)return;const timer=setInterval(tick,1000);return()=>clearInterval(timer);
 },[view,updates]);
 const [selected,setSelected]=useState([]),[scope,setScope]=useState('all'),[transfers,setTransfers]=useState(true);
 const restore=useRef(null),dates=tripDates(trip,plan),premium=access?Boolean(access.premium):null;
 const passportRef=useRef(passport),essentialsVersion=useRef(0),essentialsInFlight=useRef(null);
 const [downloadingEssentials,setDownloadingEssentials]=useState(false);
 useEffect(()=>{let active=true;setAccess(null);setAccessError('');api.billing(`/trips/${encodeURIComponent(trip.id)}`).then(value=>{if(active)setAccess(value);}).catch(()=>{if(active)setAccessError('Premium access could not be checked. Please retry.');});return()=>{active=false;};},[trip.id,attempt]);
 useEffect(()=>{const unlocked=()=>setAttempt(value=>value+1),paywall=()=>setView(null);window.addEventListener('billing-unlocked',unlocked);window.addEventListener('billing-required',paywall);return()=>{window.removeEventListener('billing-unlocked',unlocked);window.removeEventListener('billing-required',paywall);};},[]);
 useEffect(()=>{if(view!=='essentials'||!premium)return;if(essentialsInFlight.current===null)loadSavedEssentials(passportRef.current);return()=>{essentialsVersion.current++;essentialsInFlight.current=null;setBusy(false);};},[view,trip.id,premium,locale]);
 function unlocked(feature){
  if(premium===null){setError(accessError||'Checking premium access…');return false;}
  if(premium)return true;
  setView(null);setTimeout(()=>window.dispatchEvent(new CustomEvent('billing-required',{detail:{code:'PREMIUM_FEATURE_REQUIRED',feature,tripId:trip.id,allowTripPack:true,error:'Unlock Calendar, Before You Go and both PDF formats with Pro or a premium trip credit.'}})),0);return false;
 }
 function open(next){if(!view)restore.current=document.activeElement;setError('');setNotice('');if(next==='download'||unlocked(next==='calendar'?'calendar_exports':'destination_essentials'))setView(next);}
 function loadSavedEssentials(country){const version=++essentialsVersion.current;setEssentials(null);setError('');api.tripEssentials(trip.id,country||null).then(value=>{if(version===essentialsVersion.current)setEssentials(value);}).catch(failure=>{if(version===essentialsVersion.current)setError(failure.message);});}
 async function refreshEssentials(country=passportRef.current){
  if(essentialsInFlight.current!==null)return;
  const version=++essentialsVersion.current;essentialsInFlight.current=version;setBusy(true);setError('');setNotice('');
  try{const result=await api.refreshTripEssentials(trip.id,country||null);if(version===essentialsVersion.current){setEssentials(result);setNotice(result.code==='ESSENTIALS_DAILY_LIMIT'?'':essentialsUpdateMessage(result));}}
  catch(failure){if(version===essentialsVersion.current)setError(failure.message);}
  finally{if(essentialsInFlight.current===version)essentialsInFlight.current=null;if(version===essentialsVersion.current)setBusy(false);}
 }
 function choosePassport(value){
  if(value===passportRef.current||essentialsInFlight.current!==null)return;
  passportRef.current=value;setPassport(value);setNotice('');setError('');setEssentials(previous=>previous?{...previous,travelerPassportCountry:value||null,verification:{status:'unavailable'},countries:previous.countries.map(country=>({...country,sections:country.sections.map(section=>['entryDocuments'].includes(section.key)?{...section,facts:[]}:section)}))}:null);
  try{value?localStorage.setItem(passportKey,value):localStorage.removeItem(passportKey);}catch{/* Passport selection remains usable with storage blocked. */}
  if(value)void refreshEssentials(value);else loadSavedEssentials('');
 }
 async function downloadEssentials(){
  if(!unlocked('destination_essentials'))return;setBusy(true);setDownloadingEssentials(true);setError('');setNotice('');
  try{await api.downloadEssentialsPdf(trip.id,essentials?.cachedForDifferentContext?essentials.cachedPassportCountry:passportRef.current||null);setNotice('Your Essentials PDF is ready.');}catch(failure){setError(failure.message);}finally{setBusy(false);setDownloadingEssentials(false);}
 }
 async function download(format){if(!unlocked(format==='calendar'?'calendar_exports':'pdf_exports'))return;setBusy(true);setError('');setNotice('');try{
  const result=format==='calendar'?await api.downloadCalendar(trip.id,{days:scope==='selected'?selected:[],includeTransfers:transfers}):await api.downloadItinerary(trip.id,{format,passport:passport||null});
  setNotice(result.skipped?`Calendar downloaded. ${result.skipped} activities without a complete time range were omitted.`:'Your download is ready.');
 }catch(failure){setError(failure.message);}finally{setBusy(false);}}
 const lockedIcon=premium===false?<LockKeyhole size={16} aria-hidden="true"/>:null;
 return <Context.Provider value={{premium,destination:trip.country||trip.destination||'Destination',open,error:accessError,reload:()=>setAttempt(value=>value+1)}}>{children}
  <Dialog open={Boolean(view)} onOpenChange={value=>{if(!value&&!busy)setView(null);}}>
   <DialogContent className="trip-modal premium-trip-dialog" onCloseAutoFocus={event=>{event.preventDefault();restore.current?.focus({preventScroll:true});}}>
    <header><DialogTitle>{view==='calendar'?t("ui.add.to.calendar.f5d6ae7"):view==='essentials'?t("ui.before.you.go.f849009"):t("ui.download.your.trip.4aef9a8")}</DialogTitle><DialogDescription>{[trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', ')} · {dateRange(trip)}</DialogDescription></header>
    {accessError&&<div role="status"><p>{accessError}</p><button className="trip-button secondary" onClick={()=>setAttempt(value=>value+1)}>{t("ui.retry.access.check.8cda64d")}</button></div>}
    {error&&<p role="alert" className="premium-error">{translateText(error)}</p>}{notice&&<p role="status" className="premium-notice">{translateText(notice)}</p>}
    {view==='download'&&<div className="trip-export-options">
     <article><FileText size={22} aria-hidden="true"/><h3>{t("ui.quick.itinerary.bf144ce")}</h3><p>{t("ui.a.compact.schedule.for.easy.reference.fast.clean.and.print.friend.af0f470")}</p><button className="trip-button primary" disabled={busy||premium===null||!plan.items.length} onClick={()=>download('quick')}>{lockedIcon}{busy?t("ui.preparing.download.f40b15a"):t("ui.download.quick.pdf.0bfd862")}</button></article>
     <article><BookOpen size={22} aria-hidden="true"/><h3>{t("ui.full.travel.book.e07eec1")}</h3><p>{t("ui.day.maps.live.routes.booking.summaries.and.source.checked.essenti.5cfe074")}</p><button className="trip-button primary" disabled={busy||premium===null||!plan.items.length} onClick={()=>download('full')}>{lockedIcon}{busy?t("ui.preparing.download.f40b15a"):t("ui.download.full.travel.book.01e33c7")}</button></article>
     <article className="calendar-export-option"><CalendarPlus size={22} aria-hidden="true"/><h3>{t("ui.add.to.calendar.f5d6ae7")}</h3><p>{t("ui.add.your.saved.itinerary.to.google.calendar.apple.calendar.or.out.38deec5")}</p><button className="trip-button secondary" disabled={busy||premium===null||!plan.items.length} onClick={()=>open('calendar')}>{lockedIcon}{t("ui.add.to.calendar.f5d6ae7")}</button></article>
     {!plan.items.length&&<p className="premium-hint">{t("ui.generate.a.saved.itinerary.before.exporting.7e5381e")}</p>}
     {premium===false&&<p className="premium-hint">{t("ui.all.three.exports.are.included.with.premium.trip.access.a2839d4")}</p>}
    </div>}
    {view==='calendar'&&<div className="calendar-options">
     <p>{t("ui.add.your.saved.itinerary.to.google.calendar.apple.calendar.or.out.38deec5")}</p>
     {plan.stale&&<p className="premium-hint">{t("ui.your.saved.itinerary.has.pending.changes.the.calendar.will.use.th.f06c45f")}</p>}
     <fieldset><legend>{t("ui.what.would.you.like.to.add.d3721e7")}</legend><label><input type="radio" name="calendar-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>{t("ui.entire.trip.8682a8a")}</label><label><input type="radio" name="calendar-scope" checked={scope==='selected'} onChange={()=>setScope('selected')}/>{t("ui.selected.day.s.fab23aa")}</label></fieldset>
     {scope==='selected'&&<div className="calendar-days">{dates.map((date,index)=><label key={date}><input type="checkbox" checked={selected.includes(date)} onChange={event=>setSelected(values=>event.target.checked?[...values,date]:values.filter(value=>value!==date))}/>{t("ui.day.8f2364e")}{" "}{index+1} · {friendlyDate(date)}</label>)}</div>}
     <label><input type="checkbox" checked={transfers} onChange={event=>setTransfers(event.target.checked)}/>{t("ui.include.transfers.796426a")}</label>
     <p className="premium-hint">{t("ui.this.exports.your.currently.saved.itinerary.if.you.later.change.y.c70805d")}</p>
     <p className="premium-hint">{t("ui.private.notes.booking.credentials.and.original.documents.are.not.20e7be8")}</p>
     <button className="trip-button primary" disabled={busy||scope==='selected'&&!selected.length} onClick={()=>download('calendar')}>{busy?t("ui.preparing.calendar.c4f4072"):t("ui.download.ics.870cdf0")}</button>
     <button className="trip-button secondary" disabled={busy} onClick={()=>setView('download')}>{t("ui.all.downloads.5d64553")}</button>
    </div>}
    {view==='essentials'&&<div className="destination-essentials">
     <label className="passport-country">{t("ui.what.passport.will.you.travel.with.f88b465")}<span className="premium-hint">{t("ui.choose.passport.country.a22b3ee")}</span><select disabled={busy} value={passport} onChange={event=>choosePassport(event.target.value)}><option value="">{t("ui.choose.passport.country.a22b3ee")}</option>{localizedCountryOptions(getLocale()).map(country=><option key={country.code} value={country.code}>{country.name}</option>)}</select><small>{t("ui.only.a.country.code.is.saved.departure.country.does.not.determine.9ddc9da")}</small></label>
     {busy?<div className="essentials-loading" role="status" aria-live="polite" aria-atomic="true"><LoaderCircle className="essentials-spinner" size={24} strokeWidth={2.5} aria-hidden="true"/><div><p>{downloadingEssentials?t("ui.preparing.essentials.pdf.7c24889"):t("ui.preparing.your.travel.essentials.cc91a04")}</p>{essentials?.generatedAt&&!downloadingEssentials&&<small>{t("ui.your.previous.guide.stays.visible.while.the.update.is.prepared.f0ec222")}</small>}</div></div>:!essentials&&!error&&<p role="status">{t("ui.loading.saved.essentials.53571e3")}</p>}
     {essentials?.stale&&<p className="premium-hint">{t("ui.this.saved.guide.is.over.24.hours.old.update.information.before.t.ad79e83")}</p>}
     {!busy&&essentials?.generatedAt&&essentials?.generation?.status!=='complete'&&<p className="essentials-incomplete" role="status">{incompleteEssentialsMessage}{" "}{t("ui.use.update.information.to.prepare.a.new.brief.when.needed.5d43667")}</p>}
     {essentials?.countries?.length===0&&<p>{t("ui.set.the.destination.country.in.update.plan.to.check.travel.essent.ca10725")}</p>}
     {essentials?.countries?.map(country=><section key={country.code} className="essentials-country" aria-busy={busy&&!downloadingEssentials} data-updating={busy&&!downloadingEssentials}><h3>{country.country}{" "}{t("ui.travel.essentials.c53983b")}</h3>{passport&&<p className="essentials-context">{countryName(passport,getLocale())}{" "}{t("ui.passport.703044a")}{" "}{country.country}</p>}{verifiedTravelNotices(country).map((fact,index)=><aside className="essentials-travel-notice" key={index}><p className="trip-eyebrow">{t("ui.important.travel.notice.8a4beab")}</p><p>{translateText(fact.text)}</p><span className="essentials-verified">{t("ui.verified.79b46a9")}</span><a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">{t("ui.official.source.a0d02d2")}{" "}<ArrowUpRight size={13} aria-hidden="true"/></a><small>{t("ui.checked.37c3aeb")}{" "}{new Date(fact.verifiedAt).toLocaleDateString(getLocale())}</small></aside>)}<div className="essentials-sections">{visibleEssentialsSections(country).map(section=>{
      const facts=section.key==='entryDocuments'&&!passport?[]:section.facts;
      const authority=country.authorities?.[section.key==='entryDocuments'?'entry':'emergency'];
      return <details key={section.key} open data-generation={section.generation?.status}><summary>{translateText(section.title)}</summary>{facts.length?<ul>{facts.map((fact,index)=><li key={index}>{translateText(fact.text)}{fact.sourceType==='official'&&fact.verifiedAt&&<><span className="essentials-verified">{t("ui.verified.79b46a9")}</span><a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">{t("ui.official.source.a0d02d2")}{" "}<ArrowUpRight size={13} aria-hidden="true"/></a></>}</li>)}</ul>:guidanceForSection(section.key,passport).map(text=><p key={text}>{translateText(text)}</p>)}{['entryDocuments','emergency'].includes(section.key)&&!facts.some(fact=>fact.sourceType==='official'&&fact.verifiedAt)&&authority&&<a href={authority} target="_blank" rel="noopener noreferrer">{t("ui.check.official.b29748f")}{" "}{section.key==='entryDocuments'?t("ui.entry.guidance.2f1c2ec"):t("ui.emergency.authority.4844418")} <ArrowUpRight size={13} aria-hidden="true"/></a>}</details>;
     })}</div><details className="essentials-sources"><summary>{t("ui.official.authorities.sources.ee67280")}</summary>{country.sources.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}<ArrowUpRight size={13} aria-hidden="true"/></a>)}</details></section>)}
     {!busy&&updates&&<p className="premium-hint" role="status">{limitReached?<><strong>{t("ui.daily.update.limit.reached.56b0ad4")}</strong><br/>{translateText(essentialsWaitMessage(updates.nextAllowedAt,limitClock))}</>:updates.blocked?translateText(essentialsWaitMessage(updates.nextAllowedAt,limitClock)):t("counts.updates", {count: updates.remaining})}</p>}
     <div className="essentials-actions"><button className="trip-button secondary" disabled={busy||limitReached||!essentials?.countries?.length} onClick={()=>refreshEssentials()}><RefreshCw size={16} aria-hidden="true"/>{busy&&!downloadingEssentials?t("ui.preparing.your.travel.essentials.cc91a04"):t("ui.update.information.c613ea6")}</button><button className="trip-button primary" disabled={busy||!essentials?.generatedAt} onClick={()=>downloadEssentials()}><Download size={16} aria-hidden="true"/>{downloadingEssentials?t("ui.preparing.pdf.ada4d24"):t("ui.download.essentials.pdf.7dd37c6")}</button></div>
     <aside className="essentials-about"><p className="trip-eyebrow">{t("ui.about.this.information.e74c4f0")}</p><p>{translateText(essentialsAbout)}</p>{essentials?.generatedAt&&<p>{t("ui.last.updated.ba34a96")}{" "}{new Date(essentials.generatedAt).toLocaleString(getLocale())}</p>}</aside>
     <p className="premium-hint">{t("ui.passport.changes.update.your.guide.automatically.use.update.infor.6adf19c")}</p>
    </div>}
   </DialogContent>
  </Dialog>
 </Context.Provider>;
}
export function TripExportAction(){
  useLocale();const context=useContext(Context);if(!context)return null;return <button className="trip-button secondary" onClick={()=>context.open('download')}><Download size={16} aria-hidden="true"/>{context.premium===false&&<LockKeyhole size={14} aria-hidden="true"/>}{t("ui.download.trip.66d2b99")}</button>;}
export function BeforeYouGoCard(){
  useLocale();const context=useContext(Context);if(!context)return null;return <section className="trip-card before-you-go-card" data-before-you-go><div><p className="trip-eyebrow"><span className="before-you-go-icon"><Compass size={18} aria-hidden="true"/></span>{t("ui.before.you.go.f849009")}</p><h2>{context.destination}{" "}{t("ui.travel.essentials.c53983b")}</h2><p className="trip-muted">{t("ui.entry.documents.currency.safety.transport.local.customs.6ac06c9")}</p></div><button className="trip-button primary" disabled={context.premium===null&&!context.error} onClick={()=>context.open('essentials')}>{context.premium===false&&<LockKeyhole size={16} aria-hidden="true"/>}{t("ui.view.essentials.660f5c2")}</button>{context.error&&<p role="status">{translateText(context.error)}<button className="trip-link" onClick={context.reload}>{" "}{t("ui.retry.942087c")}</button></p>}</section>;}
