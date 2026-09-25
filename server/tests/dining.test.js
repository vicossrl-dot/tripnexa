import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPlaceRequest,mealChoice} from '../../src/lib/dining.js';
import {mealContext,preserveMealChoices} from '../meal-context.js';
import {searchMeals,qualityScore} from '../meal-options.js';
import {unscheduledPlaces,inputHash} from '../itinerary-service.js';
import {itineraryHtml} from '../itinerary-pdf.js';
import {validateData} from '../schema.js';
import {publicProjection} from '../trips.js';
import {config} from '../config.js';
import {pool} from '../db.js';
test.after(()=>pool.end());
const fixture=()=>({trip:{id:'t',name:'Food trip',destination:'Bucharest',start_date:'2026-10-01',end_date:'2026-10-03',food_preferences:'["Italian"]',dining_budget:'moderate',dietary_notes:'vegetarian',destination_latitude:45,destination_longitude:27},places:[{id:'required',name:'Desired',priority:'mandatory',selection_source:'manual'},{id:'optional',name:'Optional',priority:'preferred',selection_source:'ai'}],tripItems:[],dayWindows:[],items:[{id:'visit',step_type:'visit',date:'2026-10-02',start_time:'10:00',end_time:'12:00',title:'Garden',lat:44.436,lng:26.09},{id:'meal',step_type:'meal',date:'2026-10-02',start_time:'12:00',end_time:'13:00',title:'Meal break'},{id:'next',step_type:'visit',date:'2026-10-02',start_time:'14:00',end_time:'16:00',title:'Museum',lat:44.44,lng:26.094}]});
test('Backend unscheduled list distinguishes desired and preferred; append preserves text and avoids duplicate instructions',()=>{
 const state=fixture(),list=unscheduledPlaces(state);assert.deepEqual(list.map(p=>p.required),[true,false]);
 const text=appendPlaceRequest('Keep the evening free.',list);assert(text.startsWith('Keep the evening free.'));assert(text.includes('Desired'));assert(text.includes('Optional'));assert.equal(appendPlaceRequest(text,list),text);
});
test('Food fields validate and absent additive fields do not invalidate legacy input hashes',()=>{
 assert.equal(validateData('Trip',{food_preferences:'["Italian"]',dining_budget:'moderate',dietary_notes:'No peanuts'},true).dietary_notes,'No peanuts');
 assert.throws(()=>validateData('Trip',{food_preferences:'["invented"]'},true));assert.throws(()=>validateData('Trip',{dietary_notes:'x'.repeat(1001)},true));
 const state=fixture();delete state.trip.food_preferences;delete state.trip.dining_budget;delete state.trip.dietary_notes;const before=inputHash(state);Object.assign(state.trip,{food_preferences:null,dining_budget:null,dietary_notes:null});assert.equal(inputHash(state),before);
 assert.deepEqual(validateData('ItineraryItem',{meal_choice:'{"name":"invented"}'},true),{});
});
test('Meal context uses surrounding itinerary coordinates; choices survive recalculation with a review flag if route moves',()=>{
 const state=fixture(),meal=state.items[1],context=mealContext(state,meal);assert.equal(context.anchor.name,'Garden');assert.equal(context.next.name,'Museum');
 meal.meal_choice=JSON.stringify({name:'Chosen',anchor:context.anchor,food_preferences:state.trip.food_preferences,dining_budget:state.trip.dining_budget,dietary_notes:state.trip.dietary_notes});
 const next=structuredClone(state.items);next[0].lat=45;next[0].lng=27;preserveMealChoices(state,next);assert.equal(mealChoice(next[1]).name,'Chosen');assert.equal(mealChoice(next[1]).needs_review,true);assert.equal(next[1].start_time,'12:00');
 state.tripItems=[{category:'stay',title:'Hotel',address:'Stay address',lat:44.45,lng:26.1}];meal.location='Stay address';assert.equal(mealContext(state,meal).anchor.name,'Hotel');
});
test('Google-backed restaurant search filters distance, sends food/budget preferences, weights reviews, and propagates failures',async t=>{
 const old=config.googleMapsKey;config.googleMapsKey='private';t.after(()=>{config.googleMapsKey=old;});const state=fixture();
 const result=await searchMeals(state,state.items[1],async(url,options)=>{assert.equal(url,'https://places.googleapis.com/v1/places:searchText');const body=JSON.parse(options.body);assert(body.textQuery.includes('Italian'));assert(body.textQuery.includes('vegetarian'));assert.equal(body.locationBias.circle.center.latitude,44.436);assert(body.priceLevels.includes('PRICE_LEVEL_MODERATE'));return Response.json({places:[{id:'near',displayName:{text:'Provider restaurant'},formattedAddress:'Provider address',location:{latitude:44.437,longitude:26.091},primaryType:'italian_restaurant',types:['restaurant','italian_restaurant'],rating:4.8,userRatingCount:3000,priceLevel:'PRICE_LEVEL_MODERATE'},{id:'far',displayName:{text:'Far restaurant'},location:{latitude:45,longitude:27},rating:5,userRatingCount:3}]});});
 assert.equal(result.restaurants.length,1);assert.equal(result.restaurants[0].name,'Provider restaurant');assert(result.restaurants[0].maps_url.includes('query_place_id=near'));assert(qualityScore(4.8,3000)>qualityScore(5,3));assert(!JSON.stringify(result).includes('private'));
 await assert.rejects(searchMeals(state,state.items[1],async()=>{throw Error('Network unavailable');}));
});
test('PDF includes only the chosen meal and public sharing does not expose dietary notes',()=>{
 const state=fixture();state.items[1].meal_choice=JSON.stringify({name:'Chosen restaurant',category:'Italian restaurant',address:'Chosen address',maps_url:'https://www.google.com/maps/search/?api=1&query_place_id=chosen',dietary_notes:'PRIVATE_ALLERGY'});
 const html=itineraryHtml(state.trip,{dates:['2026-10-02'],items:state.items,restaurants:[{name:'ALTERNATIVE'}]},[],[],[]);assert(html.includes('Chosen restaurant'));assert(html.includes('Chosen address'));assert(!html.includes('ALTERNATIVE'));assert(!html.includes('PRIVATE_ALLERGY'));
 const shared=publicProjection(state.trip,state.items);assert.equal(shared.items[1].restaurant.name,'Chosen restaurant');assert(!JSON.stringify(shared).includes('PRIVATE_ALLERGY'));assert(!JSON.stringify(publicProjection({...state.trip,share_hide_stay:true},state.items)).includes('Chosen restaurant'));
});
