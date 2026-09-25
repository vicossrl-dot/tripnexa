import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {owned,insertRecord} from '../entities.js';
import {assert} from '../errors.js';
import {readSettings} from '../admin/settings.js';
import {visitContext,bookingState,optionsFor} from './service.js';
import {definitions} from './index.js';
import {rateLimit} from 'express-rate-limit';
export const ticketsRouter=Router(),publicTicketsRouter=Router();
const limit=rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false});
ticketsRouter.use('/:id/tickets',limit);
async function click(context,tripId,visit,provider){
 const result=await optionsFor(context);const option=result.providers.find(p=>p.provider===provider&&!p.unavailable);assert(option,404,'Ticket options are temporarily unavailable.');
 await pool.execute('INSERT INTO affiliate_click_events(id,provider,trip_id,selection_id,google_place_id,city,attraction,mapping_type)VALUES(?,?,?,?,?,?,?,?)',[randomUUID(),provider,tripId,visit.selection_id||null,context.google_place_id,context.city||null,context.canonical_place_name,option.mapping_type]);
 return {ok:true};
}
ticketsRouter.get('/:id/tickets/:visit',async(req,res)=>{const state=await visitContext(req.params.id,req.params.visit,req.user.id);res.json({...await optionsFor(state.context),context:{name:state.context.canonical_place_name,city:state.context.city,country:state.context.country},booking:await bookingState(state,req.user.id)});});
ticketsRouter.post('/:id/tickets/:visit/click',async(req,res)=>{const s=await visitContext(req.params.id,req.params.visit,req.user.id);res.json(await click(s.context,s.trip.id,s.item,req.body.provider));});
ticketsRouter.post('/:id/tickets/:visit/booked',async(req,res)=>{
 assert(typeof req.body.booked==='boolean'&&[null,'other',...definitions.map(p=>p.id)].includes(req.body.provider??null),400,'Choose a booking provider.');
 await transaction(async db=>{await owned(db,'Trip',req.params.id,req.user.id,true);const s=await visitContext(req.params.id,req.params.visit,req.user.id,db);assert(s.item.selection_id,409,'Associate this visit with a saved place first.');
 await db.execute('INSERT INTO affiliate_wallet_links(trip_id,owner_id,selection_id,declared_booked,provider)VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE declared_booked=VALUES(declared_booked),provider=VALUES(provider)',[s.trip.id,req.user.id,s.item.selection_id,req.body.booked,req.body.provider||null]);});res.json({ok:true});
});
ticketsRouter.post('/:id/tickets/:visit/wallet',async(req,res)=>{
 const result=await transaction(async db=>{await owned(db,'Trip',req.params.id,req.user.id,true);const s=await visitContext(req.params.id,req.params.visit,req.user.id,db);assert(s.item.selection_id,409,'Associate this visit with a saved place first.');
 const [links]=await db.execute('SELECT item_id FROM affiliate_wallet_links WHERE trip_id=? AND selection_id=?',[s.trip.id,s.item.selection_id]);
 let id=links[0]?.item_id||s.place.trip_item_id;
 if(id){const existing=await owned(db,'TripItem',id,req.user.id);assert(existing.trip_id===s.trip.id&&existing.category==='place',409,'Review this place association in your plan.');}
 else{const record=await insertRecord(db,'TripItem',{trip_id:s.trip.id,category:'place',title:s.context.canonical_place_name,place_id:s.context.google_place_id||undefined},req.user.id);id=record.id;}
 await db.execute('INSERT INTO affiliate_wallet_links(trip_id,owner_id,selection_id,item_id)VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE item_id=VALUES(item_id)',[s.trip.id,req.user.id,s.item.selection_id,id]);return {item_id:id};});res.json(result);
});
publicTicketsRouter.use(limit);
async function publicState(req){
 assert(/^[A-Za-z0-9_-]{24,128}$/.test(req.params.token),404,'Shared trip not found.');
 const all=await readSettings();assert(all.features.public_sharing&&all.features.referral_links&&all.settings.affiliate_public_enabled&&all.settings.affiliate_disclosure_text.trim()&&!all.settings.maintenance_enabled,404,'Ticket options are unavailable.');
 const [[trip]]=await pool.execute('SELECT id,owner_id FROM trips WHERE share_token=? AND share_enabled=TRUE',[req.params.token]);assert(trip,404,'Shared trip not found.');
 return visitContext(trip.id,req.params.visit,trip.owner_id);
}
publicTicketsRouter.get('/:token/tickets/:visit',async(req,res)=>{const s=await publicState(req);const result=await optionsFor(s.context);res.json({...result,context:{name:s.context.canonical_place_name,city:s.context.city,country:s.context.country}});});
publicTicketsRouter.post('/:token/tickets/:visit/click',async(req,res)=>{const s=await publicState(req);res.json(await click(s.context,s.trip.id,s.item,req.body.provider));});
