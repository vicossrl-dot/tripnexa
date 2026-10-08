import {createWeatherCache} from './cache.js';

export const weatherNumber = value => typeof value === 'number' && Number.isFinite(value);
export function localWeatherDate(time, timezone) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}
export function normalizeMetDay(data, date, timezone) {
  const series = data?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) throw Error('Invalid MET response');
  const points = series.filter(point => Number.isFinite(Date.parse(point.time)) && localWeatherDate(point.time,timezone) === date).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  if (!points.length) return null;
  const temperatures = points.map(point=>point.data?.instant?.details?.air_temperature).filter(weatherNumber);
  if (!temperatures.length) throw Error('Missing forecast temperatures');
  const winds = points.map(point=>point.data?.instant?.details?.wind_speed).filter(value=>weatherNumber(value)&&value>=0);
  let end = 0, amount = 0, hours = 0;
  const probabilities = [], symbols = [];
  for (const point of points) {
    const start = Date.parse(point.time);
    const span = [1,6,12].find(h=>point.data?.[`next_${h}_hours`]);
    if (!span) continue;
    const interval = point.data[`next_${span}_hours`], finish = start+span*3600000;
    if (interval.summary?.symbol_code) symbols.push(interval.summary.symbol_code);
    // Do not double-count overlapping intervals or invent a share across midnight.
    if (start < end || localWeatherDate(finish-1,timezone) !== date) continue;
    end = finish;
    const rain = interval.details?.precipitation_amount, chance = interval.details?.probability_of_precipitation;
    if(weatherNumber(rain)&&rain>=0){amount+=rain;hours+=span;}
    if(weatherNumber(chance)&&chance>=0&&chance<=100)probabilities.push(chance);
  }
  const counts = new Map();for(const symbol of symbols)counts.set(symbol,(counts.get(symbol)||0)+1);
  const symbol = [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  return {kind:'forecast',source:'met',...(symbol?{symbol}:{}),temperature:{highC:Math.max(...temperatures),lowC:Math.min(...temperatures)},
    ...(hours||probabilities.length?{precipitation:{...(hours?{amountMm:Math.round(amount*10)/10,coveredHours:hours}:{}),...(probabilities.length?{probabilityPercent:Math.max(...probabilities)}:{})}}:{}),
    ...(winds.length?{wind:{speedKmh:Math.round(Math.max(...winds)*3.6)}}:{}),
    coverage:{firstTime:points[0].time,lastTime:points.at(-1).time,samples:points.length},
    updatedAt:data.properties.meta?.updated_at || null};
}
export function createMetProvider(options = {}) {
  const read = createWeatherCache(options);
  return ({lat,lng}) => read(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}`,{'User-Agent':process.env.MET_WEATHER_USER_AGENT || 'TripNexa/1.0 https://tripnexa.app info@tripnexa.app','Accept':'application/json'});
}
