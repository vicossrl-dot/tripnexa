// Deterministic fixtures for the local browser regression, never used by runtime code.
export function installFixtures(config){
 config.googleMapsKey='fixture';config.aiKey='fixture';config.aiModel='fixture';const original=globalThis.fetch;
 const place=name=>({id:'fixture_'+name.replace(/\W/g,'_'),displayName:{text:name},formattedAddress:name+', Rome, Italy',location:{latitude:41.9,longitude:12.48},primaryType:'tourist_attraction',addressComponents:[{types:['country'],longText:'Italy'},{types:['locality'],longText:'Rome'}],businessStatus:'OPERATIONAL',regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
 globalThis.fetch=async(url,options={})=>{
  const address=String(url),json=Response.json;
  if(address.startsWith('https://routes.googleapis.com/'))return json({routes:[{duration:'900s',distanceMeters:1200}]});
  if(address.includes('/timezone/'))return json({status:'OK',timeZoneId:'Europe/Rome'});
  if(address.includes('lh3.googleusercontent.com/'))return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}});
  if(address.startsWith('https://places.googleapis.com/')){
   if(address.includes(':autocomplete'))return json({suggestions:[{placePrediction:{placeId:'fixture_Rome',text:{text:'Rome, Italy'}}}]});
   if(address.includes('/media?'))return json({photoUri:'https://lh3.googleusercontent.com/fixture'});
   if(options.headers?.['X-Goog-FieldMask']==='photos')return json({photos:[{name:'places/fixture_Rome/photos/fixture',authorAttributions:[{displayName:'Fixture author'}]}]});
   if(address.includes(':searchText')){const body=JSON.parse(options.body);if(body.includedType==='restaurant')return json({places:[{...place('Trattoria fixture'),primaryType:'italian_restaurant',types:['italian_restaurant'],rating:4.7,userRatingCount:150,priceLevel:'PRICE_LEVEL_MODERATE',googleMapsUri:'https://www.google.com/maps',servesVegetarianFood:true}]});return json({places:[place(body.textQuery.split(',')[0])]});}
   return json(place(decodeURIComponent(new URL(address).pathname.split('/').pop()).replace('fixture_','').replaceAll('_',' ')));
  }
  if(address==='https://api.openai.com/v1/responses'){
   const body=JSON.parse(options.body),name=body.text.format.name,context=JSON.parse(body.input);let data;
   if(name==='trip_names')data={names:['Roman Days','Rome Together','Roman Holiday']};
   else if(name==='planning_suggestions')data={suggestions:Array.from({length:10},(_,i)=>({name:'Garden '+i,aliases:[],category:'nature',fit_reason:'A quiet outdoor break near your hotel.',area:'Centro',address:'Rome, Italy',visit_duration_min:120,best_time_of_day:'afternoon',indoor_outdoor:'outdoor'}))};
   else if(name==='itinerary_route')data={preferred_windows:[],visits:context.selected.map(p=>({selection_id:p.selection_id,date:p.fixed_date||context.allowed_dates[1],preferred_start:p.fixed_time||'',reason:'Nearby places grouped together.'}))};
   else if(name==='itinerary_changes'){const current=context.current_itinerary||context.itinerary||context.current||[];const selected=current.find(p=>p.step_type==='visit'&&!p.protected);data={summary:'Move the requested visit.',preferred_windows:[],changes:selected?[{selection_id:selected.selection_id,action:'move',date:'2026-10-09',start_time:'',reason:'Requested day change.',name:selected.title,duration_min:60}]:[]};}
   else throw Error('Unhandled fixture schema: '+name);
   if(name==='itinerary_changes'&&data.changes.length){for(const item of context.current_itinerary.filter(i=>i.step_type==='visit'&&i.date==='2026-10-09'&&!i.protected&&context.selected.find(s=>s.id===i.selection_id)?.required===false))data.changes.unshift({selection_id:item.selection_id,action:'remove',date:item.date,start_time:'',reason:'Make space for the required visit.',name:item.title,duration_min:item.duration_min});}
   return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
  }
  return original(url,options);
 };return ()=>{globalThis.fetch=original;};
}
