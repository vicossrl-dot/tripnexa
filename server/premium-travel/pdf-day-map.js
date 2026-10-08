import {pdfLabel} from '../pdf-i18n.js';
import {escapeHtml as e} from '../itinerary-pdf.js';
import {mapCoordinates} from '../../src/lib/interactive-trip-map.js';

const WIDTH=600,HEIGHT=220,PADDING=28;
const worldY=lat=>{const sine=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180);return .5-Math.log((1+sine)/(1-sine))/(4*Math.PI);};
const latitude=y=>Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;
const longitude=x=>((x*360+180)%360+360)%360-180;
const label=stop=>stop.kind==='stay'?'H':String(stop.number??'?');

export function fitPdfMapViewport(day){
 const saved=day.stops.map(stop=>({stop,position:mapCoordinates(stop.position)})).filter(value=>value.position);
 if(!saved.length)return null;
 const sorted=saved.map(({position})=>(position.lng+360)%360).sort((a,b)=>a-b);let gap=-1,west=sorted[0];
 for(let i=0;i<sorted.length;i++){const next=sorted[(i+1)%sorted.length]+(i===sorted.length-1?360:0),distance=next-sorted[i];if(distance>gap){gap=distance;west=next%360;}}
 const coordinates=saved.map(value=>({...value,x:((value.position.lng+360)%360<west?(value.position.lng+360)%360+360:(value.position.lng+360)%360)/360,y:worldY(value.position.lat)}));
 const xs=coordinates.map(value=>value.x),ys=coordinates.map(value=>value.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const zoom=Math.max(0,Math.min(16,Math.floor(Math.min(Math.log2((WIDTH-2*PADDING)/(256*Math.max(maxX-minX,1e-9))),Math.log2((HEIGHT-2*PADDING)/(256*Math.max(maxY-minY,1e-9)))))));
 const scale=256*2**zoom,centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
 return {width:WIDTH,height:HEIGHT,zoom,center:{lat:latitude(centerY),lng:longitude(centerX)},
  bounds:{west:(centerX-WIDTH/2/scale)*360-360*Math.floor(centerX+.5),east:(centerX+WIDTH/2/scale)*360-360*Math.floor(centerX+.5),north:latitude(centerY-HEIGHT/2/scale),south:latitude(centerY+HEIGHT/2/scale)},
  points:coordinates.map(value=>({stop:value.stop,x:WIDTH/2+(value.x-centerX)*scale,y:HEIGHT/2+(value.y-centerY)*scale}))};
}
// Full Book can show the saved hotel even when the schedule contains no hotel
// transfer. This read-only copy does not change itinerary numbering or routes.
export function pdfDayWithAccommodation(day,stays){
 const hotels=stays.filter(stay=>stay.category==='stay'&&(!stay.date||stay.date<=day.date)&&(!stay.end_date||stay.end_date>=day.date)&&mapCoordinates(stay));
 const extra=hotels.filter(stay=>!day.stops.some(stop=>stop.kind==='stay'&&mapCoordinates(stop.position)?.lat===mapCoordinates(stay).lat&&mapCoordinates(stop.position)?.lng===mapCoordinates(stay).lng)).map(stay=>({kind:'stay',name:stay.title||'Accommodation',position:mapCoordinates(stay)}));
 return {...day,stops:[...extra,...day.stops],accommodation:hotels.map(stay=>({id:stay.id||null,name:stay.title||'',address:stay.address||'',position:mapCoordinates(stay)}))};
}
function mapMarkup(day,viewport,basemap=null){
 const unmapped=day.stops.filter(stop=>!mapCoordinates(stop.position)),missing=unmapped.length?`<p class="fine unmapped-stops"><strong>${e(pdfLabel("Not shown on map:"))}</strong> ${[...new Set(unmapped.map(stop=>`${label(stop)}. ${e(stop.name)}`))].join(', ')}</p>`:'';
 if(!viewport)return `<p class="muted">${e(pdfLabel("No saved coordinates available for this day."))}</p>${missing}`;
 const key=String(day.date||'saved-day').replace(/[^a-z0-9-]/gi,''),groups=new Map(),positions=new Map();
 for(const point of viewport.points){const id=point.x.toFixed(5)+':'+point.y.toFixed(5);if(!groups.has(id))groups.set(id,{...point,stops:[]});groups.get(id).stops.push(point.stop);positions.set(point.stop,point);}
 let previous=null;const path=[];
 for(const stop of day.stops){const point=positions.get(stop);if(point){path.push(`${previous?'L':'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);previous=point;}else previous=null;}
 const markers=[...groups.values()].map(({x,y,stops})=>{
  const labels=[...new Set(stops.map(label))],stay=stops.some(stop=>stop.kind==='stay'),text=labels.join(' / '),width=Math.min(540,Math.max(24,text.length*7+14)),badgeX=Math.max(width/2+8,Math.min(WIDTH-width/2-8,x)),badgeY=Math.max(16,Math.min(HEIGHT-16,y));
  return `<g class="pdf-stop"><title>${e(stops.map(stop=>stop.name).join(' / '))}</title>${labels.length>1?`<circle cx="${x}" cy="${y}" r="3" fill="#854531"/><path d="M${x} ${y}L${badgeX} ${badgeY}" stroke="#854531"/>`:''}<rect x="${badgeX-width/2}" y="${badgeY-12}" width="${width}" height="24" rx="12" fill="${stay?'#292c2b':'#ffc7b0'}" stroke="#854531"/><text x="${badgeX}" y="${badgeY+4}" text-anchor="middle" fill="${stay?'white':'#292c2b'}" font-size="11" font-family="TripNexaSans">${e(text)}</text></g>`;
 }).join('');
 const background=basemap?`<image href="${e(basemap.dataUrl)}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="none"/>`:`<defs><pattern id="grid-${key}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#dde2d8" stroke-width="1"/></pattern></defs><rect width="600" height="220" fill="#f3f5ef"/><rect width="600" height="220" fill="url(#grid-${key})"/><text x="12" y="17" font-size="10" fill="#646963" font-family="TripNexaSans">${e(pdfLabel("Schematic overview · saved coordinates"))}</text>`;
 const attribution=basemap?`<p class="fine map-attribution">${basemap.attribution.map(item=>`${e(item.text)} · <a href="${e(item.url)}">${e(item.url)}</a>`).join(' · ')}</p>`:'';
 return `<svg class="day-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${basemap?'Geographic':'Schematic'} map of saved stops">${background}${basemap?'':`<path d="${path.join(' ')}" fill="none" stroke="#9a8375" stroke-width="1.6" stroke-dasharray="5 4"/>`}${markers}<path d="M582 28V12m-4 5 4-5 4 5" fill="none" stroke="#646963"/><text x="582" y="39" text-anchor="middle" font-family="TripNexaSans" font-size="9" fill="#646963">N</text></svg>${attribution}<p class="map-legend">${[...new Set(viewport.points.map(({stop})=>`${label(stop)}. ${e(stop.name)}`))].join(' · ')}</p>${missing}<p class="fine">${basemap?pdfLabel("H = accommodation. No road route is drawn; use the live route for directions."):pdfLabel("Lines indicate itinerary order, not road geometry. H = accommodation. Schematic map; geographic basemap unavailable.")}</p>`;
}
export function schematicDayMap(day){return mapMarkup(day,fitPdfMapViewport(day));}
function approvedBasemap(provider,image,viewport){
 if(!provider?.printLicense?.permitsCustomerPdfs||typeof provider.printLicense.url!=='string'||!/^https:\/\//.test(provider.printLicense.url))return null;
 if(/google|gstatic|googleapis/i.test(JSON.stringify({name:provider.name,license:provider.printLicense,attribution:provider.attribution,dataSource:provider.dataSource})))return null;
 if(!image||typeof image.dataUrl!=='string'||image.dataUrl.length>7000000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl))return null;
 const png=Buffer.from(image.dataUrl.split(',')[1],'base64');
 if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(width<WIDTH||height<HEIGHT||width>4096||height>4096||Math.abs(width/height-WIDTH/HEIGHT)>.01)return null;
 // Provider must honor this exact Web Mercator viewport; never shift markers to fit imagery.
 if(JSON.stringify(image.viewport)!==JSON.stringify(viewport))return null;
 const attribution=(provider.attribution||[]).filter(item=>typeof item.text==='string'&&item.text.length<=250&&typeof item.url==='string'&&/^https:\/\//.test(item.url));
 if(!attribution.length)return null;
 if(provider.dataSource==='openstreetmap')attribution.push({text:'© OpenStreetMap contributors · ODbL',url:'https://www.openstreetmap.org/copyright'});
 return {dataUrl:image.dataUrl,attribution};
}
// No provider is enabled/configured by default. An explicitly approved server adapter
// may supply a PNG for this viewport; this module never fetches Google or public tiles.
export async function renderDayMap(day,provider=null){
 const viewport=fitPdfMapViewport(day);if(!viewport)return mapMarkup(day,null);
 const imageViewport={width:viewport.width,height:viewport.height,zoom:viewport.zoom,center:viewport.center,bounds:viewport.bounds};
 const dayContext={date:day.date,stops:day.stops.filter(stop=>mapCoordinates(stop.position)).map(stop=>({id:stop.id||null,kind:stop.kind,number:stop.number??null,position:mapCoordinates(stop.position)})),accommodation:day.accommodation||[]};
 let basemap=null;
 try{if(provider?.printLicense?.permitsCustomerPdfs&&typeof provider.printLicense.url==='string'&&/^https:\/\//.test(provider.printLicense.url)&&typeof provider.render==='function'&&!/google|gstatic|googleapis/i.test(JSON.stringify({name:provider.name,license:provider.printLicense,attribution:provider.attribution,dataSource:provider.dataSource}))){
  let timer;try{const image=await Promise.race([provider.render({viewport:imageViewport,dayContext,signal:AbortSignal.timeout(5000)}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);basemap=approvedBasemap(provider,image,imageViewport);}finally{clearTimeout(timer);}
 }}catch{/* Export always remains available with the schematic fallback. */}
 return mapMarkup(day,viewport,basemap);
}
