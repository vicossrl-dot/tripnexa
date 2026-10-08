import {mapCoordinates} from '../../src/lib/interactive-trip-map.js';
import {tripDates} from '../../src/lib/trip-presentation.js';
import {createMetProvider,normalizeMetDay} from './provider-met.js';
import {createNasaProvider,normalizeNasaMonth} from './provider-nasa-power.js';

const label = value => value.city || value.name || value.title || value.address;
export function dayWeatherLocation(state,date) {
  const {trip,items,stays=[],selections=[]}=state;
  const staysToday=stays.filter(stay=>stay.category==='stay'&&stay.date&&stay.date<=date&&(!stay.end_date||stay.end_date>=date)&&mapCoordinates(stay)).sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
  if(staysToday.length)return {...mapCoordinates(staysToday[0]),locationLabel:label(staysToday[0])||trip.destination};
  const daily=items.filter(item=>item.date===date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||'')||(a.sort_order||0)-(b.sort_order||0)||String(a.id).localeCompare(String(b.id)));
  for(const item of daily.filter(item=>['visit','activity','meal'].includes(item.step_type))) {
    let source=item;
    if(item.step_type==='meal'){try{source=JSON.parse(item.meal_choice)||item;}catch{continue;}}
    if(!mapCoordinates(source)&&item.selection_id){const selected=selections.find(p=>p.id===item.selection_id&&(!item.place_id||p.place_id===item.place_id)&&(!item.address||p.address===item.address));if(selected)source=selected;}
    if(mapCoordinates(source))return {...mapCoordinates(source),locationLabel:label(source)||trip.destination};
  }
  const position=mapCoordinates({lat:trip.destination_latitude,lng:trip.destination_longitude});
  return position?{...position,locationLabel:trip.destination_city||trip.destination}:null;
}

export function createWeatherService({met=createMetProvider(),nasa=createNasaProvider()}={}) {
  return async state => {
    if(!state.items.length)return {days:[]};
    const dates=tripDates(state.trip,{items:state.items}), requests=new Map();
    const once=(provider,location)=>{const key=`${provider}:${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;if(!requests.has(key))requests.set(key,(provider==='met'?met:nasa)(location));return requests.get(key);};
    const timezone=state.trip.timezone;
    const days=await Promise.all(dates.map(async date=>{
      const location=dayWeatherLocation(state,date), base={date,locationLabel:location?.locationLabel||state.trip.destination||''};
      if(!location)return {...base,kind:'unavailable'};
      try {
        if(!timezone)throw Error('Missing local timezone');
        new Intl.DateTimeFormat('en',{timeZone:timezone});
        const forecast=normalizeMetDay(await once('met',location),date,timezone);
        // A failed MET response cannot establish the forecast horizon. Do not mask it with climate data.
        const weather=forecast || normalizeNasaMonth(await once('nasa',location),date);
        return {...base,...weather};
      } catch {return {...base,kind:'unavailable'};}
    }));
    return {days};
  };
}
export const tripWeather = createWeatherService();
