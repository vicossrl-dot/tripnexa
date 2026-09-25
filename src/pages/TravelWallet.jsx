import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Wallet, Plus, LockKeyhole, Users } from 'lucide-react';
import { TripNavigation, PageHeading, TripLoading, EmptyState } from '@/components/trip/TripUI';
import { walletTitle, friendlyDate } from '@/lib/trip-presentation';
import CanvasView from '@/components/trip/CanvasView';
import ImageReplaceButton from '@/components/trip/ImageReplaceButton';
import { api } from '@/api/client';
import { CATEGORIES } from '@/components/trip/categories';
import AddItemModal from '@/components/trip/AddItemModal';
import WalletFileViewer from '@/components/trip/WalletFileViewer';

const tabs=[['flight','Flights'],['stay','Stay / Hotel'],['place','Tickets'],['document','Documents']];
const itemSummary=item=>{
  const flightTime=item.departure_datetime || item.arrival_datetime;
  const date=item.date || flightTime?.slice(0,10);
  return [date?friendlyDate(date,{year:'numeric'}):null,item.time || (item.category==='stay' ? item.check_in_time : flightTime?.slice(11,16)),item.traveler].filter(Boolean).join(' · ');
};
export default function TravelWallet() {
  const {tripId}=useParams();const [search,setSearch]=useSearchParams();
  const [trip,setTrip]=useState(null),[items,setItems]=useState([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const [modal,setModal]=useState(false),[editing,setEditing]=useState(null),[viewing,setViewing]=useState(null),[deleting,setDeleting]=useState(false),[notice,setNotice]=useState('');
  const selected=items.find(item=>item.id===search.get('item'));
  const tab=selected?.category || (tabs.some(([key])=>key===search.get('category'))?search.get('category'):'flight');
  async function load(){try{const [t,w]=await Promise.all([api.entities.Trip.get(tripId),api.wallet.list(tripId)]);setTrip(t);setItems(w.items);setLoaded(true);setError('');}catch(failure){setError(failure.message);}}
  useEffect(()=>{load();},[tripId]);
  const count=category=>items.filter(item=>item.category===category).reduce((sum,item)=>sum+item.attachments.length,0);
  const open=item=>setSearch({item:item.id,category:item.category});
  const add=()=>{setEditing(null);setModal(true);};
  if(!trip)return <TripLoading error={error} retry={load}/>;
  return <div className="trip-experience pb-16"><TripNavigation trip={trip} onUpdated={setTrip}/>
    <main className="trip-container py-7 space-y-6">
      <PageHeading eyebrow={trip.name} title="Travel Wallet" description="Tickets, bookings & documents"><button onClick={add} className="trip-button primary"><Plus size={17}/>Add to Trip</button></PageHeading>
      <div className="grid grid-cols-2 sm:flex gap-2" aria-label="Wallet categories">{tabs.map(([key,label])=><button key={key} data-wallet-category={key} aria-pressed={tab===key} onClick={()=>setSearch({category:key})} className={`trip-button ${tab===key?'primary':'secondary'}`}>{label} ({count(key)})</button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="trip-muted">Counts show files, grouped by booking.</p><span title="Not included in shared trip links." className="inline-flex items-center gap-2 text-xs text-white/65"><LockKeyhole size={13}/>Private</span></div>
      {notice&&<p role="status" className="text-sm text-emerald-300">{notice}</p>}
      {error&&<p role="alert" className="text-red-300">{error} <button className="underline" onClick={load}>Retry</button></p>}
      {!loaded&&!error&&<p>Loading your wallet…</p>}
      {selected ? <section data-wallet-item-detail className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-6 space-y-4">
        <button onClick={()=>setSearch({category:tab})} className="trip-link text-sm">← Back to wallet</button>
        <div className="flex flex-wrap justify-between gap-3"><div><p className="trip-eyebrow">{CATEGORIES[selected.category].label}</p><h2 className="text-2xl font-bold mt-2 break-words">{walletTitle(selected)}</h2><p className="trip-muted mt-2">{itemSummary(selected)}</p></div>
          {selected.legacy ? <Link to={`/trip/${tripId}/plan`} className="text-lime text-sm">Edit in planner</Link> : <button onClick={()=>{setEditing(selected);setModal(true);}} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Edit / add files</button>}
        </div>
        {[['Airline',selected.airline],['Flight',selected.flight_number],['Departure',selected.departure_airport],['Arrival',selected.arrival_airport],['Departure time',selected.departure_datetime],['Arrival time',selected.arrival_datetime],['Address',selected.address],['Check-out',selected.end_date],['Reference',selected.confirmation_number],['Notes',selected.notes]].filter(([,value])=>value).map(([label,value])=><p key={label} className="text-sm text-white/75 whitespace-pre-wrap"><span className="font-semibold">{label}: </span>{value}</p>)}
        {selected.image_url&&!selected.legacy&&<details><summary className="trip-disclosure">Original booking image</summary><div className="flex items-start gap-3 mt-2"><img src={selected.image_url} alt="Original booking" className="max-h-40 max-w-[75%] object-contain rounded-lg"/><ImageReplaceButton item={selected} onReplaced={()=>{setNotice('Image updated');load();}}/></div></details>}
        {selected.url&&/^https?:\/\//i.test(selected.url)&&<a href={selected.url} target="_blank" rel="noopener noreferrer" className="trip-link inline-block text-sm">View booking source</a>}
        <p className="text-sm">{selected.attachments.length} attached {selected.attachments.length===1?'file':'files'}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{selected.attachments.map(file=><article key={file.id} className="trip-card space-y-3" data-wallet-file>
          {file.mime?.startsWith('image/')&&<button aria-label={'Preview '+(file.label||file.original_name)} className="block w-full rounded-xl bg-white overflow-hidden" onClick={()=>setViewing(file)}><img src={file.file_url} alt="" loading="lazy" className="w-full h-36 object-contain"/></button>}
          <p className="font-semibold break-words">{file.label||file.original_name}</p>
          {file.label&&<p className="text-xs text-white/50 break-all">{file.original_name}</p>}
          <p className="trip-muted">{[file.traveler,file.document_type,file.expiry_date?'Expires '+friendlyDate(file.expiry_date,{year:'numeric'}):null].filter(Boolean).join(' · ')}</p>
          {file.notes&&<p className="text-sm whitespace-pre-wrap">{file.notes}</p>}
          <div className="flex gap-4"><button onClick={()=>setViewing(file)} className="text-sm font-semibold underline">View file</button><a href={file.file_url} download={file.label||file.original_name} className="text-sm underline">Download</a></div>
        </article>)}</div>
        {!selected.attachments.length&&<p className="text-sm text-white/60">No files yet. Use Edit / add files to upload tickets or documents.</p>}
        {!selected.legacy&&<button disabled={deleting} className="text-xs text-red-300" onClick={async()=>{if(!window.confirm('Delete this booking and its attachments? Files still used elsewhere will be kept.'))return;setDeleting(true);try{await api.entities.TripItem.delete(selected.id);setSearch({category:tab});setNotice('Booking deleted');await load();}catch(failure){setError(failure.message);}finally{setDeleting(false);}}}>Delete this item</button>}
      </section> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.filter(item=>item.category===tab).map(item=>{const Icon=CATEGORIES[item.category].icon;const people=[...new Set([item.traveler,...item.attachments.map(file=>file.traveler)].filter(Boolean))];return <article key={item.id} data-wallet-item className="trip-card space-y-4">
          <div className="flex items-center justify-between"><span className="p-3 rounded-xl bg-lime/10 text-lime"><Icon size={22}/></span>{item.category==='document'&&<span className="inline-flex items-center gap-1 text-xs text-white/60"><LockKeyhole size={12}/>Private</span>}</div><h2 className="font-heading text-lg font-semibold break-words">{walletTitle(item)}</h2><p className="trip-muted">{itemSummary(item)||(item.category==='document'?'Personal travel document':'Date not set')}</p>{people.length>0&&<p className="trip-muted flex items-start gap-2"><Users size={15} className="shrink-0 mt-1"/>{people.join(', ')}</p>}<p className="text-sm">{item.attachments.length} {item.category==='flight'||item.category==='place'?'tickets / files':'files'}</p>
          <div className="flex flex-wrap gap-2"><button onClick={()=>open(item)} className="trip-button primary flex-1">View</button>{!item.legacy&&<button className="trip-button secondary" onClick={()=>{setEditing(item);setModal(true);}}>Add files / Edit</button>}</div>
        </article>;})}
        {loaded&&!items.some(item=>item.category===tab)&&<div className="col-span-full trip-card"><EmptyState icon={Wallet} title={{flight:'No flight tickets added yet.',stay:'No stay added yet.',place:'Your experiences, all together.',document:'Keep important travel documents together.'}[tab]} description="Add one booking with files for everyone traveling with you."><button className="trip-button primary" onClick={add}>{{flight:'Add flight',stay:'Add accommodation',place:'Add tickets',document:'Upload document'}[tab]}</button></EmptyState></div>}
      </div>}
      {!selected&&items.length>0&&<details><summary className="trip-disclosure">Browse booking canvas</summary><div className="pt-4"><CanvasView items={items.map(item=>({...item,title:walletTitle(item)}))} onSelect={open}/></div></details>}
    </main>
    <AddItemModal open={modal} onClose={()=>setModal(false)} editing={editing} presetCategory={tab} tripId={tripId} trip={trip} onSaved={()=>{setModal(false);setNotice('Saved');load();}}/>
    {viewing&&<WalletFileViewer key={viewing.file_url} file={viewing} onClose={()=>setViewing(null)}/>}
  </div>;
}
