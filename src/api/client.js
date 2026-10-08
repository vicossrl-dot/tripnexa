import {getLocale,setGeneratedTranslations} from '@/i18n/runtime';
async function downloadTripFile(path,filename){
 const response=await fetch(path,{credentials:'same-origin',headers:{'X-Requested-With':'TripSync','X-TripNexa-Locale':getLocale()}});
 if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===402&&data.code)window.dispatchEvent(new CustomEvent('billing-required',{detail:data}));throw new Error(data.error||'Download failed. Please retry.');}
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {skipped:Number(response.headers.get('X-TripNexa-Skipped-Events')||0)};
}
async function request(path, options = {}) {
  const requestLanguage=getLocale();
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    headers: { 'X-Requested-With': 'TripSync', 'X-TripNexa-Locale':requestLanguage, ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body && !isForm ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(new Error(data.error || `Request failed (${response.status}).`), data, { status: response.status });
    // Surface failed saves even in older components which catch errors silently.
    if (response.status === 402 && data.code) {
      window.dispatchEvent(new CustomEvent('billing-required', { detail: data }));
    } else if (!options.silent && options.method && options.method !== 'GET' && !path.startsWith('/auth') && !path.startsWith('/places')) {
      window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }));
    }
    throw error;
  }
  if(data.displayTranslations&&getLocale()===requestLanguage)setGeneratedTranslations(data.displayTranslations,true);
  if(options.method&&!path.endsWith('/localized-content')&&/^\/trips\/[^/]+\/(?:itinerary|planning)/.test(path))window.dispatchEvent(new CustomEvent('generated-content-changed',{detail:{tripId:path.split('/')[2]}}));
  return data;
}
function entity(name) {
  const path = `/entities/${name}`;
  const list = (filter, sort, limit) => {
    const query = new URLSearchParams();
    if (filter) query.set('filter', JSON.stringify(filter));
    if (sort) query.set('sort', sort);
    if (limit) query.set('limit', String(limit));
    return request(`${path}?${query}`);
  };
  return {
    list: (sort, limit) => list(null, sort, limit),
    filter: list,
    get: id => request(`${path}/${encodeURIComponent(id)}`),
    create: body => request(path, { method: 'POST', body }),
    update: (id, body) => request(`${path}/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    delete: id => request(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    deleteMany: filter => request(`${path}?${new URLSearchParams({ filter: JSON.stringify(filter) })}`, { method: 'DELETE' }),
    bulkCreate: items => request(`${path}/bulk`, { method: 'POST', body: { items } }),
  };
}
export const api = {
  localizeTrip:(id,passport=null)=>request(`/trips/${encodeURIComponent(id)}/localized-content`,{method:'POST',body:{passport},silent:true}),
  customizeItinerary: id => request(`/public-itineraries/${encodeURIComponent(id)}/copy`,{method:'POST',body:{}}),
  billing: (path, body = undefined) => request('/billing' + path, { method: body ? 'POST' : 'GET', body, silent: true }),
  account: (path,body=undefined) => request('/account/'+path,{method:body?'POST':'GET',body,silent:true}),
  entities: Object.fromEntries(['Trip','TripItem','PlaceSelection','DayWindow','ItineraryItem','TodoBoard','TodoItem'].map(name => [name, entity(name)])),
  auth: {
    me: () => request('/auth/me'),
    updateMe: body => request('/auth/me', { method: 'PATCH', body }),
    register: body => request('/auth/register', { method: 'POST', body }),
    verifyOtp: body => request('/auth/verify', { method: 'POST', body }),
    resendOtp: email => request('/auth/resend', { method: 'POST', body: { email } }),
    loginViaEmailPassword: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
    resetPasswordRequest: email => request('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: body => request('/auth/reset-password', { method: 'POST', body }),
    logout: async (redirect = '/login') => {
      await request('/auth/logout', { method: 'POST' });
      localStorage.removeItem('tripsync_last_trip');
      sessionStorage.removeItem('tripsync_entered');
      if (redirect) window.location.assign('/login');
    },
  },
  ai: {
    planningSuggestions: (tripId, signal) => request('/ai/planning-suggestions', { method: 'POST', body: { trip_id: tripId }, signal }),
    tripNames: body => request('/ai/trip-names', { method: 'POST', body }),
    text: body => request('/ai/text', { method: 'POST', body }),
    image: body => request('/ai/image', { method: 'POST', body }),
  },
  upload: ({ file }) => {
    const body = new FormData();
    body.append('file', file);
    return request('/uploads', { method: 'POST', body });
  },
  uploadDocument: (file, tripId) => {
    const body = new FormData();
    body.append('file', file);
    return request('/uploads/document', { method: 'POST', body, headers: tripId ? { 'X-Trip-ID': tripId } : {} });
  },
  extractStay: body => request('/ai/stay-extraction', { method: 'POST', body }),
  wallet: {
    list: tripId => request(`/trips/${encodeURIComponent(tripId)}/wallet`),
    save: (tripId, itemId, body) => request(`/trips/${encodeURIComponent(tripId)}/wallet/items${itemId ? '/' + encodeURIComponent(itemId) : ''}`, { method:itemId ? 'PATCH' : 'POST',body }),
    upload: (file, tripId) => { const body = new FormData(); body.append('file',file); return request('/uploads/wallet',{method:'POST',body,headers:tripId?{'X-Trip-ID':tripId}:{}}); },
    extract: body => request('/ai/wallet-extraction',{method:'POST',body}),
  },
  sharedTrip: token => request(`/shared/${encodeURIComponent(token)}`),
  shareTrip: (id, body) => request(`/trips/${encodeURIComponent(id)}/share`, { method: 'POST', body }),
  shareUrl: id => request(`/trips/${encodeURIComponent(id)}/share-url`),
  mealOptions: (id,meal,refresh=false) => request(`/trips/${encodeURIComponent(id)}/meals/${encodeURIComponent(meal)}/options`,{method:'POST',body:{refresh}}),
  chooseMeal: (id,meal,body) => request(`/trips/${encodeURIComponent(id)}/meals/${encodeURIComponent(meal)}/choice`,{method:'POST',body}),
  getItinerary: id => request(`/trips/${encodeURIComponent(id)}/itinerary`),
  interactiveMap: id => request(`/trips/${encodeURIComponent(id)}/interactive-map`),
  tripWeather: id => request(`/trips/${encodeURIComponent(id)}/weather`),
  tripEssentials: (id,passport=null) => request(`/trips/${encodeURIComponent(id)}/essentials${passport?'?passport='+encodeURIComponent(passport):''}`),
  refreshTripEssentials: (id,passport=null) => request(`/trips/${encodeURIComponent(id)}/essentials/refresh`,{method:'POST',body:{passport},silent:true}),
  downloadEssentialsPdf: (id,passport=null) => downloadTripFile(`/api/trips/${encodeURIComponent(id)}/essentials/pdf${passport?'?passport='+encodeURIComponent(passport):''}`,'TripNexa-Before-You-Go.pdf'),
  downloadCalendar: (id,{days=[],includeTransfers=true}={}) => downloadTripFile(`/api/trips/${encodeURIComponent(id)}/calendar?${new URLSearchParams({...(days.length?{days:days.join(',')}:{}),transfers:String(includeTransfers)})}`,'TripNexa-itinerary.ics'),
  tripHealth: id => request(`/trips/${encodeURIComponent(id)}/health`),
  repairTrip: (id,action,token=undefined) => request(`/trips/${encodeURIComponent(id)}/repair/${action}`,{method:'POST',body:{token},silent:true}),
  buildItinerary: (id, body = {}) => request(`/trips/${encodeURIComponent(id)}/itinerary`, { method: 'POST', body }),
  editItinerary: (id, body) => request(`/trips/${encodeURIComponent(id)}/itinerary/edit`, { method: 'POST', body }),
  previewItinerary: (id, body) => request(`/trips/${encodeURIComponent(id)}/itinerary/preview`, { method:'POST', body }),
  applyItinerary: (id, token) => request(`/trips/${encodeURIComponent(id)}/itinerary/apply`, { method:'POST', body:{token} }),
  downloadItinerary: (id,{format='quick',passport=null}={}) => downloadTripFile(`/api/trips/${encodeURIComponent(id)}/itinerary/pdf${format==='full'?'/full':''}${passport?'?passport='+encodeURIComponent(passport):''}`,format==='full'?'TripNexa-Full-Travel-Book.pdf':'TripNexa-itinerary.pdf'),
  savePlanning: (id, collection, items) => request(`/trips/${encodeURIComponent(id)}/planning/${collection}`, { method: 'PUT', body: { items } }),
  config: () => request('/config'),
  places: {
    resolve: (body, signal) => request('/places/resolve', { method:'POST', body, signal }),
    photos: (id, signal) => request(`/places/${encodeURIComponent(id)}/photos`, { signal }),
    autocomplete: (body, signal) => request('/places/autocomplete', { method: 'POST', body, signal }),
    details: (body, signal) => request('/places/details', { method: 'POST', body, signal }),
  },
};
