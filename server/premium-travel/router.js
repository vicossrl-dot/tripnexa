import {withPdfTranslations} from '../pdf-i18n.js';
import {displaySavedContent} from '../locale-router.js';
import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {transaction,pool} from '../db.js';
import {snapshot,present} from '../itinerary-service.js';
import {owned} from '../entities.js';
import {requireFeature} from '../billing/entitlements.js';
import {assert} from '../errors.js';
import {getAppUrls,buildApplicationUrl} from '../app-urls.js';
import {readWallet} from '../wallet.js';
import {tripWeather} from '../weather/service.js';
import {calendarIcs} from './calendar.js';
import {savedEssentials,refreshEssentials,essentialsWithUpdates} from './essentials.js';
import {renderTravelBook} from './travel-book.js';
import {createStaticMapProvider} from './static-map-provider.js';
import {renderEssentialsPdf} from './essentials-pdf.js';

export const premiumTravelRouter=Router();
const limit=rateLimit({windowMs:60000,limit:10,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false});
async function stateFor(req,feature){await owned(pool,'Trip',req.params.id,req.user.id);await requireFeature(req.user.id,feature,req.params.id);return {...await transaction(db=>snapshot(db,req.params.id,req.user.id)),ownerId:req.user.id};}
premiumTravelRouter.get('/:id/calendar',limit,async(req,res)=>{
 const state=await stateFor(req,'calendar_exports'),plan=await present(state),query=req.query.days;
 assert(query===undefined||typeof query==='string'&&query.length<=4000,400,'Choose itinerary dates.');assert(req.query.transfers===undefined||['true','false'].includes(req.query.transfers),400,'Invalid transfer option.');
 const urls=await getAppUrls();
 const result=await withPdfTranslations(state,req.user.id,()=>calendarIcs(state.trip,plan,{dates:query?query.split(','):[],includeTransfers:req.query.transfers!=='false',tripUrl:buildApplicationUrl(urls,`/trip/${encodeURIComponent(state.trip.id)}/itinerary`)}));
 res.set({'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="TripNexa-itinerary.ics"','Cache-Control':'private, no-store','X-TripNexa-Skipped-Events':String(result.skipped)}).send(result.content);
});
premiumTravelRouter.get('/:id/essentials',async(req,res)=>{const state=await stateFor(req,'destination_essentials'),passport=req.query.passport||null;res.set('Cache-Control','private, no-store').json(await displaySavedContent(await essentialsWithUpdates(state,passport,await savedEssentials(state,passport)),req.user.id,state.trip.id));});
premiumTravelRouter.post('/:id/essentials/refresh',limit,async(req,res)=>{const state=await stateFor(req,'destination_essentials'),passport=req.body?.passport||null;res.set('Cache-Control','private, no-store').json(await displaySavedContent(await essentialsWithUpdates(state,passport,await refreshEssentials(state,passport)),req.user.id,state.trip.id));});
premiumTravelRouter.get('/:id/essentials/pdf',limit,async(req,res)=>{
 const state=await stateFor(req,'destination_essentials');await requireFeature(req.user.id,'pdf_exports',state.trip.id);
 const data=await savedEssentials(state,req.query.passport||null);assert(data.generatedAt,409,'Update travel essentials before downloading the PDF.');
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="TripNexa-Before-You-Go.pdf"','Cache-Control':'private, no-store'}).send(await renderEssentialsPdf(state.trip,data));
});
premiumTravelRouter.get('/:id/itinerary/pdf/full',limit,async(req,res)=>{
 const state=await stateFor(req,'pdf_exports'),plan=await present(state);assert(plan.items.length,400,'Generate an itinerary before downloading it.');
 const [wallet,essentials,urls]=await Promise.all([readWallet(state.trip.id,req.user.id),savedEssentials(state,req.query.passport||null),getAppUrls()]);
 // Weather is optional and must not hold up a saved-trip export on a provider outage.
 let timer;const weather=await Promise.race([tripWeather({trip:state.trip,items:state.items,stays:state.tripItems,selections:state.places}).catch(()=>({days:[]})),new Promise(resolve=>{timer=setTimeout(()=>resolve({days:[]}),2000);})]);clearTimeout(timer);
 const bytes=await renderTravelBook({...state,bookings:(await pool.execute('SELECT selection_id,item_id,declared_booked,provider FROM affiliate_wallet_links WHERE trip_id=? AND owner_id=?',[state.trip.id,req.user.id]))[0]},plan,wallet.items,{applicationUrl:urls.application.value,essentials,weather:weather.days,basemapProvider:createStaticMapProvider({ownerId:req.user.id,tripId:state.trip.id})});
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="TripNexa-Full-Travel-Book.pdf"','Cache-Control':'private, no-store'}).send(bytes);
});
