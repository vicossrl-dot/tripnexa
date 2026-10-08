import test from 'node:test';
import assert from 'node:assert/strict';
import {billingDiagnosticContext,billingDiagnostic,setBillingStage} from '../billing/diagnostics.js';
import {safeBilling} from '../billing/router.js';
import {configuredPrice} from '../billing/stripe.js';

test('Billing diagnostics exclude original messages, keys, customer data and full objects',()=>{
 const privateText='sk_live_PRIVATE whsec_PRIVATE pk_live_PRIVATE alice@example.invalid card=4242424242424242';
 const record=billingDiagnostic({name:privateText,type:privateText,code:privateText,statusCode:privateText,requestId:privateText,message:privateText,headers:{Authorization:privateText,Cookie:privateText},raw:{message:privateText},sql:privateText});
 assert(!JSON.stringify(record).includes('PRIVATE'));assert(!JSON.stringify(record).includes('alice'));assert.equal(record.code,'unclassified');assert.equal(record.request_id,null);assert.equal(record.status,null);
 const safe=billingDiagnostic({name:'Error',type:'StripeInvalidRequestError',code:'resource_missing',statusCode:404,requestId:'req_Diagnostic123',message:privateText});
 assert.equal(safe.code,'resource_missing');assert.equal(safe.status,404);assert.equal(safe.request_id,'req_Diagnostic123');assert(!JSON.stringify(safe).includes('PRIVATE'));
});
test('Billing stage tracking is isolated across concurrent requests',async()=>{
 const stages=['load_config','validate_billing','validate_plan','load_secret','retrieve_price','validate_price','reconcile_pending','find_or_create_customer','create_checkout_session','save_checkout_session'];
 await Promise.all(stages.map(stage=>billingDiagnosticContext.run({stage:'load_config'},async()=>{setBillingStage(stage);await new Promise(resolve=>setTimeout(resolve,2));assert.equal(billingDiagnostic({}).stage,stage);}))); 
});
test('safeBilling logs before masking and preserves existing explicit public errors',async()=>{
 const original=console.error,logs=[];console.error=line=>logs.push(line);
 try{
  const error=Object.assign(new Error('private customer message'),{type:'StripeInvalidRequestError',code:'resource_missing',statusCode:404,requestId:'req_Test123'});let response;
  await safeBilling(async()=>{setBillingStage('create_checkout_session');throw error;})({}, {}, value=>{assert.equal(logs.length,1);response=value;});
  assert.equal(response.status,503);assert.equal(response.message,'Billing is temporarily unavailable. Please try again or contact support.');assert(logs[0].startsWith('[BILLING_ERROR] '));assert(!logs[0].includes('private customer'));
  assert.equal(JSON.parse(logs[0].slice('[BILLING_ERROR] '.length)).stage,'create_checkout_session');
  const explicit=Object.assign(new Error('Existing validation response'),{status:409});await safeBilling(async()=>{throw explicit;})({}, {}, value=>assert.equal(value,explicit));
  console.error=()=>{throw Error('Logging unavailable');};await safeBilling(async()=>{throw error;})({}, {}, value=>assert.equal(value.status,503));
 }finally{console.error=original;}
});
test('Price retrieval and price validation are distinguishable without changing errors',async()=>{
 const settings={billing_mode:'live',stripe_price_pro_monthly:'price_fixture'};
 await billingDiagnosticContext.run({stage:'load_secret'},async()=>{
  const error=new Error('fixture');await assert.rejects(configuredPrice({prices:{retrieve:async()=>{throw error;}}},'PRO_MONTHLY',settings),e=>e===error);assert.equal(billingDiagnostic(error).stage,'retrieve_price');
  await assert.rejects(configuredPrice({prices:{retrieve:async()=>({active:false})}},'PRO_MONTHLY',settings),e=>e.status===409);assert.equal(billingDiagnostic({}).stage,'validate_price');
 });
});
