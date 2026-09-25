import { mealChoice } from '../src/lib/dining.js';
import { itineraryTimeLabel } from '../src/lib/itinerary-time-label.js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transaction } from './db.js';
import { snapshot, present } from './itinerary-service.js';
import { readWallet } from './wallet.js';
import { relatedWalletItems } from '../src/lib/wallet-links.js';
import { assert } from './errors.js';
import {runtimeSettings} from './admin/runtime.js';

export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
export function itineraryHtml(trip,plan,stays,places,wallet){
  const e=escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${e(trip.name)} - TripSync</title><style>
  @page{size:A4;margin:19mm 17mm 20mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#242426;background:white;font-size:10pt;line-height:1.4;margin:0}h1{font-size:28pt;line-height:1.1;margin:8px 0 12px;letter-spacing:-1px}h2{font-size:17pt;line-height:1.2;margin:0 0 5px}h3{font-size:11pt;margin:0}.brand{letter-spacing:2px;text-transform:uppercase;font-size:10pt;font-weight:bold;color:#a35539}.sub{color:#65656b}.cover{border-bottom:3px solid #ffc7b0;padding-bottom:20px;margin-bottom:20px}.summary{display:flex;gap:35px;background:#fff4ee;padding:14px 18px;border-radius:8px;margin:18px 0}.label{font-size:8pt;letter-spacing:1px;text-transform:uppercase;color:#6b625c}.stays{border:1px solid #ddd;border-radius:8px;padding:14px 18px;margin-bottom:20px}.stay{margin-top:8px}.day{break-before:page}.day.first{break-before:auto}.day-heading{break-after:avoid;margin:22px 0 15px;border-bottom:1px solid #e4dedb;padding-bottom:12px}.entry{display:flex;gap:18px;border:1px solid #e4e4e7;border-left:3px solid #ffc7b0;border-radius:6px;padding:9px 12px;margin:0 0 7px;break-inside:avoid;page-break-inside:avoid}.time{flex:0 0 90px;font-size:9pt;color:#515158;font-variant-numeric:tabular-nums}.content{min-width:0;overflow-wrap:anywhere}.type{font-size:7pt;text-transform:uppercase;letter-spacing:1px;color:#8d5944}.detail{font-size:9pt;color:#5d5e66;margin-top:3px}.note{font-size:9pt;background:#f5f5f6;border-radius:6px;padding:12px;margin:16px 0;break-inside:avoid}.ticket{font-size:8pt;color:#476b55;margin-top:4px}.minor{padding:5px 12px;background:#fafafa}.minor h3{font-size:9pt;font-weight:normal}.minor .type{display:none}.free{border-left-color:#ddd}.transport{border-left-color:#9eb9cf}.meal{border-left-color:#d1b27b}</style></head><body>
  <header class="cover"><div class="brand">TripSync · Your travel itinerary</div><h1>${e(trip.name)}</h1><div>${e([trip.destination_city||trip.destination,trip.country].filter(Boolean).join(', '))}</div><div class="sub">${e(trip.start_date)} — ${e(trip.end_date)} · ${e(trip.timezone||'Local destination time')}</div></header>
  <div class="summary"><div><div class="label">Travelers</div>${e(trip.adults||1)} adult(s)${trip.children_ages?` · ${e(String(trip.children_ages).split(',').filter(Boolean).length)} child(ren)`:''}</div><div><div class="label">Travel type</div>${e(trip.travel_type||'Not specified')}</div></div>
  ${stays.length?`<section class="stays"><h3>Your stay${stays.length>1?'s':''}</h3>${stays.map(stay=>`<div class="stay"><strong>${e(stay.title||'Accommodation')}</strong><div class="detail">${e(stay.address||'Address to confirm')}<br>${e(stay.date||trip.start_date)} — ${e(stay.end_date||trip.end_date)}${stay.check_in_time?` · Check-in ${e(stay.check_in_time)}`:''}${stay.check_out_time?` · Check-out ${e(stay.check_out_time)}`:''}</div></div>`).join('')}</section>`:''}
  ${plan.dates.map((date,index)=>`<section class="day ${index===0?'first':''}"><header class="day-heading"><div class="brand">Day ${index+1}</div><h2>${e(dateLabel(date))}</h2></header>${plan.items.filter(item=>item.date===date).map(item=>{
    const choice=item.step_type==='meal'?mealChoice(item):null;
    const ticket=relatedWalletItems(item,wallet,places).length?'Ticket / reservation added':item.ticket_status==='purchased'?'Booking confirmed':item.ticket_status==='free'?'No ticket required':item.step_type==='visit'?'Check booking / ticket requirements':'';
    return `<article class="entry ${e(item.step_type)} ${['free','break','access'].includes(item.step_type)?'minor':''}"><div class="time">${e(itineraryTimeLabel(item))}</div><div class="content"><div class="type">${e(item.step_type==='access'?'Time buffer':item.step_type)}</div><h3>${e(choice?'Meal - '+choice.name:item.title)}</h3>${choice?`<div class="detail">${e(choice.category)}<br>${e(choice.address)}</div>`:''}${item.step_type==='transport'?`<div class="detail">${e(item.route_mode)} · approximately ${e(item.route_duration_min)} min</div>`:!choice&&!['free','break','access'].includes(item.step_type)&&item.location&&item.location!==item.title?`<div class="detail">${e(item.location)}</div>`:''}${ticket?`<div class="ticket">${e(ticket)}</div>`:''}</div></article>`;
  }).join('')||'<p class="sub">No activities scheduled. Free day.</p>'}</section>`).join('')}
  <div class="note">All times are local. Travel durations and opening hours are estimates: check live routes, reservations and accessibility before departure. Private documents and ticket files are not included in this itinerary.</div></body></html>`;
}
let running=0;
export async function renderPdf(html){
  assert(running<(runtimeSettings()?.quotas.concurrent_pdfs||2),503,'PDF export is busy. Try again in a moment.');running++;
  let directory,child,socket;const pending=new Map();
  try{
    directory=await mkdtemp(path.join(os.tmpdir(),'tripsync-pdf-'));
    child=spawn(process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome'),['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+directory,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome timeout')),15000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.stderr.on('data',chunk=>{const match=chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
    socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome connection timeout')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();});socket.addEventListener('error',reject);});
    let sequence=0,session;
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error('PDF rendering failed')):p.resolve(message.result);}});
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('PDF timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});
    const target=await command('Target.createTarget',{url:'about:blank'});session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['*']});await command('Emulation.setScriptExecutionDisabled',{value:true});
    const {frameTree}=await command('Page.getFrameTree');await command('Page.setDocumentContent',{frameId:frameTree.frame.id,html});
    const result=await command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px Arial;width:100%;margin:0 17mm;color:#777;display:flex;justify-content:space-between"><span>TripSync · Travel itinerary</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
    await command('Browser.close').catch(()=>{});return Buffer.from(result.data,'base64');
  }catch{assert(false,503,'PDF export could not finish. Check that Chrome is available on the backend (CHROME_PATH), then retry. Your itinerary is unchanged.');}
  finally{for(const p of pending.values())clearTimeout(p.timer);socket?.close();child?.kill();running--;if(directory&&path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('tripsync-pdf-'))await rm(directory,{recursive:true,force:true,maxRetries:4,retryDelay:150}).catch(()=>{});}
}
export async function exportItineraryPdf(tripId,ownerId){
  const state=await transaction(db=>snapshot(db,tripId,ownerId));const plan=await present(state);
  assert(plan.items.length,400,'Generate an itinerary before downloading it.');
  const wallet=await readWallet(tripId,ownerId);
  return renderPdf(itineraryHtml(state.trip,plan,state.tripItems.filter(item=>item.category==='stay'),state.places,wallet.items));
}
