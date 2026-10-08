import { Router, static as staticFiles } from 'express';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db.js';
import { assert } from '../errors.js';
import { config } from '../config.js';
import { getAppUrls } from '../app-urls.js';
import { readSettings } from '../admin/settings.js';
import { recordEvent } from '../admin/telemetry.js';
import { publicCatalog, visibleWhere, sourceJoins, canonicalFor, PUBLIC_ORIGIN, loadPublic } from './service.js';
import { destinationByKey } from './catalog.js';
import { renderItinerary, renderUnavailable, renderCollection, escapeHtml as e } from './render.js';
import { publicPaymentMethods } from './payments.js';

export const publicItineraryApi=Router();
publicItineraryApi.use(async(req,res,next)=>{
  const urls=await getAppUrls(),origin=req.get('Origin');
  const allowed=new Set([urls.site.value,'https://tripnexa.app',...(!config.production?['http://127.0.0.1:4321','http://localhost:4321']:[])]);
  res.vary('Origin');res.set('Cache-Control','no-store');
  if(origin&&allowed.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');}
  if(req.method==='OPTIONS')return res.sendStatus(origin&&allowed.has(origin)?204:403);
  next();
});
publicItineraryApi.get('/itineraries',async(req,res)=>{
  const all=await readSettings();assert(all.features.public_sharing&&!all.settings.maintenance_enabled,503,'Public examples are temporarily unavailable.');
  const result=await publicCatalog(req.query);
  void recordEvent(Object.keys(req.query).some(k=>['city','country','duration','persona','intent'].includes(k))?'trip_examples_filter':'trip_examples_view',null);
  res.json(result);
});
publicItineraryApi.get('/payment-methods',async(_req,res)=>res.json(await publicPaymentMethods()));

const SHARD_SIZE=5000;
export const publicItineraryPages=Router();
publicItineraryPages.use('/public-itinerary-assets',staticFiles(fileURLToPath(new URL('./assets',import.meta.url)),{maxAge:'1d',dotfiles:'deny',fallthrough:true}));
publicItineraryPages.get('/public-itinerary-assets/:city.svg',(req,res)=>{
  const d=destinationByKey(req.params.city);assert(d,404,'Image not found.');
  // Original code-native illustration. No photos, user imagery, hidden coordinates or remote assets.
  const themes={rome:['#ffceb3','#b56746'],paris:['#e1d5e8','#70567e'],tokyo:['#f5d6d0','#a9514a'],kyoto:['#d9e5cb','#597345'],london:['#d6e3e4','#486d74'],'new-york-city':['#d5dfe9','#4f657d'],barcelona:['#f1dfb9','#9b742c']};
  const [background,ink]=themes[d.key]||['#e0e6d5','#597156'];
  const shapes=d.key==='paris'?'<path d="M320 95 265 295h110L320 95m-32 115h65m-74 40h82m-77 45 36-54 36 54"/>':d.key==='rome'?'<path d="M180 280V190q140-65 280 0v90Zm0-45q140-50 280 0M210 272v-56m55 48v-64m55 58v-68m55 74v-64m55 72v-56"/>':['tokyo','kyoto'].includes(d.key)?'<path d="M215 165h210m-200 23h190m-168-23v130m146-130v130m-152-70h158M202 155q118 30 236 0"/>':d.key==='london'?'<path d="M215 280V160h65v120m-53-120v-30h41v30m-52-30 32-36 21 36m-21 44v28m0-14h14m32 92h145v-60H280"/>':'<path d="M165 280v-70h60v70m0 0V145h65v135m0 0V180h60v100m0 0V120h65v160m0 0v-90h60v90m-294-49h26m27-60h30m-30 36h30m25 5h29m32-65h29m-29 35h29m32 35h24"/>';
  res.type('image/svg+xml').set('Cache-Control','public, max-age=86400').send(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" rx="24" fill="${background}"/><circle cx="465" cy="110" r="48" fill="#fff8ed" opacity=".8"/><g fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${shapes}<path d="M100 295h440M115 315h410" opacity=".5"/></g><text x="45" y="52" font-family="Arial,sans-serif" font-size="12" letter-spacing="3" fill="${ink}">A TRIPNEXA TRAVEL SKETCH</text><text x="45" y="373" font-family="Arial,sans-serif" font-weight="700" font-size="34" fill="${ink}">${e(d.city)}</text></svg>`);
});
publicItineraryPages.get('/robots.txt',(_req,res)=>res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin/\nDisallow: /trip/\nDisallow: /share/\nDisallow: /customize/\nDisallow: /billing/\nAllow: /trips/\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`));
publicItineraryPages.use(['/sitemap.xml','/sitemap-public-itineraries-:page.xml','/customize/:id'],async(_req,res,next)=>{res.set('Cache-Control','no-store');const all=await readSettings();assert(all.features.public_sharing&&!all.settings.maintenance_enabled,503,'Public examples are temporarily unavailable.');next();});
publicItineraryPages.get('/sitemap.xml',async(_req,res)=>{
  const [[{total}]]=await pool.query(`SELECT COUNT(*) AS total FROM public_itineraries p ${sourceJoins} WHERE ${visibleWhere} AND p.indexable=TRUE`);
  const shards=Array.from({length:Math.ceil(total/SHARD_SIZE)},(_,i)=>`<sitemap><loc>${PUBLIC_ORIGIN}/sitemap-public-itineraries-${i+1}.xml</loc></sitemap>`).join('');
  res.type('application/xml').set('Cache-Control','no-store').send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${shards}</sitemapindex>`);
});
publicItineraryPages.get('/sitemap-public-itineraries-:page.xml',async(req,res)=>{
  assert(/^[1-9]\d{0,5}$/.test(req.params.page),404,'Sitemap not found.');
  const offset=(Number(req.params.page)-1)*SHARD_SIZE;
  const [rows]=await pool.query(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE ${visibleWhere} AND p.indexable=TRUE ORDER BY p.public_id LIMIT ${SHARD_SIZE} OFFSET ${offset}`);
  assert(rows.length,404,'Sitemap not found.');
  const urls=rows.map(row=>`<url><loc>${e(canonicalFor(row))}</loc><lastmod>${new Date(row.updated_at.replace(' ','T')+'Z').toISOString()}</lastmod></url>`).join('');
  res.type('application/xml').set('Cache-Control','no-store').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
publicItineraryPages.get('/customize/:id',async(req,res,next)=>{
  assert(/^[a-f0-9-]{36}$/.test(req.params.id)&&await loadPublic(pool,req.params.id),404,'Public itinerary not found.');
  res.cookie('tripnexa_public_intent',req.params.id,{httpOnly:true,sameSite:'lax',secure:config.production,maxAge:3600000,path:'/'});
  res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
  void recordEvent('public_itinerary_customize_click',null);next();
});
publicItineraryPages.use('/trips',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}),async(_req,res,next)=>{
  res.set({'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; img-src 'self' https://tripnexa.app; style-src 'self'; font-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
  const all=await readSettings();if(!all.features.public_sharing||all.settings.maintenance_enabled)return res.status(503).type('html').send(renderUnavailable());next();
});
publicItineraryPages.get('/trips/:city/:slug',async(req,res)=>{
  if(!/^[a-z0-9-]{1,80}$/.test(req.params.city)||!/^[a-z0-9-]{1,180}$/.test(req.params.slug))return res.status(404).type('html').send(renderUnavailable());
  const [[row]]=await pool.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE p.city_key=? AND p.slug=? AND ${visibleWhere}`,[req.params.city,req.params.slug]);
  if(!row)return res.status(404).type('html').send(renderUnavailable());
  if(req.path.endsWith('/')||Object.keys(req.query).length)return res.redirect(308,`/trips/${row.city_key}/${row.slug}`);
  const [related]=await pool.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE p.public_id<>? AND p.indexable=TRUE AND ${visibleWhere} ORDER BY (p.city_key=?) DESC,(p.persona=?) DESC,(p.duration_days=?) DESC,p.city LIMIT 3`,[row.public_id,row.city_key,row.persona,row.duration_days]);
  const original=row.duplicate_of?await loadPublic(pool,row.duplicate_of):null;
  void recordEvent('public_itinerary_view',null);
  res.type('html').send(renderItinerary(row,related,original?canonicalFor(original):canonicalFor(row)));
});
publicItineraryPages.get('/trips/:city',async(req,res)=>{
  const destination=destinationByKey(req.params.city);if(!destination)return res.status(404).type('html').send(renderUnavailable());
  if(!req.path.endsWith('/'))return res.redirect(308,`/trips/${destination.key}/`);
  const [rows]=await pool.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE p.city_key=? AND p.indexable=TRUE AND ${visibleWhere} ORDER BY p.duration_days,p.public_id LIMIT 24`,[destination.key]);
  if(!rows.length)return res.status(404).type('html').send(renderUnavailable());
  // Collections stay noindex until an explicit future editorial collection review.
  res.type('html').send(renderCollection(destination,rows,false));
});
publicItineraryPages.use('/trips',(_req,res)=>res.status(404).type('html').send(renderUnavailable()));
