import {useEffect,useState} from 'react';
export default function AffiliateDisclosure(){
 const [settings,setSettings]=useState(null);
 useEffect(()=>{let active=true;fetch('/api/public-settings').then(r=>r.ok?r.json():null).then(s=>{if(active)setSettings(s?.app);}).catch(()=>{});return()=>{active=false;};},[]);
 if(!settings?.affiliate_disclosure_text)return null;
 return <footer className="bg-neutral-950 text-white/50 text-xs px-6 py-5 text-center" aria-label="Affiliate disclosure">{settings.affiliate_disclosure_text}{settings.affiliate_disclosure_url&&<> <a className="underline" href={settings.affiliate_disclosure_url} target="_blank" rel="noopener noreferrer">Learn more</a></>}</footer>;
}
