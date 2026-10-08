import {AsyncLocalStorage} from 'node:async_hooks';

// Temporary diagnostics. Never serialize the original exception or raw message:
// Stripe/SQL messages can contain credentials, customer data or SQL parameters.
export const billingDiagnosticContext=new AsyncLocalStorage();
const stages=new Set(['load_config','validate_billing','validate_plan','load_secret','retrieve_price','validate_price','reconcile_pending','find_or_create_customer','create_checkout_session','save_checkout_session']);
export function setBillingStage(stage){const context=billingDiagnosticContext.getStore();if(context&&stages.has(stage))context.stage=stage;}
const names=new Set(['Error','HttpError','TypeError','RangeError','SyntaxError','StripeError','StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError','StripeRateLimitError','StripeConnectionError','StripeAPIError','StripeIdempotencyError','StripeCardError']);
const types=new Set([...names,'invalid_request_error','authentication_error','permission_error','rate_limit_error','api_error','idempotency_error','card_error']);
const messages={
 resource_missing:'A referenced Stripe resource is unavailable in the selected account or mode.',
 api_key_expired:'Stripe rejected an expired API credential.',
 invalid_api_key:'Stripe rejected the API credential.',
 parameter_missing:'Stripe requires a missing parameter.',
 parameter_invalid_empty:'Stripe rejected an empty parameter.',
 parameter_unknown:'Stripe rejected an unsupported parameter.',
 parameter_invalid_integer:'Stripe rejected an integer parameter.',
 parameter_invalid_string_blank:'Stripe rejected a blank parameter.',
 url_invalid:'Stripe rejected a URL parameter.',
 rate_limit:'Stripe rate limit reached.',
 idempotency_key_in_use:'Stripe idempotency request is already in use.',
 ER_NO_SUCH_TABLE:'A required database table is unavailable.',
 ER_BAD_FIELD_ERROR:'A database column is unavailable.',
 ER_DUP_ENTRY:'A database uniqueness constraint rejected the write.',
 ER_LOCK_DEADLOCK:'Database transaction deadlock.',
 ER_LOCK_WAIT_TIMEOUT:'Database lock wait timed out.',
 ER_ACCESS_DENIED_ERROR:'Database access denied.',
 ER_BAD_DB_ERROR:'Configured database is unavailable.',
 ECONNREFUSED:'Connection refused.',ETIMEDOUT:'Connection timed out.',ECONNRESET:'Connection reset.',ENOTFOUND:'Host lookup failed.',
};
export function billingDiagnostic(error){
 const code=typeof error?.code==='string'&&Object.hasOwn(messages,error.code)?error.code:'unclassified';
 const status=error?.statusCode??error?.status;
 const requestId=error?.requestId;
 return {stage:billingDiagnosticContext.getStore()?.stage||'load_config',name:names.has(error?.name)?error.name:'Error',type:types.has(error?.type)?error.type:'unclassified',code,status:Number.isInteger(status)&&status>=100&&status<=599?status:null,request_id:typeof requestId==='string'&&/^req_[A-Za-z0-9]{1,100}$/.test(requestId)?requestId:null,message:messages[code]||'Original message withheld: may contain secrets or personal data. Inspect the failing stage and Stripe request ID.'};
}
export function logBillingError(error){try{console.error('[BILLING_ERROR] '+JSON.stringify(billingDiagnostic(error)));}catch{/* Diagnostics must never alter billing responses. */}}
