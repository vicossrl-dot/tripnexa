import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentMetadata } from '../wallet.js';
import { relatedWalletItems } from '../../src/lib/wallet-links.js';

test('Attachment metadata rejects malformed dates and overlong or invalid fields',()=>{
  assert.deepEqual(attachmentMetadata({label:' Boarding pass ',traveler:'Alex',expiry_date:'2030-01-02'}),{label:'Boarding pass',traveler:'Alex',expiry_date:'2030-01-02'});
  for(const data of [{expiry_date:'2026-02-30'},{notes:'a'.repeat(4001)},{traveler:{}},{document_type:'x\0y'}])assert.throws(()=>attachmentMetadata(data));
  assert.deepEqual(attachmentMetadata({owner_id:'other',filename:'../../secret',item_id:'foreign'}),{});
});
test('Itinerary wallet shortcuts match exact records and never link personal documents or empty bookings',()=>{
  const items=[{id:'ticket',category:'place',title:'Sagrada Familia',date:'2026-10-02',attachments:[{}]}, {id:'passport',category:'document',title:'Sagrada Familia',attachments:[{}]}, {id:'empty',category:'place',title:'Sagrada Familia',attachments:[]}];
  assert.deepEqual(relatedWalletItems({step_type:'visit',title:'Sagrada Família',date:'2026-10-02'},items).map(item=>item.id),['ticket']);
  assert.equal(relatedWalletItems({step_type:'visit',title:'Other',date:'2026-10-02'},items).length,0);
  assert.equal(relatedWalletItems({step_type:'visit',title:'Sagrada Familia',date:'2026-10-03'},items).length,0);
  assert.equal(relatedWalletItems({step_type:'visit',selection_id:'selection'},items,[{id:'selection',trip_item_id:'ticket'}]).length,1);
  assert.equal(relatedWalletItems({step_type:'arrival',location:'BCN',date:'2026-10-02'},[{id:'flight',category:'flight',arrival_airport:'BCN',arrival_datetime:'2026-10-02T12:00',attachments:[{}]}]).length,1);
  assert.equal(relatedWalletItems({step_type:'transport',route_destination:'Hotel address',date:'2026-10-02'},[{id:'stay',category:'stay',address:'Hotel address',date:'2026-10-01',end_date:'2026-10-04',attachments:[{}]}]).length,1);
});
