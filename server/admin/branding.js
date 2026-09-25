import {Router} from 'express';
import multer from 'multer';
import path from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {root} from '../config.js';
import {imageType} from '../uploads.js';
import {assert} from '../errors.js';
import {auditRequest} from './audit.js';
import {requireSuperAdmin,requireRecentAuth} from './permissions.js';
export const brandingDirectory=path.join(root,'.local','branding');
export const brandFilename=/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
export const brandingRouter=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:2*1024*1024,fields:0}});
brandingRouter.post('/branding/upload',requireSuperAdmin,requireRecentAuth,upload.single('file'),async(req,res)=>{
 const type=req.file&&imageType(req.file.buffer);assert(type,400,'Choose a PNG, JPEG, GIF or WebP image up to 2 MB. SVG is not accepted.');
 await mkdir(brandingDirectory,{recursive:true});const name=randomUUID()+'.'+type[0];await writeFile(path.join(brandingDirectory,name),req.file.buffer,{flag:'wx'});
 await auditRequest(req,{action:'branding.upload',targetType:'branding',metadata:{changed:true}});res.status(201).json({url:'/brand-assets/'+name});
});
export async function brandDataUri(url){
 const name=String(url||'').replace(/^\/brand-assets\//,'');if(!brandFilename.test(name))return null;
 try{const bytes=await readFile(path.join(brandingDirectory,name));const type=imageType(bytes);return type&&bytes.length<=2*1024*1024?`data:${type[1]};base64,${bytes.toString('base64')}`:null;}catch{return null;}
}
