import { t, translateText, getLocale } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import {createContext,useContext,useEffect,useState,useRef} from 'react';
import {Sun,Cloud,CloudSun,CloudRain,CloudSnow,CloudLightning,CloudFog,Thermometer} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {api} from '@/api/client';
import {friendlyDate,dateRange} from '@/lib/trip-presentation';
import {weatherKindLabel,temperatureLabel,weatherCondition,readWeatherUnit,saveWeatherUnit,loadTripWeather,WEATHER_UNIT_KEY} from '@/lib/trip-weather';
import '@/styles/trip-weather.css';

/** @typedef {{date:string,locationLabel:string,kind:string,symbol?:string,temperature?:{highC:number,lowC:number},precipitation?:{amountMm?:number,coveredHours?:number,probabilityPercent?:number,dailyAverageMm?:number},wind?:{speedKmh:number},coverage?:{firstTime:string,lastTime:string,samples:number},climatePeriod?:string,updatedAt?:string}} WeatherDay */
/** @type {import('react').Context<{days:WeatherDay[],dates:string[],loading:boolean,unit:string,setUnit:(unit:string)=>void,open:(date?:string)=>void}|null>} */
const Context=createContext(null);

function WeatherIcon({day}) {
  useLocale();
  const icons={sun:Sun,cloud:Cloud,sunCloud:CloudSun,rain:CloudRain,snow:CloudSnow,thunder:CloudLightning,fog:CloudFog,temperature:Thermometer};
  const Icon=icons[weatherCondition(day?.symbol).icon]||Thermometer;
  return <Icon size={20} aria-hidden="true"/>;
}
function WeatherSummary({day,unit}) {
  useLocale();
  return <><WeatherIcon day={day}/><span><strong>{day?.temperature?`${temperatureLabel(day.temperature.highC,unit)} / ${temperatureLabel(day.temperature.lowC,unit)}${unit}`:t("ui.weather.unavailable.110985c")}</strong><small>{translateText(weatherKindLabel(day))}</small></span></>;
}
function UnitToggle() {
  useLocale();
  const weather=useContext(Context);
  return <div className="weather-unit-toggle" role="group" aria-label={t("ui.temperature.unit.e50c0db")}>{["C","F"].map(unit=><button key={unit} type="button" aria-pressed={weather.unit===unit} onClick={()=>weather.setUnit(unit)} aria-label={unit==='C'?t("ui.celsius.618a6bf"):t("ui.fahrenheit.02041e8")}>°{translateText(unit)}</button>)}</div>;
}

export function TripWeather({trip,dates,revision,children}) {
  useLocale();
  const [days,setDays]=useState([]),[loading,setLoading]=useState(true),[unit,setUnitState]=useState(readWeatherUnit);
  const [dialog,setDialog]=useState(null),restore=useRef(null);
  const key=`${trip.id}:${revision}:${dates.join(',')}`;
  useEffect(()=>{
    let active=true;setLoading(true);setDays([]);
    loadTripWeather(key,()=>api.tripWeather(trip.id)).then(data=>{if(active)setDays(data.days);}).catch(()=>{if(active)setDays([]);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[key,trip.id]);
  useEffect(()=>{const sync=event=>{if(event.key===WEATHER_UNIT_KEY)setUnitState(readWeatherUnit());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const setUnit=value=>{setUnitState(value);saveWeatherUnit(value);};
  const open=(date=null)=>{if(!dialog)restore.current=document.activeElement;setDialog(date||'trip');};
  const day=days.find(value=>value.date===dialog);
  return <Context.Provider value={{days,dates,loading,unit,setUnit,open}}>{children}
    <Dialog open={Boolean(dialog)} onOpenChange={value=>{if(!value)setDialog(null);}}>
      <DialogContent className="trip-modal trip-weather-dialog" onCloseAutoFocus={event=>{event.preventDefault();restore.current?.focus({preventScroll:true});}}>
        <header><DialogTitle>{dialog==='trip'?t("ui.trip.weather.ba8dfa1"):t("ui.day.weather.e91b9bc")}</DialogTitle><DialogDescription>{dialog==='trip'?`${trip.destination_city||trip.destination} · ${dateRange(trip)}`:friendlyDate(dialog,{weekday:'long',month:'long'})}</DialogDescription></header>
        <UnitToggle/>
        {dialog==='trip'?<div className="weather-overview">{dates.map(date=>{
          const value=days.find(day=>day.date===date);
          return <button type="button" key={date} className="weather-overview-day" onClick={()=>open(date)} aria-label={t("ui.day.weather.value.value.70eca0b", {v0: friendlyDate(date,{weekday:'long'}), v1: weatherKindLabel(value)})}><span>{friendlyDate(date,{weekday:'short'})}<small>{value?.locationLabel||trip.destination}</small></span>{loading?<span role="status">{t("ui.loading.weather.ff98814")}</span>:<WeatherSummary day={value} unit={unit}/>}</button>;
        })}</div>:loading?<p role="status">{t("ui.loading.weather.ff98814")}</p>:<DayDetail day={day} unit={unit}/>}
        <p className="weather-note">{t("ui.weather.is.planning.information.your.saved.itinerary.stays.unchan.0d162be")}</p>
        {dialog!=='trip'&&<button className="trip-button secondary" onClick={()=>setDialog('trip')}>{t("ui.all.trip.weather.b477506")}</button>}
      </DialogContent>
    </Dialog>
  </Context.Provider>;
}

function DayDetail({day,unit}) {
  useLocale();
  if(!day||day.kind==='unavailable')return <p role="status">{t("ui.weather.unavailable.forecast.data.saved.coordinates.or.the.trip.t.0f5cbc7")}</p>;
  const typical=day.kind==='typical',condition=weatherCondition(day.symbol).label;
  return <div className="weather-detail">
    <p className="weather-location">{day.locationLabel}</p><p className="weather-source-label"><WeatherIcon day={day}/>{translateText(weatherKindLabel(day))}</p>
    {typical?<p className="weather-note">{t("ui.typical.for.37f6c86")}{" "}{friendlyDate(day.date,{month:'long',day:undefined})}{t('qa.climate.note')}</p>:condition&&<p>{translateText(condition)}</p>}
    <dl>
      <div><dt>{typical?t("ui.average.high.c27088c"):t("ui.high.forecast.samples.77a7d6c")}</dt><dd>{temperatureLabel(day.temperature.highC,unit)}{unit}</dd></div>
      <div><dt>{typical?t("ui.average.low.57628f1"):t("ui.low.forecast.samples.3e41cff")}</dt><dd>{temperatureLabel(day.temperature.lowC,unit)}{unit}</dd></div>
      {typeof day.precipitation?.amountMm==='number'&&<div><dt>{t("ui.precipitation.74a4498")}{day.precipitation.coveredHours}{" "}{t("ui.forecast.hours.57b3aa6")}</dt><dd>{day.precipitation.amountMm}{" "}{t("ui.mm.8fa1ddd")}</dd></div>}
      {typeof day.precipitation?.dailyAverageMm==='number'&&<div><dt>{t("ui.typical.daily.precipitation.3441d40")}</dt><dd>{day.precipitation.dailyAverageMm}{" "}{t("ui.mm.day.f8d89d9")}</dd></div>}
      {typeof day.precipitation?.probabilityPercent==='number'&&<div><dt>{t("ui.highest.interval.precipitation.chance.1a05709")}</dt><dd>{day.precipitation.probabilityPercent}%</dd></div>}
      {typeof day.wind?.speedKmh==='number'&&<div><dt>{t("ui.highest.forecast.wind.0c309ba")}</dt><dd>{day.wind.speedKmh}{" "}{t("ui.km.h.3c9db5a")}</dd></div>}
    </dl>
    {!typical&&<p className="weather-note">{t("ui.values.summarize.available.forecast.samples.today.and.the.end.of.d7440d3")}</p>}
    <footer className="weather-attribution">{typical?<><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">{t("ui.nasa.power.f54c431")}</a>{day.climatePeriod&&<p>{day.climatePeriod}</p>}</>:<><a href="https://www.met.no/en" target="_blank" rel="noopener noreferrer">{t("ui.met.norway.876d629")}</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">{t("ui.cc.by.4.0.c46701f")}</a>{day.updatedAt&&<p>{t("ui.provider.update.c536558")}{" "}{new Date(day.updatedAt).toLocaleString(getLocale())}</p>}</>}</footer>
  </div>;
}
export function TripWeatherAction() {
  useLocale();
  const weather=useContext(Context);if(!weather)return null;
  return <button type="button" className="trip-button secondary trip-weather-action" onClick={()=>weather.open()}><CloudSun size={18} aria-hidden="true"/>{t("ui.trip.weather.ba8dfa1")}</button>;
}
export function DayWeatherChip({date}) {
  useLocale();
  const weather=useContext(Context);if(!weather)return null;
  const day=weather.days.find(value=>value.date===date);
  return <button type="button" className="day-weather-chip" disabled={weather.loading} aria-label={t("ui.day.weather.value.value.70eca0b", {v0: friendlyDate(date,{weekday:'long'}), v1: weather.loading?'Loading weather':weatherKindLabel(day)})} onClick={()=>weather.open(date)}>{weather.loading?<><Thermometer size={20} aria-hidden="true"/><span role="status">{t("ui.loading.weather.ff98814")}</span></>:<WeatherSummary day={day} unit={weather.unit}/>}</button>;
}
