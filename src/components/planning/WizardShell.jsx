import { Check, Loader2, CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TripNavigation, PageHeading } from '@/components/trip/TripUI';
export const STEPS=[
 {key:'trip',label:'Trip',desc:'Destination, dates & travelers'},
 {key:'stay',label:'Stay',desc:'Accommodation & arrival'},
 {key:'preferences',label:'Preferences',desc:'Pace, interests & daily windows'},
 {key:'places',label:'Desired places',desc:'Your must-see locations'},
 {key:'suggestions',label:'Suggestions',desc:'Additional ideas for your trip'},
 {key:'finalize',label:'Itinerary & tickets',desc:'Build your schedule & review bookings'},
];
export default function WizardShell({tripId,trip,step,setStep,saving,children,onPrev,onNext,nextLabel,canNext=true,beforeNavigate=null,onUpdated=null,states=[],saveError=''}) {
 const current=STEPS[step];
 const mobileSteps=useRef(null);
 useEffect(()=>{
  const nav=mobileSteps.current,button=nav?.querySelector('[aria-current="step"]');
  if(nav?.clientWidth&&button){const n=nav.getBoundingClientRect(),b=button.getBoundingClientRect();nav.scrollTo({left:nav.scrollLeft+b.left-n.left-(n.width-b.width)/2});}
 },[step]);
 const stepButton=(entry,index,compact=false)=><button key={entry.key} data-plan-step={index} aria-current={index===step?'step':undefined} aria-label={`${entry.label}${states[index]==='complete'?', completed':states[index]==='missing'?', needs details':''}`} onClick={()=>setStep(index)} disabled={saving} className={`flex ${compact?'items-center whitespace-nowrap':'items-start w-full text-left'} gap-3 rounded-xl p-3 text-sm transition-colors ${index===step?'bg-lime/10 text-lime border border-lime/30':'border border-transparent text-white/65 hover:bg-white/5'}`}><span className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${index===step?'bg-lime text-neutral-950':'bg-white/5'}`}>{states[index]==='complete'?<Check size={14}/>:states[index]==='missing'?<CircleAlert size={14}/>:index+1}</span><span><span className="font-semibold">{entry.label}</span>{!compact&&<span className="block text-xs text-white/50 mt-1">{entry.desc}</span>}</span></button>;
 return <div className="trip-experience pb-28"><TripNavigation trip={trip} beforeNavigate={beforeNavigate} onUpdated={onUpdated}/>
  <div className="trip-container pt-7"><PageHeading eyebrow={trip.name} title="Update Plan" description="A little planning. A better journey."><span role="status" className={`flex items-center gap-2 text-sm ${saveError?'text-red-300':'text-white/60'}`}>{saving?<Loader2 size={15} className="animate-spin"/>:saveError?<CircleAlert size={15}/>:<Check size={15} className="text-emerald-300"/>}{saving?'Saving…':saveError?'Changes not saved':'Saved'}</span></PageHeading>
  <header ref={mobileSteps} className="lg:hidden overflow-x-auto mb-5"><nav className="flex gap-1" aria-label="Planning steps">{STEPS.map((entry,index)=>stepButton(entry,index,true))}</nav></header>
  <div className="grid lg:grid-cols-[240px_minmax(0,780px)] gap-8 justify-center items-start">
   <aside className="hidden lg:block sticky top-40"><p className="trip-eyebrow mb-3 px-3">Your planning guide</p><nav aria-label="Planning steps">{STEPS.map((entry,index)=>stepButton(entry,index))}</nav></aside>
   <main className="trip-card trip-form min-w-0"><p className="trip-eyebrow">Step {step+1} of 6</p><h2 className="text-2xl font-heading font-bold mt-2">{current.label}</h2><p className="trip-muted mt-2 mb-7">{current.desc}</p>{children}</main>
  </div></div>
  <footer className="fixed bottom-0 inset-x-0 z-30 bg-[#111216]/95 backdrop-blur border-t border-white/10 py-3"><div className="trip-container flex items-center justify-between gap-3"><button className="trip-button secondary" disabled={step===0||saving} onClick={onPrev}>Back</button><span className="trip-muted hidden sm:block">Step {step+1} of 6 · {current.label}</span><button className="trip-button primary" disabled={!canNext} onClick={onNext}>{nextLabel||'Save & continue'}</button></div></footer>
 </div>;
}
