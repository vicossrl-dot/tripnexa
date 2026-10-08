// Only bounded metadata leaves this module. Never include prompt, response or error text.
const statuses=new Set(['completed','incomplete','failed','cancelled','in_progress','queued']);
const errorNames=new Set(['Error','HttpError','TypeError','SyntaxError','AbortError','TimeoutError','EssentialsTimeoutError']);
const errorCodes=new Set(['invalid_request_error','invalid_json_schema','unsupported_parameter','unsupported_value','model_not_found','rate_limit_exceeded','insufficient_quota','invalid_api_key','authentication_error','server_error','timeout','ECONNRESET','ENOTFOUND','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','AbortError','TimeoutError','EssentialsTimeoutError']);
export const primaryDiagnostic=(log,event,metadata)=>log('[essentials] primary '+event+' '+JSON.stringify(metadata));
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function responseMetadata(result){
 const items=Array.isArray(result?.output)?result.output:[];
 const content=items.filter(item=>item?.type==='message').flatMap(item=>Array.isArray(item.content)?item.content:[]);
 const messageText=content.filter(item=>item?.type==='output_text'&&typeof item.text==='string').map(item=>item.text).join('');
 const outputText=messageText||(typeof result?.output_text==='string'?result.output_text:'');
 const refusal=content.some(item=>item?.type==='refusal');
 const tools=items.filter(item=>typeof item?.type==='string'&&item.type.endsWith('_call'));
 const search=tools.filter(item=>item.type==='web_search_call');
 return {outputText,refusal,metadata:{status:refusal?'refused':statuses.has(result?.status)?result.status:'unknown',outputItems:items.length,hasOutputText:!!outputText,outputTextLength:outputText.length,toolCalls:tools.length,searchCalls:search.length,failedSearchCalls:search.filter(item=>item.status==='failed').length,
  incompleteReason:['max_output_tokens','content_filter'].includes(result?.incomplete_details?.reason)?result.incomplete_details.reason:null,
  errorCode:errorCodes.has(result?.error?.code)?result.error.code:null,
  outputTokens:Number.isInteger(result?.usage?.output_tokens)?result.usage.output_tokens:null,
  reasoningTokens:Number.isInteger(result?.usage?.output_tokens_details?.reasoning_tokens)?result.usage.output_tokens_details.reasoning_tokens:null}};
}
export function parseTravelBrief(result,codes){
 const {outputText,refusal,metadata}=responseMetadata(result);
 if(refusal)return {reason:'refusal'};
 if(!outputText)return {reason:metadata.incompleteReason==='max_output_tokens'?'truncated':'empty_output'};
 let data;
 try{data=JSON.parse(outputText);}catch{return {reason:metadata.status==='incomplete'||metadata.incompleteReason==='max_output_tokens'?'truncated':'invalid_json'};}
 if(!record(data)||!record(data.countries))return {reason:'missing_required_root'};
 // Validate the destination envelope, then normalize individual sections independently.
 const countries=Object.fromEntries(codes.filter(code=>Object.hasOwn(data.countries,code)&&record(data.countries[code])).map(code=>[code,data.countries[code]]));
 if(!Object.keys(countries).length)return {reason:'schema_mismatch'};
 return {countries};
}
export function providerFailureMetadata(error){
 const upstream=error?.providerFailure;
 const code=errorCodes.has(upstream?.code)?upstream.code:errorCodes.has(error?.code)?error.code:null;
 const network=errorCodes.has(upstream?.network)?upstream.network:null;
 const timeout=['EssentialsTimeoutError','TimeoutError','AbortError'].includes(error?.name)||['EssentialsTimeoutError','TimeoutError','AbortError','UND_ERR_CONNECT_TIMEOUT'].includes(network);
 const status=Number.isInteger(upstream?.status)?upstream.status:Number.isInteger(error?.status)?error.status:null;
 return {name:errorNames.has(error?.name)?error.name:'Error',status,code,network,timeout,
  message:timeout?'Primary request deadline reached.':status===429?'Provider quota or rate limit.':status===400?'Provider rejected the request contract.':status===401?'Provider authentication failed.':'Primary provider request failed.'};
}
