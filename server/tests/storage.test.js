import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localAdapter, bunnyAdapter, safeKey, checksum } from '../storage/adapters.js';

test('Storage keys reject traversal and credential-injection paths',()=>{
  for(const key of ['../private','x/../y','/absolute','x\\y','x?secret=y','x//y','https://example.com/x'])assert.throws(()=>safeKey(key));
  assert.equal(safeKey('users/uuid/wallet/trip/file.pdf'),'users/uuid/wallet/trip/file.pdf');
});
test('Local storage is non-overwriting, readable and deletes idempotently',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'tripnexa-storage-')),adapter=localAdapter(root),bytes=Buffer.from('private test');
  try{await adapter.put('file.pdf',bytes);assert.deepEqual(await adapter.get('file.pdf'),bytes);assert.equal((await adapter.stat('file.pdf')).size,bytes.length);await assert.rejects(adapter.put('file.pdf',bytes));await adapter.remove('file.pdf');await adapter.remove('file.pdf');assert.equal(await adapter.stat('file.pdf'),null);}finally{await rm(root,{recursive:true,force:true});}
});
test('Bunny uses fixed regional HTTPS origin, private AccessKey and upload checksum',async()=>{
  const calls=[],bytes=Buffer.from('synthetic PDF');
  const adapter=bunnyAdapter({zone:'test-zone',region:'DE',password:'test-only-password'},async(url,options)=>{calls.push({url,options});return new Response(options.method==='GET'?bytes:null,{status:200,headers:{'content-length':String(bytes.length)}});});
  await adapter.put('users/uuid/file.pdf',bytes);assert.deepEqual(await adapter.get('users/uuid/file.pdf'),bytes);assert.equal((await adapter.stat('users/uuid/file.pdf')).size,bytes.length);await adapter.remove('users/uuid/file.pdf');
  assert.deepEqual(calls.map(call=>call.options.method),['PUT','GET','HEAD','DELETE']);
  assert.equal(calls[0].url,'https://storage.bunnycdn.com/test-zone/users/uuid/file.pdf');
  assert.equal(calls[0].options.headers.Checksum,checksum(bytes).toUpperCase());
  assert(calls.every(call=>call.options.redirect==='error'&&call.options.headers.AccessKey==='test-only-password'));
});
test('Bunny failures never expose remote response bodies or credentials',async()=>{
  const settings={zone:'test-zone',region:'NY',password:'test-only-password'};
  const failed=bunnyAdapter(settings,async()=>new Response('password=do-not-expose',{status:403}));
  await assert.rejects(failed.get('file.pdf'),error=>error.status===502&&!error.message.includes('do-not-expose'));
  const missing=bunnyAdapter(settings,async()=>new Response(null,{status:404}));assert.equal(await missing.stat('file.pdf'),null);await missing.remove('file.pdf');
  assert.throws(()=>bunnyAdapter({...settings,region:'evil.example.com'}));
});
