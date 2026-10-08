import { translateText, t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/client';
import { useCapabilities } from '@/hooks/use-capabilities';
import DestinationAutocomplete from '@/components/home/DestinationAutocomplete';
import { CATEGORIES } from './categories';
import WalletAttachments from './WalletAttachments';
import LinkAutoFill from './LinkAutoFill';
import FieldHelper from '@/components/ui/field-helper';

const EMPTY = {title:'',category:'flight',url:'',date:'',time:'',end_date:'',notes:'',confirmation_number:'',flight_number:'',airline:'',traveler:''};
const names = {title:'Title',airline:'Airline',flight_number:'Flight number',departure_airport:'Departure airport',arrival_airport:'Arrival airport',departure_datetime:'Departure date / time',arrival_datetime:'Arrival date / time',confirmation_number:'Confirmation / reference',traveler:'Traveler / passenger',date:'Date',time:'Time',end_date:'Check-out date',address:'Address / location',city:'City',country:'Country',check_in_time:'Check-in time',check_out_time:'Check-out time',notes:'Notes',url:'Original link'};
export default function AddItemModal({open,onClose,onSaved,editing,presetCategory,tripId,trip}) {
  useLocale();
  const {ai} = useCapabilities();
  const [form,setForm] = useState(EMPTY), [files,setFiles] = useState([]), [removals,setRemovals] = useState([]);
  const [mode,setMode] = useState('upload'), [busy,setBusy] = useState(false), [loading,setLoading] = useState(false), [error,setError] = useState(''), [progress,setProgress] = useState(''), [preview,setPreview] = useState(null);
  const revision = useRef(0);
  useEffect(() => {
    const version = ++revision.current;
    if (!open) return;
    const {attachments: existingFiles, ...record} = editing || {};
    setForm(editing ? {...EMPTY,...record} : {...EMPTY,category:presetCategory || 'flight'});
    setMode('upload');setFiles(existingFiles || []);setRemovals([]);setPreview(null);setError('');setBusy(false);setProgress('');
    if (editing && !existingFiles) {
      setLoading(true);
      api.wallet.list(tripId).then(result => { if (version === revision.current) setFiles(result.items.find(item => item.id === editing.id)?.attachments || []); }).catch(failure => {if(version === revision.current)setError(failure.message);}).finally(()=>{if(version === revision.current)setLoading(false);});
    } else setLoading(false);
    return () => {revision.current++;};
  },[open,editing,presetCategory,tripId]);
  const cat=form.category;
  const pendingFiles=files.filter(file=>!file.id).length;
  function close() {
    if(busy||loading)return;
    if(pendingFiles&&!window.confirm(t("ui.your.uploaded.files.are.not.saved.to.travel.wallet.yet.choose.can.3680a2c")))return;
    onClose();
  }
  const set=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  async function upload(selected) {
    selected = Array.from(selected);
    if (busy || loading || !selected.length) return;
    if (selected.length > 25 || files.length + selected.length > 100) {setError('Select up to 25 files at once, with up to 100 files per booking.');return;}
    setBusy(true);setError(''); const failures=[];
    for (const [index,file] of Array.from(selected).entries()) {
      setProgress(`Uploading ${index+1} of ${selected.length}…`);
      try {
        if(file.size>10*1024*1024)throw new Error('File exceeds 10 MB.');
        const saved=await api.wallet.upload(file,tripId);
        setFiles(previous=>[...previous,{...saved,original_name:file.name.slice(0,255),label:'',traveler:'',notes:'',document_type:'',expiry_date:''}]);
      } catch(failure){failures.push(`${file.name}: ${failure.message}`);}
    }
    setError(failures.join(' '));setProgress('');setBusy(false);
  }
  async function extract(file) {
    setBusy(true);setError('');setProgress('Reading file for review…');
    try {
      const result=cat==='stay' ? await api.extractStay({trip_id:tripId,file_url:file.file_url}) : await api.wallet.extract({trip_id:tripId,file_url:file.file_url,category:cat});
      setPreview(result);
    } catch(failure){setError(failure.message);}
    finally{setBusy(false);setProgress('');}
  }
  async function save() {
    setBusy(true);setError('');
    try {
      const omit=new Set(['id','created_date','updated_date','created_by_id','created_by','is_sample','legacy','attachments']);
      const item=Object.fromEntries(Object.entries(form).filter(([key])=>!omit.has(key)));
      item.title=form.title.trim() || files[0]?.label || files[0]?.original_name || '';
      if(!item.title)throw new Error('Add a title or upload a file.');
      if(cat==='flight' && item.departure_datetime){item.date=item.departure_datetime.slice(0,10);item.time=item.departure_datetime.slice(11,16);}
      await api.wallet.save(tripId,editing?.id,{item,attachments:files,remove_attachment_ids:removals});
      onSaved();
    } catch(failure){setError(failure.message);}
    finally{setBusy(false);}
  }
  function input(key,type='text',label=names[key] || key) {
    return <label key={key} className="block text-xs text-neutral-600">{translateText(label)}<Input aria-label={translateText(label)} type={type} value={form[key] || ''} onChange={event=>set(key,event.target.value)} maxLength={1000} /></label>;
  }
  const modes=cat==='document'?[['upload','Upload files']]:cat==='flight'?[['upload','Upload files'],['manual','Fill manually']]:[['upload','Upload files'],['link','From a link'],['manual','Fill manually']];
  return <Dialog open={open} onOpenChange={value=>!value&&close()}>
    <DialogContent className="trip-modal w-[calc(100%-24px)] max-w-[calc(100%-24px)] sm:max-w-xl rounded-2xl max-h-[92dvh] flex flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="px-5 pt-5 pb-4 shrink-0"><DialogTitle>{editing?t("ui.edit.travel.item.5e47e3b"):t("ui.add.to.trip.1b190a1")}</DialogTitle><DialogDescription className="text-white/60">{t("ui.tickets.bookings.documents.private.7fa409e")}</DialogDescription></DialogHeader>
      <fieldset disabled={busy||loading} className="space-y-4 overflow-y-auto min-h-0 px-5 pb-5">
        <div className="grid grid-cols-2 gap-2">{Object.entries(CATEGORIES).map(([key,category])=><button type="button" key={key} disabled={!!editing&&key!==cat} onClick={()=>{set('category',key);setMode('upload');setPreview(null);}} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs ${cat===key?'bg-neutral-900 text-white':'text-neutral-600'}`}><category.icon className="w-4 h-4 shrink-0"/>{translateText(category.label)}</button>)}</div>
        <div className="flex rounded-xl bg-neutral-100 p-1">{modes.map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)} className={`flex-1 rounded-lg px-2 py-2 text-xs ${mode===key?'bg-neutral-900 text-white':'text-neutral-600'}`}>{translateText(label)}</button>)}</div>
        {loading ? <p>{t("ui.loading.existing.attachments.b438ddd")}</p> : <>
          {mode==='upload' && <>
            {input("title","text",t("ui.title.optional.8280fbd"))}
            <FieldHelper>{ai && cat !== 'document' ? t("ui.upload.your.value.optionally.extract.and.review.its.details.then.e0a2923", {v0: cat === 'flight' ? 'ticket' : cat === 'stay' ? 'confirmation' : 'booking'}) : t("ui.upload.files.then.save.the.travel.item.to.add.them.to.travel.wall.c5cc58b")}</FieldHelper>
            <div onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();upload(event.dataTransfer.files);}} className="rounded-xl border-2 border-dashed border-neutral-300 bg-white/5 p-6 text-sm text-neutral-600">
              <label className="block">{t("ui.choose.files.or.drop.them.here.c5750b1")}<input aria-label={t("ui.upload.travel.files.de95aac")} multiple type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" className="block w-full mt-3 text-xs" onChange={event=>{upload(event.target.files);event.target.value='';}} /></label>
              <p className="text-xs mt-2">{t("ui.pdf.jpg.png.webp.or.gif.10.mb.per.file.one.booking.can.contain.ti.de9ea7f")}</p>
            </div>
            <WalletAttachments files={files} onChange={setFiles} onRemove={file=>{if(!window.confirm(t("ui.remove.this.attachment.the.change.takes.effect.when.you.save.ac8d707")))return;setFiles(previous=>previous.filter(other=>other!==file));if(file.id)setRemovals(previous=>[...previous,file.id]);}} category={cat} busy={busy} onExtract={ai&&cat!=='document'?extract:null}/>
            {cat!=='document' && ai && files.length>0 && <p className="text-xs text-neutral-500">{t("ui.extraction.sends.only.the.chosen.file.to.the.configured.ai.provid.b6a65a2")}</p>}
          </>}
          {mode==='link' && <LinkAutoFill category={cat} tripId={tripId} onExtracted={(data,warnings)=>setPreview({data,warnings:warnings || ['Review this information. A public link is not proof of a booking.']})} />}
          {mode==='manual' && <div className="space-y-3">
            {input("title")}
            {cat==='flight' && <div className="grid sm:grid-cols-2 gap-3">{input("airline")}{input('flight_number')}{input('departure_airport')}{input('arrival_airport')}{input('departure_datetime','datetime-local')}{input('arrival_datetime','datetime-local')}</div>}
            {(cat==='place'||cat==='stay') && <DestinationAutocomplete id="wallet-location" label={cat==='stay'?t("ui.hotel.address.b6d0060"):t("ui.place.location.1417b3a")} purpose="place" light keepSelection addressField destination={trip?.destination || ''} latitude={trip?.destination_latitude} longitude={trip?.destination_longitude} value={form.address || ''} onChange={value=>setForm(previous=>({...previous,address:value,place_id:null,lat:null,lng:null}))} onSelect={place=>setForm(previous=>({...previous,title:previous.title||place.name,address:place.address,city:place.city,country:place.country,place_id:place.place_id,lat:place.lat,lng:place.lng}))}/>}
            {cat==='stay' && <div className="grid grid-cols-2 gap-3">{input("date","date",t("ui.check.in.date.5d7b2d6"))}{input('end_date',"date")}{input('check_in_time',"time")}{input('check_out_time',"time")}</div>}
            {cat==='place' && <div className="grid grid-cols-2 gap-3">{input("date","date")}{input("time","time")}</div>}
            {input('confirmation_number')}{input("traveler")}
            <label className="block text-xs text-neutral-600">{t("ui.notes.8a7525b")}<Textarea aria-label={t("ui.notes.8a7525b")} value={form.notes||''} onChange={event=>set('notes',event.target.value)} rows={3}/></label>
            {form.url && input("url")}
            <p className="text-xs text-neutral-500">{files.length}{" "}{t("ui.attached.files.use.upload.files.to.view.or.add.more.acc758d")}</p>
          </div>}
          {preview && <section aria-label={t("ui.extraction.preview.42611ec")} className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3">
            <h3 className="font-semibold">{t("ui.review.extracted.details.dc35582")}</h3>{preview.warnings?.map((message,i)=><p key={i} className="text-xs">{translateText(message)}</p>)}
            {Object.entries(preview.data).filter(([key,value])=>names[key]&&value!=null).map(([key,value])=><label key={key} className="block text-xs">{names[key]}<Input aria-label={t("ui.preview.4b55d10")+names[key]} value={String(value)} onChange={event=>setPreview({...preview,data:{...preview.data,[key]:event.target.value}})}/></label>)}
            <div className="flex gap-2"><Button type="button" onClick={()=>{const allowed=new Set([...Object.keys(names),'lat','lng']);const data=Object.fromEntries(Object.entries(preview.data).filter(([key,value])=>allowed.has(key)&&value!==''&&value!=null));setForm(previous=>({...previous,...data,source_status:'confirmed_by_user',verified_at:new Date().toISOString()}));setPreview(null);setMode('manual');}}>{t("ui.use.these.details.780f710")}</Button><Button type="button" variant="outline" onClick={()=>setPreview(null)}>{t("ui.discard.preview.b78cf0d")}</Button></div>
            <p className="text-xs">{t("ui.after.reviewing.use.save.to.store.this.booking.1b87e12")}</p>
          </section>}
        </>}
      </fieldset>
      <footer className="shrink-0 border-t border-white/10 p-5 space-y-2">
      {progress&&<p role="status" className="text-sm">{progress}</p>}{error&&<p role="alert" className="text-sm text-red-700">{translateText(error)}</p>}
      {pendingFiles>0&&!busy&&<p role="status" className="text-sm text-neutral-700">{pendingFiles}{" "}{t("ui.uploaded.3cef1b2")}{" "}{pendingFiles===1?t("ui.file.is.09bd22b"):t("ui.files.are.94aa03b")}{" "}{t("ui.ready.select.850302e")}{" "}{editing?t("ui.save.changes.dd0ae7a"):t("ui.save.travel.item.b600997")}{" "}{t("ui.below.to.add.56779b4")}{" "}{pendingFiles===1?t("ui.it.2ad8a70"):t("ui.them.c9a8dc3")}{" "}{t("ui.to.travel.wallet.7937e7f")}</p>}
      <Button onClick={save} disabled={busy||loading||!!preview||(!form.title.trim()&&!files.length)} className="w-full bg-neutral-900 text-white">{busy?t("ui.please.wait.4660a98"):editing?t("ui.save.changes.dd0ae7a"):t("ui.save.travel.item.b600997")}</Button>
      <p className="text-xs text-neutral-500">{t("ui.adding.files.never.replaces.existing.attachments.removals.take.ef.44485d7")}</p>
      </footer>
    </DialogContent>
  </Dialog>;
}
