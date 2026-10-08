import { translateText, t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Check, Loader2, CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TripNavigation, PageHeading } from '@/components/trip/TripUI';
export const STEPS=[
 {key:'trip',label:'Trip',desc:'Destination, dates & travelers'},
 {key:'stay',label:'Stay',desc:'Accommodation & arrival'},
 {key:'preferences',label:'Preferences',desc:'Pace, interests & daily windows'},
 {key:'places',label:'planner.places',desc:'planner.placesDescription',sidebarDesc:'planner.placesSidebarDescription'},
 {key:'finalize',label:'Itinerary & tickets',desc:'Build your schedule & review bookings'},
];
export default function WizardShell({tripId,trip,step,setStep,saving,children,onPrev,onNext,nextLabel,canNext=true,beforeNavigate=null,onUpdated=null,states=[],saveError=''}) {
  useLocale();
 const current=STEPS[step];
 const mobileSteps=useRef(null);
 useEffect(()=>{
  const nav=mobileSteps.current;
  const reveal=()=>{const button=nav?.querySelector('[aria-current="step"]');if(nav?.clientWidth&&button){const n=nav.getBoundingClientRect(),b=button.getBoundingClientRect();nav.scrollTo({left:nav.scrollLeft+b.left-n.left-(n.width-b.width)/2});}};
  reveal();const observer=new ResizeObserver(reveal);if(nav)observer.observe(nav);return()=>observer.disconnect();
 },[step]);
 const stepButton=(entry,index,compact=false)=><button key={entry.key} data-plan-step={index} aria-current={index===step?'step':undefined} aria-label={`${entry.key==='places'?t(entry.label):translateText(entry.label)}${states[index]==='complete'?', completed':states[index]==='missing'?', needs details':''}`} onClick={()=>setStep(index)} disabled={saving} className={`planning-step ${compact?'compact':''} ${index===step?'active':''} ${states[index]==='complete'?'complete':''}`}><span className="planning-step-indicator">{states[index]==='complete'?<Check size={14}/>:index+1}</span><span><span className="font-semibold">{entry.key==='places'?t(entry.label):translateText(entry.label)}</span>{!compact&&<span className="planning-step-description">{entry.key==='places'?t(entry.sidebarDesc||entry.desc):translateText(entry.desc)}</span>}</span></button>;
 return <div className="trip-experience pb-28"><TripNavigation trip={trip} beforeNavigate={beforeNavigate} onUpdated={onUpdated}/>
  <div className="trip-container pt-7"><PageHeading eyebrow={trip.name} title={t("ui.update.plan.592acaa")} description={t("ui.a.little.planning.a.better.journey.f1acde0")}><span role="status" className={`flex items-center gap-2 text-sm ${saveError?'text-red-300':'text-white/60'}`}>{saving?<Loader2 size={15} className="animate-spin"/>:saveError?<CircleAlert size={15}/>:<Check size={15} className="text-emerald-300"/>}{saving?t("ui.saving.23e3929"):saveError?t("ui.changes.not.saved.53e0a62"):t("ui.saved.b5c120b")}</span></PageHeading>
  <header ref={mobileSteps} className="lg:hidden overflow-x-auto mb-5"><nav className="flex gap-1" aria-label={t("ui.planning.steps.b3a0f57")}>{STEPS.map((entry,index)=>stepButton(entry,index,true))}</nav></header>
  <div className="grid lg:grid-cols-[240px_minmax(0,780px)] gap-8 justify-center items-start">
   <aside className="planning-guide hidden lg:block sticky top-40"><p className="trip-eyebrow mb-3 px-3">{t("ui.your.planning.guide.0bec082")}</p><nav aria-label={t("ui.planning.steps.b3a0f57")}>{STEPS.map((entry,index)=>stepButton(entry,index))}</nav></aside>
   <main className="trip-card trip-form min-w-0"><p className="trip-eyebrow">{t("ui.step.8e6a6cc")}{" "}{step+1}{" "}{t('planner.ofFive')}</p><h2 className="text-2xl font-heading font-bold mt-2">{current.key==='places'?t(current.label):translateText(current.label)}</h2><p className="trip-muted mt-2 mb-7">{current.key==='places'?t(current.desc):translateText(current.desc)}</p>{children}</main>
  </div></div>
  <footer className="fixed bottom-0 inset-x-0 z-30 bg-[#111216]/95 backdrop-blur border-t border-white/10 py-3"><div className="trip-container flex items-center justify-between gap-3"><button className="trip-button secondary" disabled={step===0||saving} onClick={onPrev}>{t("ui.back.76900f1")}</button><span className="trip-muted hidden sm:block">{t("ui.step.8e6a6cc")}{" "}{step+1}{" "}{t('planner.ofFive')}{" "}{current.key==='places'?t(current.label):translateText(current.label)}</span><button className="trip-button primary" disabled={!canNext} onClick={onNext}>{nextLabel||t("ui.save.continue.b75e6d0")}</button></div></footer>
 </div>;
}
