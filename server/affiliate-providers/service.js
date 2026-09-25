import {pool} from '../db.js';
import {owned} from '../entities.js';
import {assert} from '../errors.js';
import {definitions,adapter} from './index.js';
import {ticketable} from './ticketability.js';
import {readSettings} from '../admin/settings.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export async function providers(){
 const [rows]=await pool.query('SELECT * FROM affiliate_providers');
 return definitions.map((def,i)=>{const row=rows.find(r=>r.provider===def.id);return {...def,config:{enabled:false,display_name:def.name,order:i+1,partner_id:'',language:'en',currency:'EUR',search_template:'',allowed_hosts:def.hosts,cache_ttl:300,fallback:'search',...(row?parse(row.config):{})},version:row?.version||0,last_check:row?.last_check?parse(row.last_check):null,checked_at:row?.checked_at||null};});
}
export async function visitContext(tripId,visitId,ownerId,db=pool){
 const trip=await owned(db,'Trip',tripId,ownerId);
 const item=await owned(db,'ItineraryItem',visitId,ownerId);
 assert(item.trip_id===tripId&&item.step_type==='visit',404,'Visit not found.');
 let place={};if(item.selection_id){place=await owned(db,'PlaceSelection',item.selection_id,ownerId);assert(place.trip_id===tripId,404,'Place not found in this trip.');}
 return {trip,item,place,context:{place_selection_id:item.selection_id,google_place_id:place.place_id||item.place_id||null,canonical_place_name:place.name||item.title,display_name:item.title,city:place.city||trip.destination,country:place.country||trip.country||'',latitude:place.lat,longitude:place.lng,visit_date:item.date,visit_start_time:item.start_time,trip_language:trip.language||'en',trip_currency:trip.currency||'EUR',category:place.category||'',ticket_type:place.ticket_type||item.ticket_type}};
}
export async function bookingState({trip,item,place},ownerId){
 const [links]=await pool.execute('SELECT item_id,declared_booked,provider FROM affiliate_wallet_links WHERE trip_id=? AND selection_id=? AND owner_id=?',[trip.id,item.selection_id||'',ownerId]);
 const [rows]=await pool.execute("SELECT i.id,i.ticket_purchased,i.booking_status,i.reservation_file_url,EXISTS(SELECT 1 FROM item_attachments a WHERE a.item_id=i.id AND a.owner_id=i.owner_id) AS has_files FROM trip_items i WHERE i.trip_id=? AND i.owner_id=? AND i.category='place' AND (i.id=? OR i.id=? OR (?<>'' AND i.place_id=?))",[trip.id,ownerId,links[0]?.item_id||'',place.trip_item_id||'',place.place_id||'',place.place_id||'']);
 const file=rows.find(r=>r.has_files||r.reservation_file_url);
 return {saved:!!file,declared:!!links[0]?.declared_booked,booked:!!(links[0]?.declared_booked||place.ticket_purchased||item.locked||item.ticket_status==='purchased'||rows.some(r=>r.ticket_purchased||r.booking_status==='confirmed')),wallet_item_id:file?.id||rows[0]?.id||null,provider:links[0]?.provider||null};
}
export async function optionsFor(context){
 const all=await readSettings();
 const [overrides]=context.google_place_id?await pool.execute('SELECT mode FROM affiliate_place_overrides WHERE google_place_id=?',[context.google_place_id]):[[]];
 const [mappings]=context.google_place_id?await pool.execute('SELECT * FROM affiliate_place_mappings WHERE google_place_id=? AND enabled=TRUE ORDER BY priority DESC,id',[context.google_place_id]):[[]];
 const mode=overrides[0]?.mode||'AUTO';
 const eligible=mode==='NEVER'?false:ticketable(context,mode)||mappings.length>0;
 const disclosure=all.settings.affiliate_disclosure_text;
 if(!eligible||!all.features.referral_links||!disclosure.trim())return {ticketable:eligible,providers:[],disclosure,disclosure_url:all.settings.affiliate_disclosure_url};
 const choices=await Promise.all((await providers()).filter(p=>p.config.enabled).sort((a,b)=>a.config.order-b.config.order||definitions.findIndex(d=>d.id===a.id)-definitions.findIndex(d=>d.id===b.id)).map(async p=>{
  try{const result=await adapter(p.id,p.config).resolvePlace(context,mappings.filter(m=>m.provider===p.id));return result?{provider:p.id,name:p.config.display_name,description:p.description,...result}:null;}
  catch{return {provider:p.id,name:p.config.display_name,unavailable:true,message:`${p.config.display_name} options are temporarily unavailable.`};}
 }));
 return {ticketable:eligible,providers:choices.filter(Boolean),disclosure,disclosure_url:all.settings.affiliate_disclosure_url};
}
