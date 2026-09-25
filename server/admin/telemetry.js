import {randomUUID} from 'node:crypto';
import {pool} from '../db.js';
import {requestContext} from '../request-context.js';
export {requestContext};
export async function recordLog({level='info',category='system',event,status=null,duration=null,requestId=null}) {
 try{await pool.execute('INSERT INTO app_logs(id,level,category,event,status,duration_ms,request_id)VALUES(?,?,?,?,?,?,?)',[randomUUID(),level,category,event,status,duration,requestId||requestContext.getStore()?.requestId||null]);}catch(error){console.error('Operational log unavailable:',error.code||error.name);}
}
export async function recordEvent(event,userId=requestContext.getStore()?.userId||null){
 try{await pool.execute('INSERT INTO analytics_events(id,user_id,event)VALUES(?,?,?)',[randomUUID(),userId,event]);}catch(error){console.error('Metric unavailable:',error.code||error.name);}
}
export async function recordProvider({provider,operation,success,latency,model=null,inputTokens=null,outputTokens=null,status=null,requestId=null}){
 if(!requestContext.getStore())return;
 try{await pool.execute('INSERT INTO provider_events(id,user_id,provider,operation,success,latency_ms,model,input_tokens,output_tokens,http_status,request_id)VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
  randomUUID(),requestContext.getStore()?.userId||null,provider,operation,success,latency,model,inputTokens,outputTokens,status,typeof requestId==='string'&&/^[\w:-]{1,100}$/.test(requestId)?requestId:null]);
 }catch(error){console.error('Provider metric unavailable:',error.code||error.name);}
}
