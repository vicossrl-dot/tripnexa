import { t, translateText, getLocale } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
﻿import {useEffect,useState,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import AddItemModal from '@/components/trip/AddItemModal';
import {api} from '@/api/client';
import './ticket-options.css';

export async function ticketApi(path,body=undefined){
 const requestUrl='/api'+path+(body?'':(path.includes('?')?'&':'?')+'_fresh='+Date.now());
 const response=await fetch(requestUrl,{cache:'no-store',
  credentials:'same-origin',
  method:body?'POST':'GET',
  headers:{
   'X-Requested-With':'TripSync',
   'X-TripNexa-Locale':getLocale(),
   ...(body?{'Content-Type':'application/json'}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{})
 });

 const data=await response.json();

 if(!response.ok)
  throw Error(data.error||'Ticket options are temporarily unavailable.');

 return data;
}

export default function TicketOptions({
 item,
 trip,
 publicToken=null,
 onBooking=undefined
}){
  const locale=useLocale();
 const trigger=useRef(null);

 const [data,setData]=useState(null);
 const [error,setError]=useState('');
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(null);
 const [provider,setProvider]=useState('other');

 const base=publicToken
  ? `/shared/${encodeURIComponent(publicToken)}/tickets/${item.id}`
  : `/trips/${trip.id}/tickets/${item.id}`;

 async function load(){
  try{
   const d=await ticketApi(base);
   setData(d);
   onBooking?.(d.booking);
   setError('');
  }catch(e){
   setError(e.message);
  }
 }

 useEffect(()=>{
  let active=true;

  ticketApi(base)
   .then(d=>{
    if(active){
     setData(d);
     onBooking?.(d.booking);
     setError('');
    }
   })
   .catch(e=>{
    if(active)setError(e.message);
   });

  return()=>{active=false;};
 },[base,onBooking,locale]);

 async function mark(booked){
  setBusy(true);

  try{
   await ticketApi(base+'/booked',{booked,provider});
   await load();
  }catch(e){
   setError(e.message);
  }finally{
   setBusy(false);
  }
 }

 async function addTicket(){
  setBusy(true);

  try{
   const {item_id}=await ticketApi(base+'/wallet',{});
   const wallet=await api.wallet.list(trip.id);

   setEditing(
    wallet.items.find(i=>i.id===item_id)
   );

   setOpen(false);
  }catch(e){
   setError(e.message);
  }finally{
   setBusy(false);
  }
 }

 function recordClick(providerId){
  void ticketApi(
   base+'/click',
   {provider:providerId}
  ).catch(()=>{});
 }

 if(!data)
  return error&&!publicToken
   ? <button className="trip-link text-sm mt-3" onClick={load}>{t("ui.retry.ticket.options.b1c0aad")}</button>
   : null;

 if(
  !data.ticketable &&
  !data.booking?.booked &&
  !data.booking?.saved
 )return null;

 const booked=data.booking?.booked;
 const saved=data.booking?.saved;

 const hasAnyOption=data.providers.some(
  p=>p.url||(Array.isArray(p.items)&&p.items.some(item=>item.url))
 );

 return (
  <div className="mt-3 space-y-2" data-ticket-actions>

   {saved?
    <div>
     <p className="text-emerald-300 text-sm">{t("ui.ticket.saved.d074249")}</p>
     <Link
      className="trip-button primary mt-2"
      to={`/trip/${trip.id}/wallet?item=${data.booking.wallet_item_id}`}
     >{t("ui.view.ticket.631ad74")}</Link>
    </div>
    :
    booked?
     <p className="text-emerald-300 text-sm">{t("ui.booked.saved.in.your.plan.324e8bf")}</p>
     :
     null
   }

   {((!saved&&!booked)||data.ticketable)&&
    <button
     ref={trigger}
     className={`trip-button ${saved||booked?'secondary':'primary'}`}
     onClick={()=>{
      setOpen(true);
      load();
     }}
    >
     {saved||booked?t("ui.find.another.option.2ef7dad"):t("ui.tickets.tours.67b8c6a")}
    </button>
   }

   {booked&&!saved&&!publicToken&&
    <button
     disabled={busy}
     className="trip-button secondary"
     onClick={addTicket}
    >{t("ui.add.your.ticket.to.travel.wallet.f382735")}</button>
   }

   <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent
     onCloseAutoFocus={event=>{
      event.preventDefault();
      trigger.current?.focus();
     }}
     className="ticket-options-modal bg-neutral-950 text-white border-white/15 w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto"
    >
     <DialogTitle>{t("ui.tickets.tours.67b8c6a")}</DialogTitle>

     <DialogDescription className="text-white/65">{t("ui.compare.options.from.trusted.booking.partners.booking.and.payment.bac0c3e")}</DialogDescription>

     <div>
      <h3 className="text-xl font-semibold break-words">
       {data.context.name}
      </h3>

      <p className="text-sm text-white/60">
       {[data.context.city,data.context.country].filter(Boolean).join(', ')}
      </p>
     </div>

     {saved&&
      <p className="text-emerald-300">{t("ui.you.already.have.a.ticket.saved.for.this.visit.3c7d90f")}</p>
     }

     {error&&
      <p role="alert" className="text-red-300">
       {translateText(error)}
      </p>
     }

     {!hasAnyOption&&
      <p role="status">{t("ui.ticket.options.are.temporarily.unavailable.53a0682")}</p>
     }

     <div className="grid gap-3 sm:grid-cols-2">
      {data.providers.map(p=>{
       const items=Array.isArray(p.items)
        ? p.items.filter(item=>item.url)
        : [];

       const multi=items.length>0;

       return (
        <article
         key={p.provider}
         className={`rounded-xl border border-white/15 p-4 min-w-0 ${multi?'sm:col-span-2':''}`}
        >
         <div className="flex items-start justify-between gap-4">
          <div>
           <h4 className="font-semibold break-words">
            {p.name}
           </h4>

           <p className="text-sm text-white/60 mt-1">
            {multi&&p.venue_name
             ? t("ui.tickets.for.value.3849507", {v0: p.venue_name})
             : p.description}
           </p>
          </div>

          {multi&&
           <span className="text-xs text-white/45 whitespace-nowrap">
            {items.length}{" "}{t("ui.options.a793ab8")}</span>
          }
         </div>

         {multi?
          <>
           <div className="grid gap-2 mt-4 md:grid-cols-2">
            {items.map(ticket=>(
             <div
              key={ticket.id||ticket.url}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex flex-col"
             >
              <div className="flex-1">
               <p className="font-medium text-sm leading-snug">
                {translateText(ticket.title)}
               </p>

               {ticket.price_label&&
                <p className="text-sm text-white/70 mt-2">{t("ui.from.2181976")}{" "}{ticket.price_label}
                </p>
               }
              </div>

              <a
               href={ticket.url}
               target="_blank"
               rel="sponsored noopener noreferrer"
               className="trip-button primary mt-3 w-full"
               aria-label={t("ui.value.on.value.opens.in.a.new.tab.d3c906c", {v0: ticket.title, v1: p.name})}
               onClick={()=>recordClick(p.provider)}
              >{t("ui.view.ticket.2c4d900")}</a>
             </div>
            ))}
           </div>

           {p.all_url&&
            <a
             href={p.all_url}
             target="_blank"
             rel="sponsored noopener noreferrer"
             className="trip-button secondary mt-3 w-full"
             aria-label={t("ui.view.all.value.tickets.on.value.opens.in.a.new.tab.6bfa600", {v0: p.venue_name||data.context.name, v1: p.name})}
             onClick={()=>recordClick(p.provider)}
            >{t("ui.view.all.30a6421")}{" "}{p.venue_name||data.context.name}{" "}{t("ui.tickets.4bd9060")}</a>
           }
          </>
          :
          p.url?
           <a
            href={p.url}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="trip-button primary mt-4 w-full"
            aria-label={t("ui.view.value.options.opens.in.a.new.tab.ee5a2f7", {v0: p.name})}
            onClick={()=>recordClick(p.provider)}
           >{t("ui.view.options.6f9603a")}</a>
           :
           <p className="text-sm mt-3">
            {translateText(p.message)}
           </p>
         }
        </article>
       );
      })}
     </div>

     <p className="text-xs text-white/60">
      {data.disclosure}{' '}
      {data.disclosure_url&&
       <a
        className="underline"
        href={data.disclosure_url}
        target="_blank"
        rel="noopener noreferrer"
       >{t("ui.affiliate.disclosure.15ed514")}</a>
      }
     </p>

     {!publicToken&&
      <div className="border-t border-white/15 pt-4 space-y-3">
       <h4 className="font-semibold">{t("ui.already.booked.7e72523")}</h4>

       <button
        disabled={busy}
        className="trip-button primary w-full"
        onClick={addTicket}
       >{t("ui.add.your.ticket.to.travel.wallet.f382735")}</button>

       <label className="block text-sm">{t("ui.booked.with.optional.6838684")}<select
         className="block w-full bg-neutral-900 border border-white/20 rounded-lg p-3 mt-1"
         value={provider}
         onChange={e=>setProvider(e.target.value)}
        >
         {[
          ["other","Other"],
          ["getyourguide","GetYourGuide"],
          ["viator","Viator"],
          ["tiqets","Tiqets"],
          ["klook","Klook"]
         ].map(([id,name])=>
          <option key={id} value={id}>
           {translateText(name)}
          </option>
         )}
        </select>
       </label>

       {(!booked||data.booking?.declared)&&
        <button
         disabled={busy}
         className="trip-button secondary w-full"
         onClick={()=>mark(!data.booking?.declared)}
        >
         {data.booking?.declared
          ? t("ui.remove.my.booked.mark.5c858fc")
          : t("ui.mark.as.booked.d2f1985")}
        </button>
       }

       <p className="text-xs text-white/50">{t("ui.this.records.your.declaration.tripnexa.does.not.verify.purchases.b12ebc8")}</p>
      </div>
     }

     <button
      className="trip-button secondary"
      onClick={()=>setOpen(false)}
     >{t("ui.close.7d9eb7a")}</button>

    </DialogContent>
   </Dialog>

   {!publicToken&&
    <AddItemModal
     open={!!editing}
     editing={editing}
     presetCategory="place"
     tripId={trip.id}
     trip={trip}
     onClose={()=>setEditing(null)}
     onSaved={()=>{
      setEditing(null);
      load();
     }}
    />
   }

  </div>
 );
}

