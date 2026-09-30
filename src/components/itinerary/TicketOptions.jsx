import {useEffect,useState,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import AddItemModal from '@/components/trip/AddItemModal';
import {api} from '@/api/client';

export async function ticketApi(path,body=undefined){
 const requestUrl='/api'+path+(body?'':(path.includes('?')?'&':'?')+'_fresh='+Date.now());
 const response=await fetch(requestUrl,{cache:'no-store',
  credentials:'same-origin',
  method:body?'POST':'GET',
  headers:{
   'X-Requested-With':'TripSync',
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
 },[base,onBooking]);

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
   ? <button className="trip-link text-sm mt-3" onClick={load}>Retry ticket options</button>
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
     <p className="text-emerald-300 text-sm">Ticket saved ✓</p>
     <Link
      className="trip-button primary mt-2"
      to={`/trip/${trip.id}/wallet?item=${data.booking.wallet_item_id}`}
     >
      View ticket
     </Link>
    </div>
    :
    booked?
     <p className="text-emerald-300 text-sm">Booked · saved in your plan</p>
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
     {saved||booked?'Find another option':'Tickets & tours'}
    </button>
   }

   {booked&&!saved&&!publicToken&&
    <button
     disabled={busy}
     className="trip-button secondary"
     onClick={addTicket}
    >
     Add your ticket to Travel Wallet
    </button>
   }

   <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent
     onCloseAutoFocus={event=>{
      event.preventDefault();
      trigger.current?.focus();
     }}
     className="bg-neutral-950 text-white border-white/15 w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto"
    >
     <DialogTitle>Tickets & tours</DialogTitle>

     <DialogDescription className="text-white/65">
      Compare options from trusted booking partners. Booking and payment take place on their website.
     </DialogDescription>

     <div>
      <h3 className="text-xl font-semibold break-words">
       {data.context.name}
      </h3>

      <p className="text-sm text-white/60">
       {[data.context.city,data.context.country].filter(Boolean).join(', ')}
      </p>
     </div>

     {saved&&
      <p className="text-emerald-300">
       You already have a ticket saved for this visit.
      </p>
     }

     {error&&
      <p role="alert" className="text-red-300">
       {error}
      </p>
     }

     {!hasAnyOption&&
      <p role="status">
       Ticket options are temporarily unavailable.
      </p>
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
             ? `Tickets for ${p.venue_name}`
             : p.description}
           </p>
          </div>

          {multi&&
           <span className="text-xs text-white/45 whitespace-nowrap">
            {items.length} options
           </span>
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
                {ticket.title}
               </p>

               {ticket.price_label&&
                <p className="text-sm text-white/70 mt-2">
                 From {ticket.price_label}
                </p>
               }
              </div>

              <a
               href={ticket.url}
               target="_blank"
               rel="sponsored noopener noreferrer"
               className="trip-button primary mt-3 w-full"
               aria-label={`${ticket.title} on ${p.name} (opens in a new tab)`}
               onClick={()=>recordClick(p.provider)}
              >
               View ticket ↗
              </a>
             </div>
            ))}
           </div>

           {p.all_url&&
            <a
             href={p.all_url}
             target="_blank"
             rel="sponsored noopener noreferrer"
             className="trip-button secondary mt-3 w-full"
             aria-label={`View all ${p.venue_name||data.context.name} tickets on ${p.name} (opens in a new tab)`}
             onClick={()=>recordClick(p.provider)}
            >
             View all {p.venue_name||data.context.name} tickets ↗
            </a>
           }
          </>
          :
          p.url?
           <a
            href={p.url}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="trip-button primary mt-4 w-full"
            aria-label={`View ${p.name} options (opens in a new tab)`}
            onClick={()=>recordClick(p.provider)}
           >
            View options ↗
           </a>
           :
           <p className="text-sm mt-3">
            {p.message}
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
       >
        Affiliate disclosure
       </a>
      }
     </p>

     {!publicToken&&
      <div className="border-t border-white/15 pt-4 space-y-3">
       <h4 className="font-semibold">
        Already booked?
       </h4>

       <button
        disabled={busy}
        className="trip-button secondary w-full"
        onClick={addTicket}
       >
        Add your ticket to Travel Wallet
       </button>

       <label className="block text-sm">
        Booked with (optional)

        <select
         className="block w-full bg-neutral-900 border border-white/20 rounded-lg p-3 mt-1"
         value={provider}
         onChange={e=>setProvider(e.target.value)}
        >
         {[
          ['other','Other'],
          ['getyourguide','GetYourGuide'],
          ['viator','Viator'],
          ['tiqets','Tiqets'],
          ['klook','Klook']
         ].map(([id,name])=>
          <option key={id} value={id}>
           {name}
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
          ? 'Remove my booked mark'
          : 'Mark as booked'}
        </button>
       }

       <p className="text-xs text-white/50">
        This records your declaration. TripNexa does not verify purchases.
       </p>
      </div>
     }

     <button
      className="trip-button secondary"
      onClick={()=>setOpen(false)}
     >
      Close
     </button>

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

