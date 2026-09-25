import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Compass, LayoutDashboard, CalendarCheck, Route, Wallet, Share2, ArrowUpRight, Loader2 } from 'lucide-react';
import ShareDialog from './ShareDialog';
import { dateRange } from '@/lib/trip-presentation';

export function TripNavigation({ trip, beforeNavigate = null, onUpdated = null, actions = null }) {
  const [share,setShare] = useState(false), [error,setError] = useState('');
  const navigate=useNavigate();
  const go=async(event,to)=>{if(!beforeNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;event.preventDefault();try{await beforeNavigate();navigate(to);}catch(failure){setError(failure.message);}};
  const base='/trip/'+trip.id;
  return <header className="trip-navigation">
    <div className="trip-container">
      <div className="flex items-center justify-between gap-4 py-3">
        <Link to="/?trips=1" onClick={event=>go(event,'/?trips=1')} className="flex items-center gap-2 shrink-0" aria-label="TripSync · Back to trips"><span className="rounded-xl bg-lime text-neutral-950 p-2"><Compass size={19}/></span><span className="font-heading font-black text-xl tracking-tight">TripSync.</span></Link>
        <p className="hidden sm:block truncate text-sm text-white/60">{trip.name}</p>
        <div className="flex flex-wrap justify-end gap-2"><Link to="/?trips=1" onClick={event=>go(event,'/?trips=1')} className="trip-button secondary">Trips</Link><button className="trip-button secondary" onClick={async()=>{try{await beforeNavigate?.();setShare(true);}catch(failure){setError(failure.message);}}}><Share2 size={15}/>Share</button>{actions}</div>
      </div>
      <nav aria-label="Trip navigation" className="grid grid-cols-4 gap-1 pb-3 sm:flex sm:gap-2">{[{path:'',label:'Overview',Icon:LayoutDashboard},{path:'/plan',label:'Update Plan',Icon:CalendarCheck},{path:'/itinerary',label:'Itinerary',Icon:Route},{path:'/wallet',label:'Travel Wallet',Icon:Wallet}].map(({path,label,Icon})=><NavLink end key={path} to={base+path} onClick={event=>go(event,base+path)} className={({isActive})=>`trip-nav-link ${isActive?'selected':''}`}><Icon size={16}/><span>{label}</span></NavLink>)}</nav>
      {error&&<p role="alert" className="text-red-300 pb-3 text-sm">{error}</p>}
    </div>
    <ShareDialog trip={trip} open={share} onClose={()=>setShare(false)} onUpdated={onUpdated || (()=>{})}/>
  </header>;
}
export function StatusBadge({label,tone='muted'}) {return <span className={`trip-status ${tone}`}><span aria-hidden="true">●</span>{label}</span>;}
export function PageHeading({eyebrow,title,description,children=null}) {return <div className="flex flex-wrap items-end justify-between gap-4 mb-7"><div className="min-w-0"><p className="trip-eyebrow">{eyebrow}</p><h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight mt-2 break-words">{title}</h1>{description&&<p className="trip-muted mt-2">{description}</p>}</div>{children}</div>;}
export function SummaryCard({icon:Icon,title,to,children}) {return <Link to={to} className="trip-card trip-card-link block"><div className="flex justify-between items-center mb-4"><span className="flex items-center gap-2 trip-muted"><Icon size={17}/>{title}</span><ArrowUpRight size={16} className="text-white/40"/></div>{children}</Link>;}
export function EmptyState({icon:Icon=Route,title,description,children=null}) {return <div className="trip-empty"><Icon size={27} className="text-lime mb-4"/><h2 className="font-semibold text-lg">{title}</h2><p className="trip-muted max-w-md mt-2 mb-5">{description}</p>{children}</div>;}
export function TripLoading({error='',retry=null}) {return <div className="trip-experience min-h-screen grid place-items-center p-6"><div role={error?'alert':'status'} className="trip-card max-w-md text-center">{error?<><p>{error}</p>{retry&&<button className="trip-button secondary mt-4" onClick={retry}>Try again</button>}</>:<><Loader2 className="animate-spin mx-auto mb-3 text-lime"/>Loading your trip…</>}<Link className="block trip-link mt-4" to="/?trips=1">Back to trips</Link></div></div>;}
export function TripSubtitle({trip}) {return <span>{[trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', ')} · {dateRange(trip)}</span>;}
