import {getAppUrls} from '../app-urls.js';
import {socialConfiguration} from '../social-auth/providers.js';
import {Router} from 'express';
import {access,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import {pool} from '../db.js';
import {config} from '../config.js';
import {paging,dateRange,searchTerm} from './query.js';
import {masterKeyConfigured} from './crypto.js';
export const operationsRouter=Router();
const scalar=async sql=>(await pool.query(sql))[0][0];
export async function systemHealth(){
 const began=Date.now();let database=false;try{await pool.query('SELECT 1');database=true;}catch{}
 const databaseMs=Date.now()-began;let storage=false,freeBytes=null,chrome=false;
 try{await access(config.uploads,constants.R_OK|constants.W_OK);storage=true;const disk=await statfs(config.uploads);freeBytes=Number(disk.bavail)*Number(disk.bsize);}catch{}
 const executable=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome');try{await access(executable,constants.X_OK);chrome=true;}catch{}
 const urls=await getAppUrls(),authentication=await Promise.all(['google','apple'].map(async id=>{const p=await socialConfiguration(id,urls);return {provider:id,status:p.status,callback:p.callback};}));
 return {domains:{public_site_url:urls.site.value||'Missing',public_site_source:urls.site.source,application_url:urls.application.value||'Missing',application_source:urls.application.source,...Object.fromEntries(authentication.map(p=>[p.provider+'_callback',p.callback||'Not configured']))},authentication:Object.fromEntries(authentication.map(p=>[p.provider,p.status])),application:{status:'ready',uptimeSeconds:Math.floor(process.uptime()),version:'0.0.0',node:process.versions.node},database:{status:database?'ready':'error',latencyMs:databaseMs},storage:{status:storage?'ready':'error',freeBytes},chrome:{status:chrome?'available':'missing',note:'Availability is not a completed PDF render.'},providers:{openai:{configured:!!(config.aiKey&&config.aiModel),model:config.aiModel||null,imageModel:config.imageModel||null},google:{configured:!!config.googleMapsKey},smtp:{configured:!!process.env.SMTP_HOST}},configuration:{production:config.production,https:!!urls.application.value?.startsWith('https:'),secureCookies:config.production,trustedProxy:process.env.TRUST_PROXY==='1',allowedOriginConfigured:!!urls.application.value,masterKey:masterKeyConfigured(),audit:true,uploadsConfigured:!!config.uploads,backup:'Not reported'}};
}
operationsRouter.get('/health',async(req,res)=>res.json(await systemHealth()));
operationsRouter.get('/security',async(req,res)=>{
 const [privileged]=await pool.query("SELECT u.id,u.email,u.role,u.status,COALESCE(m.enabled,FALSE) AS mfa_enabled FROM users u LEFT JOIN admin_mfa m ON m.user_id=u.id WHERE u.role IN ('ADMIN','SUPER_ADMIN') ORDER BY u.created_date");
 res.json({health:await systemHealth(),privileged,policies:{privilegedMfaRequired:true,emailVerificationRequired:true,httpOnly:true,sameSite:'lax',sessionDays:7}});
});
operationsRouter.get('/providers/status',async(req,res)=>{
 const [events]=await pool.query('SELECT provider,COUNT(*) AS requests,SUM(success=FALSE) AS failures,ROUND(AVG(latency_ms)) AS average_latency_ms,MAX(created_at) AS last_request,MAX(IF(success,created_at,NULL)) AS last_success,MAX(IF(NOT success,created_at,NULL)) AS last_failure,SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens,SUM(estimated_cost) AS estimated_cost FROM provider_events WHERE created_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY GROUP BY provider');
 res.json({...(await systemHealth()),usage:events,note:'Configured does not mean tested. No paid requests run on this page.'});
});
operationsRouter.get('/overview',async(req,res)=>{
 const range=dateRange(req.query),[users,trips,files]=await Promise.all([
  scalar("SELECT COUNT(*) AS total,SUM(email_verified=TRUE) AS verified,SUM(created_date>=UTC_DATE()) AS today,SUM(created_date>=UTC_TIMESTAMP()-INTERVAL 7 DAY) AS last7Days,SUM(status='SUSPENDED') AS suspended FROM users"),
  scalar("SELECT COUNT(*) AS total,SUM(created_date>=UTC_DATE()) AS today,SUM(end_date>=UTC_DATE()) AS active,SUM(plan_status='calculated') AS planned,SUM(share_enabled=TRUE) AS shared,(SELECT COUNT(DISTINCT trip_id) FROM itinerary_items) AS with_itinerary FROM trips"),
  scalar('SELECT COUNT(*) AS uploads,COALESCE(SUM(size_bytes),0) AS storage_bytes,SUM(size_bytes IS NULL) AS unmeasured FROM uploads')]);
 const [usage]=await pool.execute('SELECT event,COUNT(*) AS total FROM analytics_events WHERE created_at BETWEEN ? AND ? GROUP BY event',[range.start,range.end]);
 const [providers]=await pool.query('SELECT provider,COUNT(*) AS requests,SUM(success=FALSE) AS failures FROM provider_events WHERE created_at>=UTC_DATE() GROUP BY provider');
 const [errors]=await pool.query("SELECT id,level,category,event,status,created_at FROM app_logs WHERE level IN ('error','warning') ORDER BY created_at DESC LIMIT 8");
 const [mail]=await pool.query("SELECT COUNT(*) AS failures FROM email_events WHERE status='failed' AND created_at>=UTC_DATE()");
 const [pdf]=await pool.query("SELECT COUNT(*) AS total FROM analytics_events WHERE event='pdf_exported' AND created_at>=UTC_DATE()");
 res.json({users,trips,files,usage,providers,errors,failedEmailsToday:mail[0].failures,pdfToday:pdf[0].total,health:await systemHealth(),range,trackingNote:'Operational events start with this release. Storage totals exclude unmeasured legacy files.'});
});
operationsRouter.get('/analytics',async(req,res)=>{
 const {start,end}=dateRange(req.query),args=[start,end];
 const [users]=await pool.execute('SELECT DATE(created_date) AS day,COUNT(*) AS count FROM users WHERE created_date BETWEEN ? AND ? GROUP BY DATE(created_date) ORDER BY day',args);
 const [trips]=await pool.execute('SELECT DATE(created_date) AS day,COUNT(*) AS count FROM trips WHERE created_date BETWEEN ? AND ? GROUP BY DATE(created_date) ORDER BY day',args);
 const [destinations]=await pool.execute('SELECT destination,COUNT(*) AS count FROM trips WHERE created_date BETWEEN ? AND ? GROUP BY destination ORDER BY count DESC LIMIT 12',args);
 const [planning]=await pool.execute('SELECT event,DATE(created_at) AS day,COUNT(*) AS count FROM analytics_events WHERE created_at BETWEEN ? AND ? GROUP BY event,DATE(created_at) ORDER BY day',args);
 const [providers]=await pool.execute('SELECT provider,DATE(created_at) AS day,COUNT(*) AS count,SUM(success=FALSE) AS errors,AVG(latency_ms) AS latency_ms FROM provider_events WHERE created_at BETWEEN ? AND ? GROUP BY provider,DATE(created_at) ORDER BY day',args);
 const [travel]=await pool.execute('SELECT travel_type,COUNT(*) AS count,AVG(DATEDIFF(end_date,start_date)+1) AS average_days FROM trips WHERE created_date BETWEEN ? AND ? GROUP BY travel_type',args);
 res.json({users,trips,destinations,planning,providers,travel,range:{start,end},note:'No personal trip content is included. Events before this release are not reconstructed.'});
});
for(const type of ['audit','logs'])operationsRouter.get('/'+type,async(req,res)=>{
 const audit=type==='audit',table=audit?'audit_events':'app_logs',p=paging(req.query,{created:'created_at'},'created');const where=['1=1'],args=[];
 const filters=audit?{actor:'actor_user_id',action:'action',target:'target_id',result:'result'}:{level:'level',category:'category',request_id:'request_id'};
 for(const [key,column]of Object.entries(filters))if(req.query[key]){where.push(column+'=?');args.push(searchTerm(req.query[key]));}
 if(req.query.q){where.push((audit?'action':'event')+' LIKE ?');args.push('%'+searchTerm(req.query.q)+'%');}
 if(req.query.from||req.query.to){const range=dateRange(req.query);where.push('created_at BETWEEN ? AND ?');args.push(range.start,range.end);}
 const fields=audit?'id,actor_user_id,actor_role,action,target_type,target_id,result,reason,request_id,metadata_redacted,created_at':'id,level,category,event,request_id,status,duration_ms,created_at';
 const [[count]]=await pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where.join(' AND ')}`,args);const [items]=await pool.execute(`SELECT ${fields} FROM ${table} WHERE ${where.join(' AND ')}${p.order}${p.limit}`,args);
 res.json({items,total:count.total,page:p.page,pageSize:p.size});
});
operationsRouter.get('/search',async(req,res)=>{
 const q=searchTerm(req.query.q);if(q.length<2)return res.json({users:[],trips:[]});
 const [users]=await pool.execute('SELECT id,email,display_name,role,status FROM users WHERE id=? OR email LIKE ? OR display_name LIKE ? LIMIT 10',[q,'%'+q+'%','%'+q+'%']);
 const [trips]=await pool.execute('SELECT id,name,destination,owner_id FROM trips WHERE id=? OR name LIKE ? OR destination LIKE ? OR share_token=? LIMIT 10',[q,'%'+q+'%','%'+q+'%',q]);res.json({users,trips});
});
