import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {serverCatalogs,serverSourceKeys} from '../src/i18n/server-messages.js';
const run=promisify(execFile);
const executable=process.env.GHOSTSCRIPT_PATH||'C:/Program Files/gs/gs10.03.1/bin/gswin64c.exe';
await access(executable);
const directory=path.resolve('.local/i18n/pdf-fixtures'),report=[];
const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
for(const locale of ['en','ro','ru','de','fr','es'])for(const [kind,key]of [['quick','pdf.travelers'],['essentials','pdf.beforeGo'],['book',serverSourceKeys.get('Your personal Full Travel Book')]]){
 const pdf=path.join(directory,locale+'-'+kind+'.pdf'),text=path.join(directory,locale+'-'+kind+'.txt'),png=path.join(directory,locale+'-'+kind+'.png');
 // Ghostscript reads only local fixture PDFs; SAFER forbids arbitrary file/program operations.
 await run(executable,['-dSAFER','-dBATCH','-dNOPAUSE','-q','-sDEVICE=txtwrite','-dTextFormat=3','-sOutputFile='+text,pdf],{windowsHide:true});
 const extracted=normalize(await readFile(text,'utf8'));
 assert(extracted.includes(normalize(serverCatalogs[locale][key])),locale+' '+kind+' localized label must survive PDF extraction');
 const date=new Intl.DateTimeFormat(locale==='en'?'en-GB':locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date('2026-10-08'));
 assert(extracted.includes(normalize(date)),locale+' '+kind+' localized date must survive PDF extraction');
 if(locale==='ru')assert(/[А-Яа-яЁё]/u.test(extracted),'Russian PDF must contain searchable Cyrillic text');
 assert(!extracted.includes('\uFFFD'),'No replacement characters in PDF text');
 await run(executable,['-dSAFER','-dBATCH','-dNOPAUSE','-q','-sDEVICE=png16m','-r96','-dFirstPage=1','-dLastPage=1','-sOutputFile='+png,pdf],{windowsHide:true});
 report.push({locale,kind,label:true,date:true,cyrillic:locale==='ru',firstPageImage:path.relative(process.cwd(),png)});
 console.log(locale+' '+kind+': extracted labels/dates and first-page raster verified');
}
await writeFile(path.join(directory,'inspection.json'),JSON.stringify(report,null,2)+'\n');
