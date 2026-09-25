import test from 'node:test';
import assert from 'node:assert/strict';
import {adapter,definitions} from '../affiliate-providers/index.js';
import {validateUrl} from '../affiliate-providers/provider-base.js';
import {ticketable} from '../affiliate-providers/ticketability.js';
test('Affiliate URL security rejects unsafe schemes, authorities, nested redirects and credential leakage',()=>{
 const hosts=['www.viator.com'];
 for(const url of ['javascript:alert(1)','data:text/plain,hello','file:///c:/secret','ftp://www.viator.com','//evil.test','https://localhost','https://127.0.0.1','https://10.0.0.1','https://www.viator.com.evil.test','https://user@www.viator.com','https://www.viator.com:8443','https://www.viator.com/?redirect=https%3A%2F%2Fevil.test','https://www.viator.com/?api_key=secret','https://www.viator.com\\@evil.test'])assert.throws(()=>validateUrl(url,hosts),url);
});
test('All four adapters preserve exact official URLs including encoded opaque tracking',async()=>{
 for(const def of definitions){const suffix=def.id==='getyourguide'?'partner_id=TEST':def.id==='viator'?'pid=TEST&mcid=123&medium=link':'opaque=portal-code';const url=`https://www.${def.root}/attraction?${suffix}&campaign=a%2Fb%20c&signature=a%2Bb%3D`;
 const p=adapter(def.id,{enabled:true,allowed_hosts:def.hosts});const result=await p.resolvePlace({google_place_id:'place'},[{google_place_id:'place',affiliate_url:url,enabled:true}]);assert.equal(result.url,url);assert.equal(result.confidence,'EXACT');assert.equal(await p.resolvePlace({google_place_id:'other'},[]),null);}
});
test('Complete structured search encodes attraction and destination but never modifies partner IDs',async()=>{
 const p=adapter('viator',{enabled:true,search_template:'https://www.viator.com/search/{query}?pid=PTEST&mcid=123&medium=link',language:'en',currency:'EUR'});
 const result=await p.resolvePlace({canonical_place_name:'Sagrada Familia',city:'Barcelona',country:'Spain'},[]);assert(result.url.includes('Sagrada%20Familia%20Barcelona%20Spain'));assert(result.url.endsWith('pid=PTEST&mcid=123&medium=link'));
 assert.throws(()=>p.validateAffiliateUrl('https://www.viator.com/?pid={name}&mcid=1&medium=link&q={query}',true));
 assert.throws(()=>p.validateAffiliateUrl('https://www.viator.com/?pid=a&mcid=1&medium=link&sig=x&q={query}',true));
 assert.equal(p.buildAffiliateSearchLink({canonical_place_name:'Ambiguous'}),null);
});
test('Ticketability uses category clues and explicit overrides without assuming tickets are required',()=>{
 for(const category of ['tourist_attraction','museum','monument','theme_park','art_gallery','experience'])assert(ticketable({category}));
 for(const category of ['park','restaurant','hotel','airport','street','neighborhood',''])assert(!ticketable({category}));
 assert(ticketable({category:'park'},'ALWAYS'));assert(!ticketable({category:'museum'},'NEVER'));
});
test('No affiliate account means no fabricated products, pricing, API connection or fallback link',async()=>{
 for(const def of definitions){const p=adapter(def.id,{enabled:true});assert.equal(p.getStatus(0),'NOT CONFIGURED');assert.deepEqual(await p.searchProducts({}),[]);assert.equal(p.normalizeProductData({price:10}),null);assert.equal(await p.resolvePlace({canonical_place_name:'Louvre Museum',city:'Paris'},[]),null);assert.equal((await p.testIntegration()).ok,false);}
});
