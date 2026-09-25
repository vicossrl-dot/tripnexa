import {useEffect,useState} from 'react';
import {socialApi} from '@/api/social';
import {safeReturnTo} from '@/lib/authReturnTo';
export default function SocialButtons({intent='login',returnTo=undefined,password='',only=undefined}){
 const [providers,setProviders]=useState([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{socialApi('/auth/providers').then(data=>setProviders(data.providers)).catch(()=>setProviders([]));},[]);
 async function begin(provider){setBusy(provider);setError('');try{const data=await socialApi('/auth/'+provider+'/start',{intent,returnTo:returnTo||safeReturnTo(),password});window.location.assign(data.url);}catch(e){setError(e.message);setBusy('');}}
 if(!providers.length)return null;
 return <div className="space-y-3 mt-5">{providers.filter(p=>!only||only.includes(p.provider)).map(p=><button type="button" key={p.provider} disabled={!!busy} onClick={()=>begin(p.provider)} className={"w-full min-h-12 rounded-lg border border-neutral-400 flex justify-center items-center gap-3 px-4 py-2 font-medium disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-blue-600 "+(p.provider==='apple'?'bg-black text-white':'bg-white text-black')}>{p.provider==='google'&&<img src="/auth/google-g.png" width="20" height="20" className="h-auto" alt=""/>}{p.provider==='apple'&&<img src="/auth/apple-logo.png" width="36" height="36" className="h-auto" alt=""/>}{busy===p.provider?'Connecting…':(intent==='connect'?'Connect with ':intent==='reauth'?'Verify with ':'Continue with ')+p.name}</button>)}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}</div>;
}
