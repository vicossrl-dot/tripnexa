// Explicit local-to-Bunny copy. Never deletes local originals. No public Google media accepted.
import { readdir } from 'node:fs/promises';
import { pool, transaction } from '../server/db.js';
import { config } from '../server/config.js';
import { storageConfiguration, lockStorageZone } from '../server/storage/index.js';
import { bunnyAdapter, localAdapter, checksum } from '../server/storage/adapters.js';
import assert from 'node:assert/strict';

const dryRun=process.argv.includes('--dry-run');
assert(dryRun||process.argv.includes('--apply'),'Choose --dry-run or --apply. Originals are retained.');
const report={dryRun,filesFound:0,alreadyMigrated:0,filesMissingDbAssociations:0,filesMigrated:0,errors:[],objects:[],databaseRecordsUpdated:0};
try {
  const settings=await storageConfiguration({credentials:dryRun?'never':'always'}),local=localAdapter(config.uploads),remote=dryRun?null:bunnyAdapter(settings);
  const [files]=await pool.query('SELECT * FROM uploads ORDER BY id');
  const known=new Set(files.map(file=>file.filename));
  const entries=await readdir(config.uploads).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  report.filesMissingDbAssociations=entries.filter(name=>/^[a-f0-9-]{36}\.(pdf|png|jpg|gif|webp)$/.test(name)&&!known.has(name)).length;
  for(const file of files){
    if(file.storage_provider==='bunny'){report.alreadyMigrated++;continue;}
    report.filesFound++;
    const key=`users/${file.owner_id}/${file.asset_kind==='generated'?'generated':'wallet'}/legacy/${file.filename}`;
    try {
      assert(/^[a-f0-9-]{36}\.(pdf|png|jpg|gif|webp)$/.test(file.filename));
      assert(await local.stat(file.filename),'Local file missing');
      if(dryRun){report.objects.push({id:file.id,key,status:'would-copy'});continue;}
      // Keep cleanup and metadata changes serialized with concurrent file removal.
      await transaction(async db=>{
        await lockStorageZone(db,settings.zone);
        const [[current]]=await db.execute('SELECT * FROM uploads WHERE id=? FOR UPDATE',[file.id]);
        if(!current||current.storage_provider==='bunny')return;
        const bytes=await local.get(current.filename);assert(bytes.length<=10*1024*1024);
        await remote.put(key,bytes);assert.equal(checksum(await remote.get(key)),checksum(bytes),'Verification failed');
        await db.execute("UPDATE uploads SET storage_provider='bunny',storage_key=?,storage_zone=?,storage_region=?,checksum_sha256=?,size_bytes=? WHERE id=?",[key,settings.zone,settings.region,checksum(bytes),bytes.length,file.id]);
        report.filesMigrated++;report.databaseRecordsUpdated++;report.objects.push({id:file.id,key,status:'verified'});
      });
    }catch{report.errors.push({id:file.id,key,error:'Copy or verification failed; local original retained. Retry after checking storage.'});}
  }
  console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
}finally{await pool.end();}
