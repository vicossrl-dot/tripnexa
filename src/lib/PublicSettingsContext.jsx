import {createContext,useContext,useEffect,useState} from 'react';
import {normalizePublicSettings} from './public-settings.js';

const PublicSettingsContext=createContext(null);

export function PublicSettingsProvider({children}){
 const [settings,setSettings]=useState(()=>normalizePublicSettings(null));
 useEffect(()=>{
  let active=true;
  fetch('/api/public-settings',{credentials:'same-origin'})
   .then(response=>{if(!response.ok)throw new Error('Public settings unavailable.');return response.json();})
   .then(payload=>{if(active)setSettings(normalizePublicSettings(payload));})
   .catch(()=>{});
  return()=>{active=false;};
 },[]);
 return <PublicSettingsContext.Provider value={settings}>{children}</PublicSettingsContext.Provider>;
}

export function usePublicSettings(){
 const settings=useContext(PublicSettingsContext);
 if(!settings)throw new Error('usePublicSettings requires PublicSettingsProvider.');
 return settings;
}