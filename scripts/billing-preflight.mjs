// Read-only inspection by default. An explicit --backup=<path> creates a new dump.
import path from 'node:path';
import {open,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {config} from '../server/config.js';
import {pool} from '../server/db.js';

try{
 const [[version]]=await pool.query('SELECT VERSION() AS database_version,DATABASE() AS database_name');
 const [tables]=await pool.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[config.database.database]);
 const counts={};for(const table of ['users','trips','trip_items','uploads','item_attachments','billing_orders','billing_credit_ledger','billing_trip_entitlements']){
  if(tables.some(row=>row.TABLE_NAME===table)){const [[row]]=await pool.query('SELECT COUNT(*) AS n FROM `'+table+'`');counts[table]=row.n;}
 }
 console.log(JSON.stringify({node:process.version,...version,tables:tables.map(row=>row.TABLE_NAME),row_counts:counts,transport:config.database.socketPath?'unix_socket':'tcp'},null,2));
 const backup=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
 if(backup){
  const filename=path.resolve(backup);await mkdir(path.dirname(filename),{recursive:true});const file=await open(filename,'wx',0o600);
  try{
   const args=[...(config.database.socketPath?['--socket='+config.database.socketPath]:['--host='+config.database.host,'--port='+config.database.port]),'--user='+config.database.user,'--single-transaction','--no-tablespaces','--hex-blob',config.database.database];
   const child=spawn(process.env.MYSQLDUMP_PATH||'mysqldump',args,{windowsHide:true,stdio:['ignore',file.fd,'ignore'],env:{...process.env,MYSQL_PWD:config.database.password}});
   const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
   if(status!==0)throw Error('Database dump failed. The partial file must not be used as a backup.');
  }finally{await file.close();}
  console.log(JSON.stringify({backup:filename,bytes:(await stat(filename)).size,restore_tested:false}));
 }
 console.log('No schema or data changed. Validate backup restoration and staging before migration.');
}catch(error){console.error('Billing preflight failed:',error.code||error.message);process.exitCode=1;}finally{await pool.end();}
