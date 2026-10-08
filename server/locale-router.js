import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {transaction} from './db.js';
import {snapshot} from './itinerary-service.js';
import {savedEssentials} from './premium-travel/essentials.js';
import {requireFeature} from './billing/entitlements.js';
import {generatedTexts,translateSavedTexts} from './localized-content.js';
import {provider} from './ai.js';
import {billableOperation} from './billing/usage.js';
import {assert} from './errors.js';
export const localeRouter=Router();
export async function displaySavedContent(data,owner,tripId){
 const texts=generatedTexts(data);
 assert(texts.length<=500&&JSON.stringify(texts).length<=120000,400,'This plan is too large for translation.');
 const displayTranslations=await translateSavedTexts(texts,{owner,generate:true,call:(...args)=>billableOperation(owner,tripId,'ai_modifications',()=>provider(...args))});
 return {...data,displayTranslations};
}
localeRouter.post('/:id/localized-content',rateLimit({windowMs:60000,limit:10,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
 const state=await transaction(db=>snapshot(db,req.params.id,req.user.id));
 let essentials=null;
 try{await requireFeature(req.user.id,'destination_essentials',req.params.id);const saved=await savedEssentials({...state,ownerId:req.user.id},req.body?.passport||null);if(saved.generatedAt)essentials=saved;}catch(error){if(error.billing?.code!=='PREMIUM_FEATURE_REQUIRED')throw error;}
 const data=await displaySavedContent({trip:state.trip,items:state.items,places:state.places,essentials},req.user.id,req.params.id);
 res.set('Cache-Control','private, no-store').json({translations:data.displayTranslations});
});
