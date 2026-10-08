import { Router } from 'express';
import { pool } from '../db.js';
import { requireSuperAdmin, requireRecentAuth } from '../admin/permissions.js';
import { actionReason, auditRequest } from '../admin/audit.js';
import { storageConfiguration, testBunnyConnection } from './index.js';
import { rateLimit } from 'express-rate-limit';

export const storageAdminRouter=Router();
storageAdminRouter.get('/bunny',async(_req,res)=>{
  const settings=await storageConfiguration({credentials:'never'});
  const [[stats]]=await pool.query("SELECT COUNT(*) AS files,SUM(asset_kind='wallet' OR wallet_managed=TRUE) AS walletFiles,SUM(asset_kind='generated') AS generatedImages,COALESCE(SUM(size_bytes),0) AS bytes,MAX(created_date) AS lastUpload FROM uploads");
  const [[last]]=await pool.query("SELECT created_at,result FROM audit_events WHERE action='storage.connection_test' ORDER BY created_at DESC LIMIT 1");
  const [[success]]=await pool.query("SELECT created_at FROM audit_events WHERE action='storage.connection_test' AND result='success' ORDER BY created_at DESC LIMIT 1");
  const [[changed]]=await pool.query("SELECT MAX(updated_at) AS updated_at FROM (SELECT updated_at FROM app_settings WHERE setting_key IN ('bunny_storage_zone','bunny_storage_region') UNION ALL SELECT updated_at FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD') changes");
  const validTest=last&&(!changed.updated_at||String(last.created_at)>=String(changed.updated_at));
  res.json({provider:settings.provider,zone:settings.zone,region:settings.region,publicCdn:settings.publicCdn,configured:!!(settings.zone&&settings.passwordConfigured),privateAccess:'Authenticated server download',lastTest:validTest?last:null,lastSuccessfulTest:success?.created_at||null,stats});
});
storageAdminRouter.post('/bunny/test',requireSuperAdmin,requireRecentAuth,rateLimit({windowMs:900000,limit:5,keyGenerator:req=>req.user.id}),async(req,res)=>{
  const reason=actionReason(req.body,'TEST');
  let result;try{result=await testBunnyConnection(await storageConfiguration({credentials:'always'}));}catch{result={ok:false,note:'Bunny storage is not configured. Check zone, region and password.'};}
  await auditRequest(req,{action:'storage.connection_test',targetType:'storage',result:result.ok?'success':'failure',reason,metadata:{provider:'bunny'}});
  res.json(result);
});
