import {createWeatherCache} from './cache.js';
import {weatherNumber} from './provider-met.js';
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export function normalizeNasaMonth(data, date) {
  const month = months[Number(date.slice(5,7))-1], fill = data?.header?.fill_value ?? -999;
  const value = key => { const n=data?.properties?.parameter?.[key]?.[month]; return weatherNumber(n)&&n!==fill ? n : null; };
  const high = value('T2M_MAX_AVG'), low = value('T2M_MIN_AVG'), rain = value('PRECTOTCORR');
  if (high===null || low===null || data.parameters?.T2M_MAX_AVG?.units!=='C' || data.parameters?.T2M_MIN_AVG?.units!=='C') throw Error('Missing climatology temperatures');
  return {kind:'typical',source:'nasa_power',temperature:{highC:high,lowC:low},
    ...(rain!==null&&rain>=0&&data.parameters?.PRECTOTCORR?.units==='mm/day'?{precipitation:{dailyAverageMm:rain}}:{}),
    climatePeriod:data.header?.range || null,updatedAt:null};
}
export function createNasaProvider(options = {}) {
  const read = createWeatherCache({ttl:30*86400000,...options});
  return ({lat,lng}) => read(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_MAX_AVG,T2M_MIN_AVG,PRECTOTCORR&community=AG&longitude=${lng.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`);
}
