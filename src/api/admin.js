export async function adminApi(path='',method='GET',body=undefined) {
 const response=await fetch('/api/admin'+path,{method,credentials:'same-origin',headers:{'X-Requested-With':'TripSync',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.error||'Administration request failed.'),{status:response.status});
 return data;
}
