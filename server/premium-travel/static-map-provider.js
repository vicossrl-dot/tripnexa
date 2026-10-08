import {config} from '../config.js';
import {setTimeout as delay} from 'node:timers/promises';
import {cachedPdfMap,mapCacheHash} from './pdf-map-cache.js';

const ENDPOINT='https://maps.geoapify.com/v1/staticmap';
const MAX_BYTES=5*1024*1024;
export const PDF_MAP_RENDER_VERSION='2';
// Shared across exports on this server process: stay below the Free plan's 5/s.
let nextRequestAt=0;
async function requestSlot(signal){
 const now=Date.now(),start=Math.max(now,nextRequestAt);nextRequestAt=start+250;
 if(start>now)await delay(start-now,undefined,{signal});
 signal?.throwIfAborted();
}
async function pngBytes(response){
 if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='image/png'||Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw new Error('Static map service unavailable.');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>MAX_BYTES)throw new Error('Static map image too large.');chunks.push(chunk);}
 return Buffer.concat(chunks);
}

// No browser key, tile scraping, new package, or account provisioning required.
// Official permission: commercial printed products + storage/redistribution.
// https://www.geoapify.com/static-maps-api/ (commercial-print FAQ)
export function createStaticMapProvider({apiKey=config.pdfStaticMapKey,fetchImpl=globalThis.fetch,ownerId,tripId,cacheDirectory=config.pdfStaticMapCacheDir,style='osm-bright',renderVersion=PDF_MAP_RENDER_VERSION}={}){
 const hasKey=typeof apiKey==='string'&&Boolean(apiKey.trim());
 if(!hasKey&&!(ownerId&&tripId))return null;
 const images=new Map();
 const scope=ownerId&&tripId?mapCacheHash({ownerId,tripId}):null;
 return {
  name:'Geoapify Static Maps',dataSource:'openstreetmap',
  printLicense:{permitsCustomerPdfs:true,url:'https://www.geoapify.com/static-maps-api/'},
  attribution:[{text:'Powered by Geoapify',url:'https://www.geoapify.com/'},{text:'© OpenMapTiles',url:'https://openmaptiles.org/'}],
  render({viewport,dayContext,signal}){
   const identity={provider:'geoapify',renderVersion,style,scaleFactor:2,attribution:'default',viewport,...(scope?{day:dayContext}:{} )},key=mapCacheHash(identity);if(images.has(key))return images.get(key);
   const image=(async()=>{
    const {width,height,bounds}=viewport;
    // Exact padded Web Mercator bounds avoid provider-specific zoom/tile sizes.
    // Area has this same projected aspect ratio; no pitch/rotation/geometries.
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||![bounds?.west,bounds?.south,bounds?.east,bounds?.north].every(Number.isFinite)||bounds.east<=bounds.west||bounds.north<=bounds.south)throw new Error('Invalid static map viewport.');
    const validate=bytes=>Buffer.isBuffer(bytes)&&bytes.length>=24&&bytes.length<=MAX_BYTES&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.readUInt32BE(16)===width*2&&bytes.readUInt32BE(20)===height*2;
    const generate=async()=>{
     if(!hasKey){const error=new Error('Static map key is not configured.');error.code='MAP_KEY_NOT_CONFIGURED';throw error;}
     const url=new URL(ENDPOINT);url.search=new URLSearchParams({apiKey:apiKey.trim(),style,format:'png',width:String(width),height:String(height),scaleFactor:'2',area:`rect:${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,pitch:'0',bearing:'0',attribution:'default'}).toString();
     await requestSlot(signal);
     const bytes=await pngBytes(await fetchImpl(url,{signal,redirect:'error',headers:{Accept:'image/png'}}));
     if(!validate(bytes))throw new Error('Invalid static map image.');return bytes;
    };
    if(scope&&(!dayContext?.date||!Array.isArray(dayContext.stops)))throw new Error('Missing PDF map cache context.');
    const bytes=scope?await cachedPdfMap({directory:cacheDirectory,scope,key,validate,generate,signal}):await generate();
    return {dataUrl:'data:image/png;base64,'+bytes.toString('base64'),viewport};
   })();images.set(key,image);return image;
  }
 };
}
