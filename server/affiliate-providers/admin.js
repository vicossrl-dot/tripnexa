import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {auditRequest,actionReason} from '../admin/audit.js';
import {requireSuperAdmin,requireRecentAuth} from '../admin/permissions.js';
import {providers} from './service.js';
import {definitions,adapter} from './index.js';
export const affiliateAdminRouter=Router();
const validText=(value,max=200)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f]/.test(value);
affiliateAdminRouter.get('/providers',async(req,res)=>{
 const [counts]=await pool.query('SELECT provider,COUNT(*) AS total FROM affiliate_place_mappings WHERE enabled=TRUE GROUP BY provider');
 const [clicks]=await pool.query('SELECT provider,COUNT(*) AS total FROM affiliate_click_events WHERE created_at>=UTC_DATE() GROUP BY provider');
 const [secrets]=await pool.query("SELECT secret_name FROM managed_secrets WHERE provider IN ('getyourguide','viator','tiqets')");
 res.json({providers:(await providers()).map(p=>({...p,status:p.config.enabled&&p.last_check?.ok===false?'ERROR':adapter(p.id,p.config).getStatus(counts.find(c=>c.provider===p.id)?.total||0),mappings:counts.find(c=>c.provider===p.id)?.total||0,clicks_today:clicks.find(c=>c.provider===p.id)?.total||0,api_status:'Not configured',credential_configured:!!p.secret&&secrets.some(s=>s.secret_name===p.secret)}))});
});
affiliateAdminRouter.put('/providers/:provider',requireSuperAdmin,requireRecentAuth,async(req,res)=>{
 const def=definitions.find(p=>p.id===req.params.provider);assert(def,404,'Provider not found.');const reason=actionReason(req.body,'SAVE');const c=req.body.config;
 assert(c&&typeof c.enabled==='boolean'&&validText(c.display_name,60)&&c.display_name.trim()&&Number.isInteger(c.order)&&c.order>=1&&c.order<=99,400,'Check provider name and order.');
 assert(validText(c.partner_id)&&/^[a-z]{2}(?:-[A-Z]{2})?$/.test(c.language)&&/^[A-Z]{3}$/.test(c.currency),400,'Check account identifier, language and currency.');
 assert(Array.isArray(c.allowed_hosts)&&c.allowed_hosts.length>0&&c.allowed_hosts.length<=20&&c.allowed_hosts.every(h=>typeof h==='string'&&h.length<=253&&/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(h)&&(h===def.root||h.endsWith('.'+def.root))),400,'Only explicit official provider domains can be allowed.');
 assert(Number.isInteger(c.cache_ttl)&&c.cache_ttl>=60&&c.cache_ttl<=86400&&['search','none'].includes(c.fallback),400,'Check cache and fallback settings.');
 assert(typeof c.search_template==='string',400,'Enter the official search link template.');
 if(c.search_template){assert(req.body.official_link_confirmed===true,400,'Confirm this link format was supplied by the provider.');assert(c.search_template.includes('{query}'),400,'Include {query} for the complete attraction and destination.');adapter(def.id,c).validateAffiliateUrl(c.search_template,true);}
 const config=Object.fromEntries(['enabled','display_name','order','partner_id','language','currency','allowed_hosts','cache_ttl','fallback','search_template'].map(k=>[k,c[k]]));
 await transaction(async db=>{await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");const [[row]]=await db.execute('SELECT version FROM affiliate_providers WHERE provider=? FOR UPDATE',[def.id]);assert(Number(req.body.version)===(row?.version||0),409,'Provider changed. Reload before saving.');
 await db.execute('INSERT INTO affiliate_providers(provider,config,version,updated_by)VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE config=VALUES(config),version=VALUES(version),updated_by=VALUES(updated_by),last_check=NULL,checked_at=NULL',[def.id,JSON.stringify(config),(row?.version||0)+1,req.user.id]);await auditRequest(req,{action:'affiliate.provider.save',targetType:'affiliate',targetId:def.id,reason,metadata:{provider:def.id,version:(row?.version||0)+1}},db);});res.json({ok:true});
});
affiliateAdminRouter.post('/providers/:provider/test',async(req,res)=>{
 const p=(await providers()).find(p=>p.id===req.params.provider);assert(p,404,'Provider not found.');const reason=actionReason(req.body,'TEST');let result;
 try{result=await adapter(p.id,p.config).testIntegration();const [rows]=await pool.execute('SELECT affiliate_url FROM affiliate_place_mappings WHERE provider=? AND enabled=TRUE',[p.id]);for(const row of rows)adapter(p.id,p.config).validateAffiliateUrl(row.affiliate_url);if(rows.length)result.ok=true;}catch{result={ok:false,note:'Review the official link and allowed hosts. No external connection was tested.',api:'Not configured'};}
 await transaction(async db=>{await db.execute('UPDATE affiliate_providers SET last_check=?,checked_at=UTC_TIMESTAMP(3) WHERE provider=? AND version=?',[JSON.stringify(result),p.id,p.version]);await auditRequest(req,{action:'affiliate.provider.test',targetType:'affiliate',targetId:p.id,reason,result:result.ok?'success':'failure'},db);});res.json(result);
});
affiliateAdminRouter.get('/mappings',async(req,res)=>{const search=String(req.query.q||'').slice(0,200),page=Math.max(1,Math.min(10000,Number(req.query.page)||1));const [rows]=await pool.execute('SELECT * FROM affiliate_place_mappings WHERE canonical_place_name LIKE ? OR google_place_id=? ORDER BY updated_at DESC LIMIT 50 OFFSET ?',['%'+search+'%',search,(page-1)*50]);res.json({items:rows,page});});
affiliateAdminRouter.post('/mappings',async(req,res)=>{
 const reason=actionReason(req.body,'SAVE'),m=req.body.mapping,p=(await providers()).find(p=>p.id===m?.provider);assert(p,400,'Choose a provider.');
 for(const key of ['google_place_id','canonical_place_name','city','country'])assert(validText(m[key],key==='google_place_id'?255:key==='country'?100:200)&&m[key].trim(),400,'Complete the exact place, city and country.');
 for(const key of ['provider_product_id','provider_destination_id'])assert(m[key]==null||validText(m[key]),400,'Invalid provider identifier.');
 assert(typeof m.enabled==='boolean'&&Number.isInteger(m.priority)&&Math.abs(m.priority)<=1000,400,'Invalid mapping status or priority.');assert(req.body.official_link_confirmed===true,400,'Confirm the link came from the official affiliate portal.');
 adapter(p.id,p.config).validateAffiliateUrl(m.affiliate_url);
 const id=m.id||randomUUID();assert(validText(id,64)&&id,400,'Invalid mapping.');
 await transaction(async db=>{await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");const [[old]]=await db.execute('SELECT version FROM affiliate_place_mappings WHERE id=? FOR UPDATE',[id]);assert(Number(m.version||0)===(old?.version||0),409,'Mapping changed. Reload before saving.');
 const values=[m.provider,m.google_place_id,m.canonical_place_name,m.city,m.country,m.provider_product_id||null,m.provider_destination_id||null,m.affiliate_url,m.enabled,m.priority,(old?.version||0)+1];
 if(old)await db.execute('UPDATE affiliate_place_mappings SET provider=?,google_place_id=?,canonical_place_name=?,city=?,country=?,provider_product_id=?,provider_destination_id=?,affiliate_url=?,enabled=?,priority=?,version=? WHERE id=?',[...values,id]);else await db.execute('INSERT INTO affiliate_place_mappings(provider,google_place_id,canonical_place_name,city,country,provider_product_id,provider_destination_id,affiliate_url,enabled,priority,version,id,created_by)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[...values,id,req.user.id]);
 await auditRequest(req,{action:'affiliate.mapping.save',targetType:'affiliate_mapping',targetId:id,reason,metadata:{provider:p.id}},db);});res.json({ok:true,id});
});
affiliateAdminRouter.post('/mappings/:id/test',async(req,res)=>{const [[m]]=await pool.execute('SELECT * FROM affiliate_place_mappings WHERE id=?',[req.params.id]);assert(m,404,'Mapping not found.');const p=(await providers()).find(p=>p.id===m.provider);const url=adapter(p.id,p.config).validateAffiliateUrl(m.affiliate_url);await auditRequest(req,{action:'affiliate.mapping.test',targetType:'affiliate_mapping',targetId:m.id,reason:actionReason(req.body,'TEST')});res.json({url,note:'HTTPS, host and known tracking validated. Open the destination to verify the attraction; attribution is not verified by TripSync.'});});
affiliateAdminRouter.get('/overrides/:place',async(req,res)=>{const [[row]]=await pool.execute('SELECT mode,version FROM affiliate_place_overrides WHERE google_place_id=?',[req.params.place]);res.json(row||{mode:'AUTO',version:0});});
affiliateAdminRouter.put('/overrides/:place',async(req,res)=>{assert(validText(req.params.place,255)&&['AUTO','ALWAYS','NEVER'].includes(req.body.mode),400,'Choose an exact Google place and ticket visibility.');const reason=actionReason(req.body,'SAVE');await transaction(async db=>{await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");const [[old]]=await db.execute('SELECT version FROM affiliate_place_overrides WHERE google_place_id=? FOR UPDATE',[req.params.place]);assert(Number(req.body.version)===(old?.version||0),409,'Override changed. Reload.');await db.execute('INSERT INTO affiliate_place_overrides(google_place_id,mode,version)VALUES(?,?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode),version=VALUES(version)',[req.params.place,req.body.mode,(old?.version||0)+1]);await auditRequest(req,{action:'affiliate.visibility.save',targetType:'place',targetId:req.params.place,reason},db);});res.json({ok:true});});
affiliateAdminRouter.get('/analytics',async(req,res)=>{
 const [[totals]]=await pool.query('SELECT COUNT(*) AS clicks,COALESCE(SUM(created_at>=UTC_DATE()),0) AS today,COUNT(DISTINCT trip_id) AS unique_trips FROM affiliate_click_events');
 const groups={};for(const field of ['provider','city','attraction','mapping_type']){const [rows]=await pool.query(`SELECT ${field} AS label,COUNT(*) AS clicks FROM affiliate_click_events GROUP BY ${field} ORDER BY clicks DESC LIMIT 50`);groups[field]=rows;}
 res.json({totals,groups,sales:null,revenue:null,conversions:null,note:'Clicks are outbound intentions, not verified bookings. Sales and revenue: N/A until official reporting is connected.'});
});
