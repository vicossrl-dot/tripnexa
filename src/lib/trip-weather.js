export const weatherKindLabel = day => day?.kind==='forecast'?'Forecast':day?.kind==='typical'?'Typical weather':'Weather unavailable';
export const temperatureLabel = (value,unit) => typeof value==='number'&&Number.isFinite(value)?`${Math.round(unit==='F'?value*9/5+32:value)}°`: '—';
export function weatherCondition(symbol) {
  const code=String(symbol||'').replace(/_(day|night|polartwilight)$/,'');
  if(code.includes('thunder'))return {icon:'thunder',label:'Thunderstorms'};
  if(code.includes('sleet'))return {icon:'snow',label:'Sleet'};
  if(code.includes('snow'))return {icon:'snow',label:'Snow'};
  if(code.includes('rain'))return {icon:'rain',label:code.includes('heavy')?'Heavy rain':code.includes('light')?'Light rain':'Rain'};
  if(code==='clearsky')return {icon:'sun',label:'Clear sky'};
  if(code==='fair')return {icon:'sunCloud',label:'Mostly clear'};
  if(code==='partlycloudy')return {icon:'sunCloud',label:'Partly cloudy'};
  if(code==='cloudy')return {icon:'cloud',label:'Cloudy'};
  if(code==='fog')return {icon:'fog',label:'Fog'};
  return {icon:'temperature',label:''};
}
export const WEATHER_UNIT_KEY='tripnexa.weather.temperature-unit';
export function readWeatherUnit(){try{return localStorage.getItem(WEATHER_UNIT_KEY)==='F'?'F':'C';}catch{return 'C';}}
export function saveWeatherUnit(unit){try{localStorage.setItem(WEATHER_UNIT_KEY,unit);}catch{/* A blocked preference store must not block weather. */}}

// One browser request per saved itinerary revision, with a short bounded cache.
const requests=new Map();
export function loadTripWeather(key,load,now=Date.now()) {
  const old=requests.get(key);if(old&&old.expires>now)return old.promise;
  const promise=Promise.resolve().then(load);
  requests.delete(key);requests.set(key,{promise,expires:now+300000});
  while(requests.size>24)requests.delete(requests.keys().next().value);
  return promise;
}
